import "server-only";

import { run } from "./db";
import { loadContext, normalizeContextType } from "./seed";
import { chatJson, cosineSimilarity, embed, getLastChatError, getLastEmbeddingError } from "./openai";
import type { CompanyContext, Intent, PageType } from "./types";

/**
 * AI semantic keyword clusterizer.
 *
 * Primary path: OpenAI embeddings over raw query text + SEO guardrails
 * (intent family, region, business entity compatibility). This is the best
 * no-SERP option: it groups by meaning rather than by the first detected word.
 *
 * If embeddings are not available for the OpenAI project, the second AI path is
 * batch LLM clustering: the model groups query IDs into page-level topics.
 * Deterministic grouping is kept only for non-AI pipeline runs.
 */

function envPositiveInt(name: string, fallback: number): number {
  const raw = Number(process.env[name] ?? "");
  if (!Number.isFinite(raw) || raw <= 0) return fallback;
  return Math.trunc(raw);
}

const EMBEDDING_BATCH_SIZE = 96;
const LLM_BATCH_SIZE = 70;
const MAX_CLUSTER_KEYWORDS = 80;
const DEFAULT_SEMANTIC_THRESHOLD = 0.82;
const MIN_STANDALONE_FREQUENCY = envPositiveInt("SEO_MIN_STANDALONE_FREQUENCY", 150);
const SINGLETON_HOLDBACK_FREQUENCY = envPositiveInt("SEO_SINGLETON_HOLDBACK_FREQUENCY", 30);

type NormRow = {
  id: number;
  keyword: string;
  normalized_keyword: string;
  frequency: number;
  region: string | null;
  modifiers: string[];
  detected_service: string[];
  detected_task: string[];
  detected_geo: string[];
  detected_intent: Intent | null;
  embedding: unknown | null;
};

export type ClusterizeMethod = "ai_embeddings" | "ai_llm" | "rules" | "none";

export type ClusterizeResult = {
  created: number;
  method: ClusterizeMethod;
};

export type ClusterizeOptions = {
  /** Rebuild active keyword->cluster links without deleting already generated articles. */
  rebuild?: boolean;
  /** Do not silently fall back to old rule grouping when a user explicitly asks for AI. */
  requireAi?: boolean;
  /** Manager-facing best mode: require real embedding vectors, no chat fallback. */
  requireEmbeddings?: boolean;
};

type DraftCluster = {
  rows: NormRow[];
  embeddings: number[][];
  centroid: number[];
  primary: NormRow;
  primaryEmbedding: number[];
  family: string;
  region: string | null;
  entities: Set<string>;
  threshold: number;
  llmName?: string;
  llmKey?: string;
};

type SeoBucket = {
  key: string;
  name: string;
  family: string;
};

type LlmClusterResponse = {
  clusters?: {
    key?: string;
    name?: string;
    ids?: number[];
  }[];
};

function intentFamily(intent: Intent | null): string {
  if (!intent) return "unknown";
  if (intent.startsWith("commercial")) return intent === "commercial_comparison" ? "comparison" : "commercial";
  if (intent.startsWith("informational")) return "informational";
  if (intent === "faq") return "faq";
  return intent;
}

function pageTypeForGroup(family: string, hasGeo: boolean): PageType {
  switch (family) {
    case "commercial":
      return hasGeo ? "local_page" : "service";
    case "comparison":
      return "comparison";
    case "informational":
      return "article";
    case "faq":
      return "faq";
    default:
      return "article";
  }
}

function semanticThreshold(family: string): number {
  const raw = Number(process.env.SEO_CLUSTER_SIMILARITY_THRESHOLD ?? "");
  if (Number.isFinite(raw) && raw > 0 && raw < 1) return raw;
  switch (family) {
    case "comparison":
      return 0.86;
    case "commercial":
      return 0.84;
    case "informational":
    case "faq":
      return 0.82;
    default:
      return DEFAULT_SEMANTIC_THRESHOLD;
  }
}

function mainIntentForGroup(rows: NormRow[]): Intent {
  const counts = new Map<Intent, number>();
  for (const row of rows) {
    if (!row.detected_intent) continue;
    counts.set(row.detected_intent, (counts.get(row.detected_intent) ?? 0) + 1);
  }
  let best: Intent = "commercial_service";
  let bestCount = -1;
  for (const [intent, count] of counts) {
    if (count > bestCount) {
      best = intent;
      bestCount = count;
    }
  }
  return best;
}

function roleFor(row: NormRow, isPrimary: boolean): string {
  if (isPrimary) return "primary";
  if (row.modifiers.includes("question")) return "question";
  if (row.detected_geo.length > 0) return "geo";
  if (row.modifiers.includes("commercial") || row.modifiers.includes("price")) return "commercial";
  return "secondary";
}

