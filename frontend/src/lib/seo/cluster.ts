import "server-only";

import { run } from "./db";
import { chatJson, cosineSimilarity, embed, getLastEmbeddingError } from "./openai";
import type { Intent, PageType } from "./types";

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

const EMBEDDING_BATCH_SIZE = 96;
const LLM_BATCH_SIZE = 70;
const MAX_CLUSTER_KEYWORDS = 80;
const DEFAULT_SEMANTIC_THRESHOLD = 0.82;
const MIN_STANDALONE_FREQUENCY = 700;

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
  if (/экскаватор|погрузчик/u.test(text)) return { key: "equipment-excavator", name: "аренда экскаватора", family: "commercial" };
  if (/манипулятор/u.test(text)) return { key: "equipment-manipulator", name: "аренда манипулятора", family: "commercial" };
  if (/автовыш/u.test(text)) return { key: "equipment-lift", name: "аренда автовышки", family: "commercial" };
  if (/самосвал/u.test(text)) return { key: "equipment-dump-truck", name: "аренда самосвала", family: "commercial" };
  if (/вывоз грунт/u.test(text)) return { key: "task-soil-removal", name: "вывоз грунта", family: "commercial" };
  if (/вывоз снег/u.test(text)) return { key: "task-snow-removal", name: "вывоз снега", family: "commercial" };
  if (/москв|московск|подмосков/u.test(text)) return { key: "geo-moscow", name: "аренда спецтехники в Москве и области", family: "commercial" };
  if (/цен|стоим|сколько|прайс|руб|(^|\s)час(а|ов)?(\s|$)/u.test(text)) return { key: "price", name: "стоимость аренды спецтехники", family: "commercial" };
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

async function buildLlmClusters(rows: NormRow[]): Promise<DraftCluster[] | null> {
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
          "Ты SEO-аналитик для сайта аренды спецтехники. Разбей поисковые запросы на смысловые кластеры уровня одной страницы или одной статьи. Не делай общий кластер 'спецтехника', если внутри есть разные темы: аренда, цена, ремонт, продажа, документы, виды техники, конкретные машины, маркетплейсы, вопросы. Коммерческие, информационные и сравнительные запросы не смешивай. Верни JSON: {\"clusters\":[{\"key\":\"latin-kebab-key\",\"name\":\"короткое название\",\"ids\":[1,2]}]}. Каждый id должен быть ровно в одном кластере.",
        user: JSON.stringify({
          intent_family: family,
          region: batch[0]?.region ?? null,
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
          guardrails: ["intent_family", "region", "business_entity_compatibility"],
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

  const llmClusters = await buildLlmClusters(rows);
  if (llmClusters) {
    const created = await persistDraftClusters(
      splitOversizedClusters(mergeSeoBuckets(consolidateDraftClusters(llmClusters))),
      "ai_llm",
      Boolean(options.rebuild),
    );
    return { created, method: "ai_llm" };
  }

  if (options.requireAi) {
    throw new Error("LLM-кластеризация недоступна: модель не вернула корректный JSON. Проверьте OPENAI_MODEL_CLUSTER.");
  }

  const semanticClusters = await buildSemanticClusters(rows);
  if (semanticClusters) {
    const created = await persistDraftClusters(
      splitOversizedClusters(mergeSeoBuckets(consolidateDraftClusters(semanticClusters))),
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

  const ruleClusters = buildRuleClusters(rows);
  const created = await persistDraftClusters(consolidateDraftClusters(ruleClusters), "rules", Boolean(options.rebuild));
  return { created, method: "rules" };
}