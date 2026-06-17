import "server-only";

import { one, run } from "./db";
import { chatJson, webResearch } from "./openai";
import { loadContext, normalizeContextType } from "./seed";
import type { CompanyContext, ContentBrief, Intent, PageType } from "./types";

/**
 * Brief generator (Task.md §17, §26). Produces a structured technical brief for a
 * single approved content plan item. The brief is DERIVED from the cluster +
 * company context only — the LLM must not invent topics, services or facts.
 */

type PlanRow = {
  id: number;
  cluster_id: number;
  page_type: PageType | null;
  recommended_action: string | null;
  target_existing_url: string | null;
  proposed_title: string | null;
};

type ClusterRow = {
  primary_keyword: string | null;
  cluster_name: string | null;
  main_intent: Intent | null;
};

async function clusterKeywords(clusterId: number): Promise<{ keyword: string; role: string }[]> {
  return run<{ keyword: string; role: string }>(
    `SELECT n.keyword, ck.role
     FROM seo.cluster_keywords ck
     JOIN seo.normalized_keywords n ON n.id = ck.keyword_id
     WHERE ck.cluster_id = $1
     ORDER BY ck.frequency DESC`,
    [clusterId],
  );
}

function collectFacts(context: CompanyContext[]): string[] {
  const facts: string[] = [];
  for (const c of context) {
    const type = normalizeContextType(c.context_type);
    if (["service", "service_category", "equipment_type", "advantage", "case", "restriction"].includes(type)) {
      facts.push(`${c.name}${c.description ? `: ${c.description}` : ""}`);
    }
  }
  return facts;
}

function fallbackBrief(cluster: ClusterRow, keywords: { keyword: string; role: string }[], pageType: PageType): ContentBrief {
  const primary = cluster.primary_keyword ?? cluster.cluster_name ?? "";
  const questions = keywords.filter((k) => k.role === "question").map((k) => k.keyword);
  return {
    page_goal: `Закрыть поисковый спрос по теме «${primary}» и привести заявку.`,
    page_type: pageType,
    search_intent: cluster.main_intent ?? "commercial_service",
    target_user: "Клиент, ищущий услугу компании",
    business_goal: "Получение заявки/звонка",
    primary_keyword: primary,
    secondary_keywords: keywords.filter((k) => k.role !== "primary" && k.role !== "question").map((k) => k.keyword).slice(0, 15),
    questions_to_answer: questions.slice(0, 10),
    required_blocks: ["Вводный блок", "Описание услуги", "Преимущества", "FAQ", "CTA/форма заявки"],
    forbidden_claims: ["Не выдумывать цены", "Не выдумывать характеристики техники", "Не обещать сроки без данных"],
    source_facts: [],
    missing_data: [],
    internal_link_targets: [],
    cta_requirements: ["Кнопка/форма заявки", "Телефон"],
    meta_requirements: {
      title_rule: "Включить основной ключ, до 60 символов",
      description_rule: "Включить основной ключ и УТП, до 160 символов",
    },
    schema_requirements: pageType === "faq" ? ["FAQPage"] : ["Service", "BreadcrumbList"],
    quality_requirements: ["Уникальная польза", "Без воды", "Опираться только на факты компании"],
  };
}

/** Generate and persist a brief for a plan item. Returns the brief id. */
type GenerateBriefOptions = {
  forceCreateNewPage?: boolean;
};