function rowEntities(row: NormRow): string[] {
  return [...row.detected_service, ...row.detected_task]
    .map((entity) => entity.trim().toLowerCase())
    .filter(Boolean);
}

function compatibleEntities(row: NormRow, cluster: DraftCluster, similarity: number): boolean {
  const entities = rowEntities(row);
  if (entities.length === 0 || cluster.entities.size === 0) return true;
  if (entities.some((entity) => cluster.entities.has(entity))) return true;

  // Very strong semantic similarity can override dictionary mismatch. This
  // catches synonyms while still preventing broad equipment merges.
  return similarity >= 0.88;
}

function partitionKey(row: NormRow): string {
  const family = intentFamily(row.detected_intent);
  const region = row.region?.trim().toLowerCase() ?? "";
  return `${family}|${region}`;
}

function embeddingText(row: NormRow): string {
  const parts = [
    `Запрос: ${row.keyword}`,
    `Нормализация: ${row.normalized_keyword}`,
    `Интент: ${row.detected_intent ?? "unknown"}`,
  ];
  if (row.detected_service.length > 0) parts.push(`Услуга: ${row.detected_service.join(", ")}`);
  if (row.detected_task.length > 0) parts.push(`Задача: ${row.detected_task.join(", ")}`);
  if (row.detected_geo.length > 0) parts.push(`Гео в запросе: ${row.detected_geo.join(", ")}`);
  if (row.region) parts.push(`Регион: ${row.region}`);
  if (row.modifiers.length > 0) parts.push(`Модификаторы: ${row.modifiers.join(", ")}`);
  return parts.join("\n");
}

function normalizeLlmKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/giu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function fallbackTopicKey(row: NormRow): string {
  const text = row.keyword.toLowerCase();
  if (/ремонт|сервис|запчаст|техобслуж/u.test(text)) return "repair";
  if (/продаж|купить|\bбу\b|б\/у|авито|дром/u.test(text)) return "sale-marketplaces";
  if (/гостехнадзор|регистрац|уч[её]т|удостоверен|документ|номер|страхов/u.test(text)) return "documents-registration";
  if (/виды|тип|класс|классификац|назван/u.test(text)) return "types-classification";
  if (/фото|картин|изображен|игрушк|мультик/u.test(text)) return "media";
  if (/экскаватор/u.test(text)) return "excavator";
  if (/бульдозер/u.test(text)) return "bulldozer";
  if (/манипулятор/u.test(text)) return "manipulator";
  if (/автовыш|подъемник|подъ[её]мник/u.test(text)) return "lift";
  if (/самосвал|грузов|тягач/u.test(text)) return "truck";
  if (/аренд|снять|заказать|услуг/u.test(text)) return "rent-service";
  return normalizeLlmKey(row.normalized_keyword.split(" ").slice(0, 3).join("-")) || `keyword-${row.id}`;
}

function seoBucketFor(row: NormRow): SeoBucket | null {
  const text = row.keyword.toLowerCase();
  const isEstimateOrNormative = /смет|гэсн|фер|тер|расцен|норматив|норма/u.test(text);
  const isCompactionTechnology = /проход|толщин|глубин|схем|производительн|уплотнен/u.test(text);
  const isRentalContext = /аренд|снять|заказ|услуг|экипаж|почас|смена|сутк/u.test(text);
  const hasPriceSignal = /цен|стоим|прайс|руб|тариф|(^|\s)час(а|ов)?(\s|$)/u.test(text);

  if (/экскаватор|погрузчик/u.test(text)) return { key: "equipment-excavator", name: "аренда экскаватора", family: "commercial" };
  if (/манипулятор/u.test(text)) return { key: "equipment-manipulator", name: "аренда манипулятора", family: "commercial" };
  if (/автовыш/u.test(text)) return { key: "equipment-lift", name: "аренда автовышки", family: "commercial" };
  if (/самосвал/u.test(text)) return { key: "equipment-dump-truck", name: "аренда самосвала", family: "commercial" };
  if (/вывоз грунт/u.test(text)) return { key: "task-soil-removal", name: "вывоз грунта", family: "commercial" };
  if (/вывоз снег/u.test(text)) return { key: "task-snow-removal", name: "вывоз снега", family: "commercial" };
  if (/москв|московск|подмосков/u.test(text)) return { key: "geo-moscow", name: "аренда спецтехники в Москве и области", family: "commercial" };
  if (hasPriceSignal && isRentalContext && !isEstimateOrNormative && !isCompactionTechnology) {
    return { key: "price", name: "стоимость аренды спецтехники", family: "commercial" };
  }
  if (/экипаж/u.test(text)) return { key: "crew", name: "аренда спецтехники с экипажем", family: "commercial" };
  if (/нужн|заказ|под заказ|сейчас|снять/u.test(text)) return { key: "order", name: "заказать спецтехнику", family: "commercial" };
  return null;
}

