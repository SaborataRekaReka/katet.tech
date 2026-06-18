import "server-only";

import { one, run } from "./db";
import { chatJson, webResearch } from "./openai";
import type { WebResearchResult } from "./openai";
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

const RESEARCH_MAX_SOURCES_PER_CALL = 12;
const RESEARCH_MAX_MERGED_SOURCES = 16;
const RESEARCH_MIN_SOURCES_SINGLE_PASS = 8;
const RESEARCH_MIN_SUMMARY_CHARS_SINGLE_PASS = 550;

function buildResearchQueries(cluster: ClusterRow, keywords: { keyword: string; role: string }[]): string[] {
  const primary = (cluster.primary_keyword || cluster.cluster_name || "").trim();
  const clusterName = (cluster.cluster_name || "").trim();
  const questions = keywords
    .filter((k) => k.role === "question")
    .map((k) => k.keyword.trim())
    .filter(Boolean)
    .slice(0, 6);
  const highFreq = keywords
    .map((k) => k.keyword.trim())
    .filter(Boolean)
    .slice(0, 8);

  const queries = [
    [primary, ...highFreq].filter(Boolean).join("; "),
    [primary, clusterName, ...questions].filter(Boolean).join("; "),
  ]
    .map((q) => q.trim())
    .filter((q) => q.length > 0);

  return [...new Set(queries)];
}

function isResearchSufficient(result: WebResearchResult | null): boolean {
  if (!result) return false;
  return (
    result.sources.length >= RESEARCH_MIN_SOURCES_SINGLE_PASS &&
    (result.summary || "").trim().length >= RESEARCH_MIN_SUMMARY_CHARS_SINGLE_PASS
  );
}

function mergeResearchResults(
  results: Array<WebResearchResult | null>,
  maxSources = RESEARCH_MAX_MERGED_SOURCES,
): WebResearchResult | null {
  const existing = results.filter((r): r is WebResearchResult => Boolean(r));
  if (existing.length === 0) return null;

  const seenSummary = new Set<string>();
  const summaryParts: string[] = [];
  for (const item of existing) {
    const summary = (item.summary || "").trim();
    if (!summary) continue;
    const normalized = summary.toLowerCase();
    if (seenSummary.has(normalized)) continue;
    seenSummary.add(normalized);
    summaryParts.push(summary);
  }

  const seenUrl = new Set<string>();
  const sources = [] as NonNullable<WebResearchResult>["sources"];
  for (const item of existing) {
    for (const source of item.sources) {
      const url = (source.url || "").trim();
      if (!url || seenUrl.has(url)) continue;
      seenUrl.add(url);
      sources.push(source);
      if (sources.length >= maxSources) break;
    }
    if (sources.length >= maxSources) break;
  }

  const summary = summaryParts.join("\n\n");
  if (!summary && sources.length === 0) return null;
  return { summary, sources };
}

async function collectWebResearch(
  cluster: ClusterRow,
  keywords: { keyword: string; role: string }[],
): Promise<WebResearchResult | null> {
  const queries = buildResearchQueries(cluster, keywords);
  if (queries.length === 0) return null;

  const primary = await webResearch(queries[0], { maxSources: RESEARCH_MAX_SOURCES_PER_CALL });
  if (isResearchSufficient(primary) || queries.length === 1) {
    return primary;
  }

  const secondaryResults = await Promise.all(
    queries.slice(1).map((query) => webResearch(query, { maxSources: RESEARCH_MAX_SOURCES_PER_CALL })),
  );
  return mergeResearchResults([primary, ...secondaryResults]);
}

function seoLengthRequirementsByIntent(intentRaw: string): {
  min_chars: number;
  target_chars: number;
  max_chars: number;
} {
  const intent = intentRaw.toLowerCase();
  if (/commercial|service|transactional|price|comparison|купить|заказ/.test(intent)) {
    return { min_chars: 5500, target_chars: 6200, max_chars: 7800 };
  }
  if (/informational|how_to|faq|guide|selection/.test(intent)) {
    return { min_chars: 4200, target_chars: 5200, max_chars: 7000 };
  }
  return { min_chars: 4800, target_chars: 5700, max_chars: 7400 };
}

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

