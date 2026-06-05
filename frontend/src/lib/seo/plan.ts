import "server-only";

import { run } from "./db";
import { loadContext, normalizeContextType } from "./seed";
import { analyzeGap } from "./siteGap";
import { getScoringConfig } from "./settings";
import { qualifies, score, type ScoringInput } from "./scoring";
import type { CompanyContext, Intent, PageType, RecommendedAction } from "./types";

/**
 * Content plan generator (Task.md §15, §20). For each scored cluster it runs the
 * gap analysis + scoring model, picks a recommended action, and writes a
 * content_plan_item with a transparent decision log (Task.md §29).
 */

const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y",
  к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
  х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .split("")
    .map((ch) => TRANSLIT[ch] ?? ch)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .split("-")
    .slice(0, 6)
    .join("-");
}

type ClusterRow = {
  id: number;
  cluster_name: string | null;
  main_intent: Intent | null;
  cluster_type: PageType | null;
  primary_keyword: string | null;
  total_frequency: number;
  region: string | null;
};

type ContextSummary = {
  businessTopics: CompanyContext[];
  hasFaq: boolean;
  hasCase: boolean;
  hasAdvantage: boolean;
  regions: string[];
};

function summarizeContext(context: CompanyContext[]): ContextSummary {
  const typeOf = (row: CompanyContext) => normalizeContextType(row.context_type);
  return {
    businessTopics: context.filter(
      (c) =>
        typeOf(c) === "service" ||
        typeOf(c) === "service_category" ||
        typeOf(c) === "equipment_type" ||
        typeOf(c) === "task",
    ),
    hasFaq: context.some((c) => typeOf(c) === "faq"),
    hasCase: context.some((c) => typeOf(c) === "case"),
    hasAdvantage: context.some((c) => typeOf(c) === "advantage"),
    regions: context.filter((c) => typeOf(c) === "region").map((c) => c.name.toLowerCase()),
  };
}

function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .map((word) =>
      word
        .replace(/(ами|ями|ого|его|ому|ему|ыми|ими|ой|ей|ую|юю|ая|яя|ое|ее|ы|и|а|я|у|ю|е|ом|ем|ах|ях|ов|ев|ью)$/u, "")
        .trim(),
    )
    .filter((word) => word.length > 2);
}

function matchBusinessTopic(primaryKeyword: string, topics: CompanyContext[]): CompanyContext | null {
  const text = primaryKeyword.toLowerCase();
  const keywordTokens = new Set(normalizeWords(primaryKeyword));
  let best: { topic: CompanyContext; score: number } | null = null;
  for (const topic of topics) {
    const name = topic.name.toLowerCase();
    const topicTokens = normalizeWords(topic.name);
    if (topicTokens.length === 0) continue;

    const overlap = topicTokens.filter((token) => keywordTokens.has(token)).length;
    const score = text.includes(name) ? topicTokens.length + 2 : overlap;
    if (score >= Math.max(1, Math.ceil(topicTokens.length / 2)) && (!best || score > best.score)) {
      best = { topic, score };
    }
  }
  return best?.topic ?? null;
}

const ACTION_TO_STATUS: Record<RecommendedAction, string> = {
  create_new_page: "pending_review",
  update_existing_page: "pending_review",
  add_faq_to_existing_page: "pending_review",
  add_section_to_existing_page: "pending_review",
  merge_with_existing_cluster: "pending_review",
  no_action: "rejected",
  manual_review: "needs_more_data",
};