function parseEmbedding(value: unknown): number[] | null {
  if (!value) return null;
  const parsed = typeof value === "string" ? (JSON.parse(value) as unknown) : value;
  if (!Array.isArray(parsed)) return null;
  const numbers = parsed.filter((item): item is number => typeof item === "number" && Number.isFinite(item));
  return numbers.length === parsed.length && numbers.length > 0 ? numbers : null;
}

async function ensureEmbeddings(rows: NormRow[]): Promise<Map<number, number[]> | null> {
  const vectors = new Map<number, number[]>();
  const missing: NormRow[] = [];

  for (const row of rows) {
    try {
      const existing = parseEmbedding(row.embedding);
      if (existing) vectors.set(row.id, existing);
      else missing.push(row);
    } catch {
      missing.push(row);
    }
  }

  for (let start = 0; start < missing.length; start += EMBEDDING_BATCH_SIZE) {
    const batch = missing.slice(start, start + EMBEDDING_BATCH_SIZE);
    const embedded = await embed(batch.map(embeddingText));
    if (!embedded || embedded.length !== batch.length) return null;

    for (let index = 0; index < batch.length; index += 1) {
      const row = batch[index];
      const vector = embedded[index];
      vectors.set(row.id, vector);
      await run(`UPDATE seo.normalized_keywords SET embedding = $1::jsonb WHERE id = $2`, [
        JSON.stringify(vector),
        row.id,
      ]);
    }
  }

  return vectors;
}

function makeDraftCluster(row: NormRow, vector: number[], family: string): DraftCluster {
  return {
    rows: [row],
    embeddings: [vector],
    centroid: vector,
    primary: row,
    primaryEmbedding: vector,
    family,
    region: row.region,
    entities: new Set(rowEntities(row)),
    threshold: semanticThreshold(family),
  };
}

function makeRowsDraftCluster(rows: NormRow[], family: string, llmKey?: string, llmName?: string): DraftCluster {
  const sorted = [...rows].sort((a, b) => b.frequency - a.frequency);
  const primary = sorted[0];
  return {
    rows: sorted,
    embeddings: [],
    centroid: [],
    primary,
    primaryEmbedding: [],
    family,
    region: primary.region,
    entities: new Set(sorted.flatMap(rowEntities)),
    threshold: 0,
    llmKey,
    llmName,
  };
}

function shouldKeepStandalone(cluster: DraftCluster): boolean {
  if (cluster.rows.length > 1) return true;
  const row = cluster.primary;
  if ((row.frequency ?? 0) >= MIN_STANDALONE_FREQUENCY) return true;
  return Boolean(seoBucketFor(row));
}

function mergeSeoBuckets(clusters: DraftCluster[]): DraftCluster[] {
  const grouped = new Map<string, { bucket: SeoBucket; rows: NormRow[] }>();
  const passthrough: DraftCluster[] = [];

  for (const cluster of clusters) {
    const unbucketed: NormRow[] = [];

    for (const row of cluster.rows) {
      const bucket = seoBucketFor(row);
      if (!bucket) {
        unbucketed.push(row);
        continue;
      }

      const existing = grouped.get(bucket.key) ?? { bucket, rows: [] };
      existing.rows.push(row);
      grouped.set(bucket.key, existing);
    }

    if (unbucketed.length > 0) {
      const remainingCluster = makeRowsDraftCluster(unbucketed, cluster.family, cluster.llmKey, cluster.llmName);
      if (shouldKeepStandalone(remainingCluster)) passthrough.push(remainingCluster);
    }
  }

  const merged = [...grouped.values()].map(({ bucket, rows }) =>
    makeRowsDraftCluster(rows, bucket.family, bucket.key, bucket.name),
  );

  return [...merged, ...passthrough].sort((a, b) => {
    const aFrequency = a.rows.reduce((sum, row) => sum + (row.frequency || 0), 0);
    const bFrequency = b.rows.reduce((sum, row) => sum + (row.frequency || 0), 0);
    return bFrequency - aFrequency;
  });
}

function addToDraftCluster(cluster: DraftCluster, row: NormRow, vector: number[]): void {
  const count = cluster.embeddings.length;
  cluster.centroid = cluster.centroid.map((value, index) => (value * count + vector[index]) / (count + 1));
  cluster.embeddings.push(vector);
  cluster.rows.push(row);
  for (const entity of rowEntities(row)) cluster.entities.add(entity);
  if ((row.frequency ?? 0) > (cluster.primary.frequency ?? 0)) {
    cluster.primary = row;
    cluster.primaryEmbedding = vector;
  }
}