function fallbackBrief(
  cluster: ClusterRow,
  keywords: { keyword: string; role: string }[],
  pageType: PageType,
  facts: string[],
): ContentBrief {
  const primary = cluster.primary_keyword ?? cluster.cluster_name ?? "";
  const intent = cluster.main_intent ?? "commercial_service";
  const questions = keywords.filter((k) => k.role === "question").map((k) => k.keyword);
  const sourceFacts = facts.slice(0, 12);
  const secondary = keywords
    .filter((k) => k.role !== "primary" && k.role !== "question")
    .map((k) => k.keyword)
    .slice(0, 15);

  const nextQuestionIntents = [
    "Какие ограничения и условия влияют на выбор решения в этой ситуации",
    "Какие риски и типичные ошибки бывают у заказчика и как их избежать",
    "По каким критериям сравнивать подрядчиков и что проверить до старта работ",
    "Какие входные данные нужны для точной оценки сроков и стоимости",
  ];

  const differentiationPoints = [
    "Фокус на конкретном практическом применении под задачу пользователя, а не общий обзор",
    "Явно описанные ограничения и границы применимости решения",
    "Пошаговые чек-листы и критерии принятия решения",
    "Прямые ответы на возражения и следующие вопросы после первого поиска",
  ];

  const evidenceRequirements = [
    "Каждый ключевой тезис должен сопровождаться пояснением: почему это важно для пользователя",
    "Практические рекомендации должны быть проверяемыми и применимыми без скрытых условий",
    "Сомнительные или неполные тезисы переносить в missing_data, не выдумывать факты",
    "Для внешних рекомендаций опираться на research_sources и не приписывать их компании",
  ];

  const trustSignals = [
    "Ясно отделять подтвержденные факты компании от общерыночных рекомендаций",
    "Избегать категоричных обещаний без исходных данных",
    "Поддерживать прозрачность условий, ограничений и критериев выбора",
    "Соблюдать нейтральный экспертный тон без манипулятивных формулировок",
  ];

  const serpFeatures =
    intent === "faq"
      ? ["Organic", "People Also Ask", "AI answer synthesis"]
      : ["Organic", "AI answer synthesis", "Possible comparison snippets"];

  return {
    page_goal: `Закрыть поисковый спрос по теме «${primary}» и привести заявку.`,
    page_type: pageType,
    search_intent: intent,
    target_user: "Клиент, ищущий услугу компании",
    business_goal: "Получение заявки/звонка",
    primary_keyword: primary,
    secondary_keywords: secondary,
    questions_to_answer: questions.slice(0, 10),
    required_blocks: [
      "Блок частых вопросов по теме (FAQ/вопросы пользователей)",
      "Блок следующего шага пользователя (заявка/контакт/запрос расчета)",
    ],
    forbidden_claims: [
      "Не выдумывать цены",
      "Не выдумывать характеристики техники",
      "Не обещать сроки без данных",
      "Не использовать keyword stuffing и SEO-текст ради плотности",
      "Не копировать формулировки из источников без добавления практической ценности",
      "Не добавлять шаблонные broad-claims без уточнений и ограничений",
    ],
    source_facts: sourceFacts,
    missing_data: sourceFacts.length > 0
      ? []
      : ["Подтвержденные факты компании по услуге", "Диапазон условий и сроков выполнения", "Ограничения по площадке"],
    internal_link_targets: [],
    cta_requirements: [
      "Кнопка/форма заявки",
      "Телефон",
      "Сбор параметров объекта",
      "Контакт для быстрой обратной связи",
    ],
    meta_requirements: {
      title_rule: "Включить основной ключ и outcome под интент, 45-60 символов, без кликбейта",
      description_rule: "Включить основной ключ, конкретную пользу и scope, 130-160 символов",
    },
    schema_requirements:
      pageType === "faq"
        ? ["QAPage (если формат реальных Q&A)", "BreadcrumbList"]
        : ["Service", "BreadcrumbList"],
    quality_requirements: [
      "Уникальная польза",
      "Без воды",
      "Опираться только на факты компании",
      "Практические рекомендации и чек-листы",
      "Каждый H2 должен быть самодостаточным и понятным без контекста",
      "Закрывать next-question intent: после чтения пользователь понимает следующий шаг",
      "Избегать дублирования блоков и близких по смыслу абзацев",
      "Соблюдать readability: короткие абзацы, списки, явные критерии выбора",
    ],
    next_question_intents: nextQuestionIntents,
    differentiation_points: differentiationPoints,
    evidence_requirements: evidenceRequirements,
    trust_signals: trustSignals,
    serp_features: serpFeatures,
    external_source_policy:
      "Использовать внешние источники только для общерыночных практик и фактов; не приписывать их компании. При конфликте приоритет у source_facts.",
    keyword_usage_policy:
      "Primary keyword использовать естественно в ключевых блоках (title, intro, 1-2 H2, conclusion) без целевой плотности; вторичные ключи распределять по интенту и смыслу.",
    length_requirements: seoLengthRequirementsByIntent(intent),
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
  const allowFallback = process.env.SEO_ALLOW_ARTICLE_FALLBACK === "1";
  const tryResearchInFallback = process.env.SEO_TRY_RESEARCH_WITH_FALLBACK !== "0";
  const tryBriefLlmInFallback = process.env.SEO_TRY_BRIEF_LLM_WITH_FALLBACK !== "0";
  const shouldRunResearch = !allowFallback || tryResearchInFallback;
  const shouldRunBriefLlm = !allowFallback || tryBriefLlmInFallback;

  const research = !shouldRunResearch ? null : await collectWebResearch(cluster, keywords);

  let brief = fallbackBrief(cluster, keywords, pageType, facts);
  const llm = !shouldRunBriefLlm
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
        "Учитывай современный gold standard SEO 2026 (Google + Yandex + industry): ответо-готовая структура, information gain, next-question intent, отказ от keyword density-магии, анти-спам и анти-scaled-abuse подход. " +
        "Используй web_research_summary и web_research_sources для полезного контента по теме (определения, методики, риски, практические рекомендации), " +
        "но не выдавай данные источников как факты именно о компании. " +
        "В required_blocks укажи только действительно обязательные функциональные блоки (обычно FAQ и следующий шаг пользователя). " +
        "Не используй маркетинговые или шаблонные названия в required_blocks: это функциональные требования, а не готовые H2. " +
        "Остальные разделы и их названия определи на базе web_research_summary/web_research_sources, поискового интента и next-question intent. " +
        "Сформируй evidence_requirements и trust_signals так, чтобы текст был проверяемым и не шаблонным. " +
        "С 7 мая 2026 FAQ rich result в Google прекращен: не требуй FAQPage ради Google rich results. Для FAQ-страниц предпочитай QAPage при реальном Q&A формате. " +
        "Если данных не хватает — перечисли их в missing_data. Верни строго JSON с полями: page_goal, page_type, search_intent, target_user, business_goal, primary_keyword, secondary_keywords[], questions_to_answer[], required_blocks[], forbidden_claims[], source_facts[], missing_data[], internal_link_targets[], cta_requirements[], meta_requirements{title_rule, description_rule}, schema_requirements[], quality_requirements[], next_question_intents[], differentiation_points[], evidence_requirements[], trust_signals[], serp_features[], external_source_policy, keyword_usage_policy, length_requirements{min_chars,target_chars,max_chars}.",
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
  brief.next_question_intents = asStrArray(brief.next_question_intents);
  brief.differentiation_points = asStrArray(brief.differentiation_points);
  brief.evidence_requirements = asStrArray(brief.evidence_requirements);
  brief.trust_signals = asStrArray(brief.trust_signals);
  brief.serp_features = asStrArray(brief.serp_features);

  const intent = asStr(brief.search_intent || cluster.main_intent || "commercial_service") || "commercial_service";
  const defaultLength = seoLengthRequirementsByIntent(intent);
  const rawLength = brief.length_requirements as
    | { min_chars?: unknown; target_chars?: unknown; max_chars?: unknown }
    | undefined;
  const asNum = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : 0);
  const minChars = Math.max(1500, asNum(rawLength?.min_chars) || defaultLength.min_chars);
  const targetChars = Math.max(minChars + 200, asNum(rawLength?.target_chars) || defaultLength.target_chars);
  const maxChars = Math.max(targetChars + 200, asNum(rawLength?.max_chars) || defaultLength.max_chars);
  brief.length_requirements = { min_chars: minChars, target_chars: targetChars, max_chars: maxChars };

  const externalPolicy = asStr(brief.external_source_policy);
  brief.external_source_policy =
    externalPolicy ||
    "Использовать внешние источники только как общерыночные рекомендации; факты о компании брать только из source_facts.";

  const keywordPolicy = asStr(brief.keyword_usage_policy);
  brief.keyword_usage_policy =
    keywordPolicy ||
    "Primary keyword использовать естественно в ключевых блоках без цели по плотности; secondary keywords распределять по интенту и смыслу.";

  // Keep schema policy aligned with Google 2026 changes: do not force FAQPage for generic articles.
  if (brief.page_type !== "faq") {
    brief.schema_requirements = (brief.schema_requirements || []).filter((schema) => schema.toLowerCase() !== "faqpage");
  }

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
