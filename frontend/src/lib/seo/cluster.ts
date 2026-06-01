import "server-only";

import { run } from "./db";
import { chatJson, MODELS } from "./openai";
import type { Intent, PageType } from "./types";

/**
 * Clusterizer (Task.md §12). Hybrid grouping:
 *   1. Collapse intent into a family (commercial / informational / faq / comparison)
 *   2. Group by primary entity (service or task) + region + intent family
 *   3. Build one cluster per group → maps to one potential page
 * Cluster naming is refined by the LLM (cheap model) with a deterministic fallback.
 */

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

async function nameCluster(primaryKeyword: string, intent: Intent, samples: string[]): Promise<string> {
  const llm = await chatJson<{ name: string }>({
    model: MODELS.cheap,
    system:
      "Ты SEO-аналитик. Придумай короткое человекочитаемое название кластера поисковых запросов на русском (3-6 слов). Это НЕ заголовок страницы, а внутренняя метка смысла группы. Ответь строго JSON: {\"name\": \"...\"}.",
    user: `Интент: ${intent}\nГлавный запрос: ${primaryKeyword}\nПримеры запросов:\n${samples.slice(0, 12).join("\n")}`,
  });
  return llm?.name?.trim() || primaryKeyword;
}

/** Build clusters from unclustered, relevant, classified keywords. Returns created count. */
export async function clusterize(): Promise<number> {
  const rows = await run<NormRow>(
    `SELECT id, keyword, normalized_keyword, frequency, region, modifiers,
            detected_service, detected_task, detected_geo, detected_intent
     FROM seo.normalized_keywords
     WHERE is_relevant = TRUE AND status = 'classified' AND cluster_id IS NULL`,
  );

  // group by entity + region + intent family
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

  let created = 0;
  for (const [key, groupRows] of groups) {
    if (groupRows.length === 0) continue;
    const sorted = [...groupRows].sort((a, b) => b.frequency - a.frequency);
    const primary = sorted[0];
    const totalFrequency = sorted.reduce((sum, r) => sum + (r.frequency || 0), 0);
    const family = key.split("|")[0];
    const hasGeo = sorted.some((r) => r.detected_geo.length > 0);
    const mainIntent = mainIntentForGroup(sorted);
    const clusterType = pageTypeForGroup(family, hasGeo);
    const region = primary.region;
    const name = await nameCluster(primary.keyword, mainIntent, sorted.map((r) => r.keyword));

    const cluster = await run<{ id: number }>(
      `INSERT INTO seo.keyword_clusters
        (cluster_name, main_intent, cluster_type, primary_keyword, total_frequency, region, status)
       VALUES ($1,$2,$3,$4,$5,$6,'new') RETURNING id`,
      [name, mainIntent, clusterType, primary.keyword, totalFrequency, region],
    );
    const clusterId = cluster[0].id;

    for (let i = 0; i < sorted.length; i += 1) {
      const row = sorted[i];
      const role = roleFor(row, i === 0);
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