/** Generate and persist a brief for a plan item. Returns the brief id. */
export async function generateBrief(
  planItemId: number,
  reviewer = "system",
  options: GenerateBriefOptions = {},
): Promise<number> {
  const plan = await one<PlanRow>(
    `SELECT id, cluster_id, page_type, recommended_action, target_existing_url, proposed_title
     FROM seo.content_plan_items WHERE id = $1`,
    [planItemId],
  );
  if (!plan) throw new Error(`Plan item ${planItemId} not found`);

  const cluster = await one<ClusterRow>(
    `SELECT primary_keyword, cluster_name, main_intent FROM seo.keyword_clusters WHERE id = $1`,
    [plan.cluster_id],
  );
  if (!cluster) throw new Error(`Cluster ${plan.cluster_id} not found`);

  const keywords = await clusterKeywords(plan.cluster_id);
  const context = await loadContext();
  const facts = collectFacts(context);
  const pageType = plan.page_type ?? "article";
  const forceCreateNewPage = options.forceCreateNewPage === true;
  const recommendedAction = forceCreateNewPage ? "create_new_page" : plan.recommended_action;
  const targetExistingUrl = forceCreateNewPage ? null : plan.target_existing_url;
  const emergencyFallback = process.env.SEO_ALLOW_ARTICLE_FALLBACK === "1";
  const research = emergencyFallback
    ? null
    : await webResearch(
      [cluster.primary_keyword, ...(keywords.slice(0, 4).map((k) => k.keyword))]
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .join("; "),
    );

  let brief = fallbackBrief(cluster, keywords, pageType);
  const llm = emergencyFallback
    ? null
    : await chatJson<ContentBrief>({
      modelSlot: "strong",
      temperature: 0.3,
      system:
        "Ты SEO-стратег и редактор. Сформируй техническое задание (ТЗ) на страницу строго на основе переданного кластера запросов и фактов компании. " +
        "ЗАПРЕЩЕНО: придумывать тему самому, добавлять ключи которых нет в кластере, добавлять услуги/цены/характеристики/районы которых нет в фактах. " +
        (forceCreateNewPage
          ? "Оператор явно запросил НОВУЮ самостоятельную страницу. Не предлагай патчи существующих URL и не добавляй служебные пометки для редактора. "
          : "") +
        "Используй web_research_summary и web_research_sources для полезного контента по теме (определения, методики, риски, практические рекомендации), " +
        "но не выдавай данные источников как факты именно о компании. " +
        "Если данных не хватает — перечисли их в missing_data. Верни строго JSON с полями: page_goal, page_type, search_intent, target_user, business_goal, primary_keyword, secondary_keywords[], questions_to_answer[], required_blocks[], forbidden_claims[], source_facts[], missing_data[], internal_link_targets[], cta_requirements[], meta_requirements{title_rule, description_rule}, schema_requirements[], quality_requirements[].",
      user: JSON.stringify({
        page_type: pageType,
        recommended_action: recommendedAction,
        target_existing_url: targetExistingUrl,
        force_create_new_page: forceCreateNewPage,
        main_intent: cluster.main_intent,
        primary_keyword: cluster.primary_keyword,
        cluster_keywords: keywords.map((k) => k.keyword),
        questions: keywords.filter((k) => k.role === "question").map((k) => k.keyword),
        company_facts: facts,
        web_research_summary: research?.summary ?? "",
        web_research_sources: research?.sources ?? [],
      }),
    });
  if (llm && llm.primary_keyword) {
    brief = { ...brief, ...llm };
  }

  brief.research_summary = research?.summary ?? brief.research_summary ?? "";
  brief.research_sources = Array.isArray(research?.sources) ? research!.sources : [];

  // Normalize array fields: the LLM occasionally returns arrays of objects
  // ({name|text|value}) instead of plain strings. Coerce them so downstream
  // consumers (article generator, UI) always receive string[].
  const asStr = (v: unknown): string => {
    if (typeof v === "string") return v;
    if (v == null) return "";
    if (typeof v === "object") {
      const o = v as Record<string, unknown>;
      return asStr(o.name ?? o.text ?? o.value ?? o.title ?? o.label ?? o.question ?? "");
    }
    return String(v);
  };
  const asStrArray = (v: unknown): string[] =>
    Array.isArray(v) ? v.map(asStr).filter((s) => s.length > 0) : [];
  brief.secondary_keywords = asStrArray(brief.secondary_keywords);
  brief.questions_to_answer = asStrArray(brief.questions_to_answer);
  brief.required_blocks = asStrArray(brief.required_blocks);
  brief.forbidden_claims = asStrArray(brief.forbidden_claims);
  brief.source_facts = asStrArray(brief.source_facts);
  brief.missing_data = asStrArray(brief.missing_data);
  brief.internal_link_targets = asStrArray(brief.internal_link_targets);
  brief.cta_requirements = asStrArray(brief.cta_requirements);
  brief.quality_requirements = asStrArray(brief.quality_requirements);
  brief.schema_requirements = asStrArray(brief.schema_requirements);

  // auto-check: ensure no invented keywords (all secondary keywords must come from cluster)
  const clusterSet = new Set(keywords.map((k) => k.keyword.toLowerCase()));
  brief.secondary_keywords = brief.secondary_keywords.filter((k) => clusterSet.has(k.toLowerCase()));

  const missing = brief.missing_data ?? [];
  const status = missing.length > 0 ? "needs_data" : "auto_checked";
  const qualityScore = Math.max(40, 100 - missing.length * 15);

  const row = await one<{ id: number }>(
    `INSERT INTO seo.content_briefs (content_plan_item_id, brief, status, quality_score, missing_data)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [planItemId, JSON.stringify(brief), status, qualityScore, JSON.stringify(missing)],
  );

  await run(`UPDATE seo.content_plan_items SET status = 'brief_created', updated_at = NOW() WHERE id = $1`, [planItemId]);
  await run(
    `INSERT INTO seo.review_decisions (content_plan_item_id, cluster_id, action, reviewer)
     VALUES ($1, $2, 'send_to_brief_generation', $3)`,
    [planItemId, plan.cluster_id, reviewer],
  );

  return row!.id;
}