async function buildSemanticClusters(rows: NormRow[]): Promise<DraftCluster[] | null> {
  const vectors = await ensureEmbeddings(rows);
  if (!vectors) return null;

  const partitions = new Map<string, NormRow[]>();
  for (const row of rows) {
    const key = partitionKey(row);
    const list = partitions.get(key) ?? [];
    list.push(row);
    partitions.set(key, list);
  }

  const clusters: DraftCluster[] = [];
  for (const groupRows of partitions.values()) {
    const sorted = [...groupRows].sort((a, b) => b.frequency - a.frequency);
    const groupClusters: DraftCluster[] = [];

    for (const row of sorted) {
      const vector = vectors.get(row.id);
      if (!vector) return null;
      const family = intentFamily(row.detected_intent);
      let best: { cluster: DraftCluster; similarity: number } | null = null;

      for (const cluster of groupClusters) {
        const similarity = Math.max(
          cosineSimilarity(vector, cluster.centroid),
          cosineSimilarity(vector, cluster.primaryEmbedding),
        );
        if (similarity >= cluster.threshold && compatibleEntities(row, cluster, similarity)) {
          if (!best || similarity > best.similarity) best = { cluster, similarity };
        }
      }

      if (best) addToDraftCluster(best.cluster, row, vector);
      else groupClusters.push(makeDraftCluster(row, vector, family));
    }

    clusters.push(...groupClusters);
  }

  return clusters;
}

function splitOversizedClusters(clusters: DraftCluster[]): DraftCluster[] {
  const result: DraftCluster[] = [];
  for (const cluster of clusters) {
    if (cluster.rows.length <= MAX_CLUSTER_KEYWORDS) {
      result.push(cluster);
      continue;
    }

    const buckets = new Map<string, NormRow[]>();
    for (const row of cluster.rows) {
      const key = fallbackTopicKey(row);
      const list = buckets.get(key) ?? [];
      list.push(row);
      buckets.set(key, list);
    }

    for (const [key, bucketRows] of buckets) {
      for (let start = 0; start < bucketRows.length; start += MAX_CLUSTER_KEYWORDS) {
        const slice = bucketRows.slice(start, start + MAX_CLUSTER_KEYWORDS);
        result.push(makeRowsDraftCluster(slice, cluster.family, `${cluster.llmKey ?? "oversized"}-${key}`, cluster.llmName));
      }
    }
  }
  return result;
}

function isLikelySingletonBridgeWord(keyword: string): boolean {
  const text = keyword.toLowerCase();
  return /^(что|как|какой|какая|какие|когда|где|зачем|почему|для|по|при|на|о)\b/u.test(text);
}

function topicSignature(row: NormRow): string {
  const service = row.detected_service.map((item) => item.trim().toLowerCase()).filter(Boolean).slice(0, 2).join("|");
  const task = row.detected_task.map((item) => item.trim().toLowerCase()).filter(Boolean).slice(0, 2).join("|");
  const bucket = seoBucketFor(row)?.key ?? "";
  const family = intentFamily(row.detected_intent);
  if (bucket) return `${family}|bucket:${bucket}`;
  if (service || task) return `${family}|service:${service}|task:${task}`;
  return `${family}|fallback:${fallbackTopicKey(row)}`;
}

function singletonCanBeSecondary(row: NormRow): boolean {
  const bucket = seoBucketFor(row);
  if (bucket?.key === "price" || bucket?.key === "geo-moscow") return false;
  if (isLikelySingletonBridgeWord(row.keyword)) return true;

  const text = row.keyword.toLowerCase();
  if (/вес|схема|глубина|толщина|разборка|подключение|управление|виды|типы/u.test(text)) return true;
  return false;
}

function findBestSingletonMergeTarget(singleton: DraftCluster, candidates: DraftCluster[]): DraftCluster | null {
  const row = singleton.primary;
  if (!singletonCanBeSecondary(row)) return null;

  const sig = topicSignature(row);
  let best: { cluster: DraftCluster; score: number } | null = null;

  for (const candidate of candidates) {
    if (candidate === singleton) continue;
    if (candidate.rows.length < 2) continue;
    if (candidate.family !== singleton.family) continue;
    if ((candidate.region ?? "") !== (singleton.region ?? "")) continue;

    const candidateSig = topicSignature(candidate.primary);
    let score = 0;
    if (candidateSig === sig) score += 3;

    const sharedEntities = rowEntities(row).filter((entity) => candidate.entities.has(entity)).length;
    if (sharedEntities > 0) score += 2;

    const rowText = row.keyword.toLowerCase();
    const primaryText = candidate.primary.keyword.toLowerCase();
    if (rowText.includes(primaryText) || primaryText.includes(rowText)) score += 1;

    if ((candidate.primary.frequency ?? 0) >= MIN_STANDALONE_FREQUENCY) score += 1;
    if (!best || score > best.score) best = { cluster: candidate, score };
  }

  if (!best || best.score < 3) return null;
  return best.cluster;
}