/** Generate content plan items for clusters that can be recalculated. Returns upserted count. */
export async function generatePlan(): Promise<number> {
  const config = await getScoringConfig();
  const context = await loadContext();
  const summary = summarizeContext(context);

  const clusters = await run<ClusterRow>(
    `SELECT id, cluster_name, main_intent, cluster_type, primary_keyword, total_frequency, region
      FROM seo.keyword_clusters WHERE status IN ('new', 'candidate', 'rejected')`,
  );

  let created = 0;
  for (const cluster of clusters) {
    const counts = await run<{ keyword_count: string; question_count: string }>(
      `SELECT COUNT(*) AS keyword_count,
              COUNT(*) FILTER (WHERE role = 'question') AS question_count
       FROM seo.cluster_keywords WHERE cluster_id = $1`,
      [cluster.id],
    );
    const keywordCount = Number(counts[0]?.keyword_count ?? 0);
    const questionCount = Number(counts[0]?.question_count ?? 0);

    const primaryKeyword = cluster.primary_keyword ?? cluster.cluster_name ?? "";
    const gap = await analyzeGap(primaryKeyword, cluster.main_intent);
    const matchedBusinessTopic = matchBusinessTopic(primaryKeyword, summary.businessTopics);

    const input: ScoringInput = {
      totalFrequency: cluster.total_frequency,
      keywordCount,
      questionCount,
      intent: cluster.main_intent,
      region: cluster.region,
      serviceInContext: Boolean(matchedBusinessTopic),
      serviceHasDescription: Boolean(matchedBusinessTopic?.description && matchedBusinessTopic.description.length > 30),
      regionServed: !cluster.region || summary.regions.length === 0 || summary.regions.includes(cluster.region.toLowerCase()),
      hasFaqData: summary.hasFaq,
      hasCaseData: summary.hasCase,
      hasAdvantageData: summary.hasAdvantage,
      gap,
    };

    const { scores, signals } = score(input, config);
    const passes = qualifies(scores, config);

    // recommended action: gap drives it, but reject if it fails thresholds
    let action: RecommendedAction = gap.recommended_action;
    if (!passes && action !== "manual_review") action = "no_action";

    const missingData: string[] = [];
    if (!matchedBusinessTopic) missingData.push("Нет подтверждённой услуги или задачи в контексте компании");
    if (!input.serviceHasDescription) missingData.push("Нет описания услуги");
    if (!summary.hasFaq && (cluster.main_intent === "faq" || questionCount > 0)) missingData.push("Нет данных FAQ");

    const status = passes ? ACTION_TO_STATUS[action] : "rejected";
    const pageType = cluster.cluster_type ?? "article";
    const proposedUrl = action === "create_new_page" ? `/${slugify(primaryKeyword)}/` : null;

    const decisionLog = {
      decision: action,
      passes_thresholds: passes,
      why: [
        gap.reason,
        input.serviceInContext ? "Связано с активной услугой или задачей" : "Услуга или задача в контексте не найдена",
        `Интент: ${cluster.main_intent ?? "unknown"}`,
        `Суммарная частотность: ${cluster.total_frequency}`,
      ],
      scores,
      signals,
      gap,
    };

    // persist scores back to the cluster
    await run(
      `UPDATE seo.keyword_clusters SET
         business_fit_score = $1, seo_opportunity_score = $2, content_readiness_score = $3,
         risk_score = $4, content_priority_score = $5, recommended_action = $6,
         target_existing_url = $7, proposed_url = $8, decision_log = $9,
         status = $10, updated_at = NOW()
       WHERE id = $11`,
      [
        scores.business_fit,
        scores.seo_opportunity,
        scores.content_readiness,
        scores.risk,
        scores.priority,
        action,
        gap.target_existing_url,
        proposedUrl,
        JSON.stringify(decisionLog),
        passes ? "candidate" : "rejected",
        cluster.id,
      ],
    );

    await run(
      `INSERT INTO seo.content_plan_items
        (cluster_id, page_type, recommended_action, status, priority, confidence_score, risk_score,
         reason, missing_data, proposed_title, proposed_url, target_existing_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (cluster_id) DO UPDATE SET
         page_type = EXCLUDED.page_type,
         recommended_action = EXCLUDED.recommended_action,
         status = CASE
           WHEN seo.content_plan_items.status IN ('content_generated', 'published') THEN seo.content_plan_items.status
           ELSE EXCLUDED.status
         END,
         priority = EXCLUDED.priority,
         confidence_score = EXCLUDED.confidence_score,
         risk_score = EXCLUDED.risk_score,
         reason = EXCLUDED.reason,
         missing_data = EXCLUDED.missing_data,
         proposed_title = EXCLUDED.proposed_title,
         proposed_url = EXCLUDED.proposed_url,
         target_existing_url = EXCLUDED.target_existing_url,
         updated_at = NOW()`,
      [
        cluster.id,
        pageType,
        action,
        status,
        scores.priority,
        Math.min(99, scores.business_fit),
        scores.risk,
        gap.reason,
        JSON.stringify(missingData),
        cluster.cluster_name ?? primaryKeyword,
        proposedUrl,
        gap.target_existing_url,
      ],
    );
    created += 1;
  }
  return created;
}