function applyAiSingletonPolicy(clusters: DraftCluster[]): DraftCluster[] {
  const working = clusters.map((cluster) => makeRowsDraftCluster(cluster.rows, cluster.family, cluster.llmKey, cluster.llmName));
  const keep: DraftCluster[] = [];
  const holdbackRows: NormRow[] = [];

  for (const cluster of working) {
    if (cluster.rows.length > 1) {
      keep.push(cluster);
      continue;
    }

    const row = cluster.primary;
    const frequency = row.frequency ?? 0;
    const strongStandalone = frequency >= MIN_STANDALONE_FREQUENCY || Boolean(seoBucketFor(row));
    if (strongStandalone) {
      keep.push(cluster);
      continue;
    }

    const mergeTarget = findBestSingletonMergeTarget(cluster, working);
    if (mergeTarget) {
      mergeTarget.rows.push(row);
      mergeTarget.rows.sort((a, b) => b.frequency - a.frequency);
      mergeTarget.primary = mergeTarget.rows[0];
      for (const entity of rowEntities(row)) mergeTarget.entities.add(entity);
      continue;
    }

    if (frequency < SINGLETON_HOLDBACK_FREQUENCY) {
      holdbackRows.push(row);
      continue;
    }

    keep.push(cluster);
  }

  if (holdbackRows.length > 0) {
    keep.push(makeRowsDraftCluster(holdbackRows, "informational", "holdback-singletons", "Холдбек одиночных запросов"));
  }

  const cleaned = keep
    .map((cluster) => {
      const dedup = new Map<number, NormRow>();
      for (const row of cluster.rows) dedup.set(row.id, row);
      return makeRowsDraftCluster([...dedup.values()], cluster.family, cluster.llmKey, cluster.llmName);
    })
    .filter((cluster) => cluster.rows.length > 0)
    .sort((a, b) => {
      const aFrequency = a.rows.reduce((sum, row) => sum + (row.frequency || 0), 0);
      const bFrequency = b.rows.reduce((sum, row) => sum + (row.frequency || 0), 0);
      return bFrequency - aFrequency;
    });

  return cleaned;
}

function isEstimateOrNormativeRow(row: NormRow): boolean {
  return /смет|гэсн|фер|тер|расцен|норматив|норма/u.test(row.keyword.toLowerCase());
}

function isCompactionTechnologyRow(row: NormRow): boolean {
  return /проход|толщин|глубин|схем|производительн|уплотнен/u.test(row.keyword.toLowerCase());
}

function isRentalCommercialRow(row: NormRow): boolean {
  return /аренд|снять|заказ|услуг|экипаж|почас|смена|сутк|цена аренды/u.test(row.keyword.toLowerCase());
}

function splitMixedAiThemes(clusters: DraftCluster[]): DraftCluster[] {
  const output: DraftCluster[] = [];

  for (const cluster of clusters) {
    const rows = cluster.rows;
    if (rows.length <= 1) {
      output.push(cluster);
      continue;
    }

    const normativeRows = rows.filter(isEstimateOrNormativeRow);
    const nonNormativeRows = rows.filter((row) => !isEstimateOrNormativeRow(row));

    const hasNormativeConflict = normativeRows.length > 0 && nonNormativeRows.length > 0;

    const technologyRows = nonNormativeRows.filter(isCompactionTechnologyRow);
    const rentalRows = nonNormativeRows.filter(isRentalCommercialRow);
    const hasTechRentalConflict = technologyRows.length > 0 && rentalRows.length > 0;

    if (!hasNormativeConflict && !hasTechRentalConflict) {
      output.push(cluster);
      continue;
    }

    const bucketNormative = normativeRows;
    const bucketTechnology = nonNormativeRows.filter(
      (row) => isCompactionTechnologyRow(row) && !isRentalCommercialRow(row),
    );
    const bucketRental = nonNormativeRows.filter(
      (row) => isRentalCommercialRow(row) && !isCompactionTechnologyRow(row),
    );
    const bucketMixed = nonNormativeRows.filter(
      (row) => isCompactionTechnologyRow(row) && isRentalCommercialRow(row),
    );
    const bucketOther = nonNormativeRows.filter(
      (row) => !isCompactionTechnologyRow(row) && !isRentalCommercialRow(row),
    );

    const baseKey = cluster.llmKey || fallbackTopicKey(cluster.primary);
    const pushBucket = (bucketRows: NormRow[], suffix: string, hint?: string) => {
      if (bucketRows.length === 0) return;
      output.push(makeRowsDraftCluster(bucketRows, cluster.family, `${baseKey}-${suffix}`, hint));
    };

    pushBucket(bucketNormative, "normative", "Сметы и расценки");
    pushBucket(bucketTechnology, "technology", "Технология работ");
    pushBucket(bucketRental, "rental", "Аренда и заказ");
    pushBucket(bucketMixed, "mixed");
    pushBucket(bucketOther, "other");
  }

  return output;
}

function finalizeAiDraftClusters(clusters: DraftCluster[]): DraftCluster[] {
  return splitOversizedClusters(
    applyAiSingletonPolicy(
      splitOversizedClusters(
        splitMixedAiThemes(consolidateDraftClusters(clusters)),
      ),
    ),
  );
}

function compactCompanyContext(context: CompanyContext[]): Array<{ type: string; point: string; value: string; note?: string }> {
  const out: Array<{ type: string; point: string; value: string; note?: string }> = [];

  for (const row of context.slice(0, 60)) {
    const value = String(row.name || "").trim();
    if (!value) continue;
    const point = String(row.context_type || "").trim();
    const noteRaw = typeof row.description === "string" ? row.description.trim() : "";
    out.push({
      type: normalizeContextType(point),
      point,
      value,
      note: noteRaw ? noteRaw.slice(0, 220) : undefined,
    });
  }

  return out;
}

async function buildLlmClusters(rows: NormRow[]): Promise<DraftCluster[] | null> {
  const companyContext = compactCompanyContext(await loadContext().catch(() => []));
  const partitions = new Map<string, NormRow[]>();
  for (const row of rows) {
    const key = partitionKey(row);
    const list = partitions.get(key) ?? [];
    list.push(row);
    partitions.set(key, list);
  }

  const grouped = new Map<string, { rows: NormRow[]; family: string; name?: string; key: string }>();

  for (const [partition, groupRows] of partitions) {
    const family = partition.split("|")[0];
    const sorted = [...groupRows].sort((a, b) => b.frequency - a.frequency);

    for (let start = 0; start < sorted.length; start += LLM_BATCH_SIZE) {
      const batch = sorted.slice(start, start + LLM_BATCH_SIZE);
      const byId = new Map(batch.map((row) => [row.id, row]));
      const response = await chatJson<LlmClusterResponse>({
        modelSlot: "cluster",
        system:
          "Ты SEO-аналитик. Разбей поисковые запросы на смысловые кластеры уровня одной страницы или одной статьи. " +
          "Учитывай бизнес-контекст компании из поля company_context: какие услуги/техника/регионы релевантны, какие темы исключены. " +
          "Не делай общий кластер 'спецтехника', если внутри есть разные темы: аренда, цена, ремонт, продажа, документы, виды техники, конкретные машины, маркетплейсы, вопросы. " +
          "Критично: не смешивай сметно-нормативные запросы (смета, расценка, ГЭСН, ФЕР, ТЕР) с коммерческой арендой. " +
          "Критично: не смешивай технологию работ (проходы катка, толщина слоя, схема уплотнения, производительность) с ценой аренды. " +
          "Коммерческие, информационные и сравнительные запросы не смешивай. " +
          "Если в партии есть несколько разных подтем, создай несколько отдельных кластеров (лучше 2-6 точных кластеров, чем 1 общий). " +
          "Верни JSON: {\"clusters\":[{\"key\":\"latin-kebab-key\",\"name\":\"короткое название\",\"ids\":[1,2]}]}. Каждый id должен быть ровно в одном кластере.",
        user: JSON.stringify({
          intent_family: family,
          region: batch[0]?.region ?? null,
          company_context: companyContext,
          queries: batch.map((row) => ({
            id: row.id,
            keyword: row.keyword,
            frequency: row.frequency,
            intent: row.detected_intent,
            services: row.detected_service,
            tasks: row.detected_task,
            modifiers: row.modifiers,
          })),
        }),
      });
      if (!response?.clusters || !Array.isArray(response.clusters)) return null;

      const assigned = new Set<number>();
      for (const llmCluster of response.clusters) {
        const ids = Array.isArray(llmCluster.ids) ? llmCluster.ids : [];
        const rowsForCluster = ids.map((id) => byId.get(id)).filter((row): row is NormRow => Boolean(row));
        if (rowsForCluster.length === 0) continue;
        for (const row of rowsForCluster) assigned.add(row.id);

        const baseKey = normalizeLlmKey(llmCluster.key || llmCluster.name || rowsForCluster[0].normalized_keyword);
        const key = `${partition}|${baseKey || fallbackTopicKey(rowsForCluster[0])}`;
        const existing = grouped.get(key) ?? { rows: [], family, name: llmCluster.name, key: baseKey };
        existing.rows.push(...rowsForCluster);
        existing.name ||= llmCluster.name;
        grouped.set(key, existing);
      }

      for (const row of batch) {
        if (assigned.has(row.id)) continue;
        const topicKey = fallbackTopicKey(row);
        const fallbackKey = `${partition}|${topicKey}`;
        const existing = grouped.get(fallbackKey) ?? { rows: [], family, name: undefined, key: topicKey };
        existing.rows.push(row);
        grouped.set(fallbackKey, existing);
      }
    }
  }

  return splitOversizedClusters(
    [...grouped.values()].map((cluster) => makeRowsDraftCluster(cluster.rows, cluster.family, cluster.key, cluster.name)),
  );
}

function topicKeyForDraft(cluster: DraftCluster): string {
  if (cluster.llmKey) return cluster.llmKey;
  const primary = cluster.primary;
  const bucket = seoBucketFor(primary);
  if (bucket) return bucket.key;
  const service = primary.detected_service[0]?.trim().toLowerCase();
  if (service) return `service:${normalizeLlmKey(service)}`;
  const task = primary.detected_task[0]?.trim().toLowerCase();
  if (task) return `task:${normalizeLlmKey(task)}`;
  return `fallback:${fallbackTopicKey(primary)}`;
}

function consolidateDraftClusters(clusters: DraftCluster[]): DraftCluster[] {
  const grouped = new Map<string, NormRow[]>();

  for (const cluster of clusters) {
    const region = cluster.region?.trim().toLowerCase() ?? "";
    const key = `${cluster.family}|${region}|${topicKeyForDraft(cluster)}`;
    const list = grouped.get(key) ?? [];
    list.push(...cluster.rows);
    grouped.set(key, list);
  }

  return [...grouped.entries()].map(([key, rows]) => {
    const [family, , topic] = key.split("|");
    const uniqueRows = new Map<number, NormRow>();
    for (const row of rows) uniqueRows.set(row.id, row);
    return makeRowsDraftCluster([...uniqueRows.values()], family, topic);
  });
}

async function nameCluster(primaryKeyword: string, intent: Intent, samples: string[]): Promise<string> {
  const llm = await chatJson<{ name: string }>({
    modelSlot: "cheap",
    system:
      "Ты SEO-аналитик. Придумай короткое человекочитаемое название кластера поисковых запросов на русском (3-6 слов). Это НЕ заголовок страницы, а внутренняя метка смысла группы. Ответь строго JSON: {\"name\": \"...\"}.",
    user: `Интент: ${intent}\nГлавный запрос: ${primaryKeyword}\nПримеры запросов:\n${samples.slice(0, 12).join("\n")}`,
    maxTokens: 300,
  });
  return llm?.name?.trim() || primaryKeyword;
}

async function loadRows(rebuild: boolean): Promise<NormRow[]> {
  return run<NormRow>(
    `SELECT id, keyword, normalized_keyword, frequency, region, modifiers,
            detected_service, detected_task, detected_geo, detected_intent, embedding
     FROM seo.normalized_keywords
     WHERE is_relevant = TRUE
       AND ($1::boolean = TRUE OR (status = 'classified' AND cluster_id IS NULL))`,
    [rebuild],
  );
}

async function archiveActiveClusters(): Promise<void> {
  await run(
    `UPDATE seo.keyword_clusters
       SET status = 'archived', updated_at = NOW(),
           decision_log = decision_log || $1::jsonb
     WHERE status <> 'archived'`,
    [JSON.stringify({ archived_by: "ai_recluster", archived_at: new Date().toISOString() })],
  );
}

async function persistDraftClusters(
  draftClusters: DraftCluster[],
  method: Exclude<ClusterizeMethod, "none">,
  rebuild: boolean,
): Promise<number> {
  if (rebuild) await archiveActiveClusters();

  let created = 0;
  const nameCounts = new Map<string, number>();
  for (const draft of draftClusters) {
    const sorted = [...draft.rows].sort((a, b) => b.frequency - a.frequency);
    const primary = sorted[0];
    if (!primary) continue;

    const totalFrequency = sorted.reduce((sum, row) => sum + (row.frequency || 0), 0);
    const hasGeo = sorted.some((row) => row.detected_geo.length > 0) ||
      Boolean(draft.llmKey?.startsWith("geo-") || draft.llmKey?.startsWith("task-"));
    const mainIntent = mainIntentForGroup(sorted);
    const clusterType = pageTypeForGroup(draft.family, hasGeo);
    const isHoldbackCluster = Boolean(draft.llmKey?.startsWith("holdback-singletons"));
    const scoringRecommendedAction = isHoldbackCluster ? "no_action" : null;
    const scoringStatus = isHoldbackCluster ? "rejected" : null;
    const rawName = draft.llmName || await nameCluster(primary.keyword, mainIntent, sorted.map((row) => row.keyword));
    const nameKey = `${(primary.region ?? "").trim().toLowerCase()}|${rawName.trim().toLowerCase()}`;
    const nextCount = (nameCounts.get(nameKey) ?? 0) + 1;
    nameCounts.set(nameKey, nextCount);
    const name = nextCount > 1 ? `${rawName} (${nextCount})` : rawName;

    const cluster = await run<{ id: number }>(
      `INSERT INTO seo.keyword_clusters
        (cluster_name, main_intent, cluster_type, primary_keyword, total_frequency, region, status, decision_log)
       VALUES ($1,$2,$3,$4,$5,$6,'new',$7::jsonb) RETURNING id`,
      [
        name,
        mainIntent,
        clusterType,
        primary.keyword,
        totalFrequency,
        primary.region,
        JSON.stringify({
          clustering_method: method,
          semantic_threshold: method === "ai_embeddings" ? draft.threshold : null,
          llm_key: draft.llmKey ?? null,
          keyword_count: sorted.length,
          guardrails: [
            "intent_family",
            "region",
            "business_entity_compatibility",
            "ai_singleton_policy_merge_or_holdback",
          ],
          singleton_policy: isHoldbackCluster ? "holdback" : "keep_or_merge",
          recommended_action_override: scoringRecommendedAction,
          status_override: scoringStatus,
        }),
      ],
    );
    const clusterId = cluster[0].id;

    for (let index = 0; index < sorted.length; index += 1) {
      const row = sorted[index];
      const role = roleFor(row, index === 0);
      await run(
        `INSERT INTO seo.cluster_keywords (cluster_id, keyword_id, role, frequency)
         VALUES ($1,$2,$3,$4) ON CONFLICT (cluster_id, keyword_id) DO NOTHING`,
        [clusterId, row.id, role, row.frequency],
      );
      await run(`UPDATE seo.normalized_keywords SET cluster_id = $1, status = 'clustered' WHERE id = $2`, [
        clusterId,
        row.id,
      ]);
    }
    created += 1;
  }

  return created;
}

function buildRuleClusters(rows: NormRow[]): DraftCluster[] {
  const groups = new Map<string, NormRow[]>();
  for (const row of rows) {
    const entity = row.detected_service[0] ?? row.detected_task[0] ?? row.normalized_keyword.split(" ")[0] ?? "общее";
    const family = intentFamily(row.detected_intent);
    const region = row.region ?? "";
    const key = `${family}|${entity.toLowerCase()}|${region.toLowerCase()}`;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  return [...groups.entries()].map(([key, rows]) => {
    const sorted = [...rows].sort((a, b) => b.frequency - a.frequency);
    const primary = sorted[0];
    return {
      rows: sorted,
      embeddings: [],
      centroid: [],
      primary,
      primaryEmbedding: [],
      family: key.split("|")[0],
      region: primary.region,
      entities: new Set(sorted.flatMap(rowEntities)),
      threshold: 0,
    };
  });
}

/** Build clusters from relevant classified keywords. Uses AI semantic clustering first. */
export async function clusterize(options: ClusterizeOptions = {}): Promise<ClusterizeResult> {
  const rows = await loadRows(Boolean(options.rebuild));
  if (rows.length === 0) return { created: 0, method: "none" };

  const semanticClusters = await buildSemanticClusters(rows);
  if (semanticClusters) {
    const created = await persistDraftClusters(
      finalizeAiDraftClusters(semanticClusters),
      "ai_embeddings",
      Boolean(options.rebuild),
    );
    return { created, method: "ai_embeddings" };
  }

  if (options.requireEmbeddings) {
    const detail = getLastEmbeddingError();
    throw new Error(
      `Embedding-кластеризация недоступна. ${detail ?? "Проверьте доступ OPENAI_API_KEY к OPENAI_MODEL_EMBEDDING."}`,
    );
  }

  const llmClusters = await buildLlmClusters(rows);
  if (llmClusters) {
    const created = await persistDraftClusters(
      finalizeAiDraftClusters(llmClusters),
      "ai_llm",
      Boolean(options.rebuild),
    );
    return { created, method: "ai_llm" };
  }

  if (options.requireAi) {
    const embeddingDetail = getLastEmbeddingError() ?? "нет деталей embedding";
    const llmDetail = getLastChatError() ?? "нет деталей llm";
    throw new Error(
      `AI-кластеризация недоступна. embedding: ${embeddingDetail}; llm: ${llmDetail}`,
    );
  }

  const ruleClusters = buildRuleClusters(rows);
  const created = await persistDraftClusters(
    consolidateDraftClusters(mergeSeoBuckets(ruleClusters)),
    "rules",
    Boolean(options.rebuild),
  );
  return { created, method: "rules" };
}