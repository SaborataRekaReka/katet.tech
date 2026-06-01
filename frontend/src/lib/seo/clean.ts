import "server-only";

import { run } from "./db";
import type { CompanyContext, Intent } from "./types";
import { loadContext } from "./seed";

/**
 * Keyword cleaning, normalization and intent classification (Task.md §10-11).
 * Rule-based and deterministic so it runs cheaply without the LLM; the LLM is
 * used only later for cluster naming, briefs and articles.
 */

const STOPWORDS = new Set([
  "и", "в", "во", "на", "с", "со", "по", "для", "от", "до", "за", "из", "к", "у", "о", "об", "а", "но",
]);

const PRICE_WORDS = ["цена", "цены", "стоимость", "стоит", "прайс", "руб", "рублей", "смена", "час", "сколько"];
const COMMERCIAL_WORDS = ["аренда", "арендовать", "заказать", "заказ", "услуга", "услуги", "недорого", "снять", "нанять", "взять"];
const COMPARISON_WORDS = ["лучше", "сравнение", "или", "vs", "против", "отличие", "разница"];
const QUESTION_WORDS = ["как", "что", "почему", "зачем", "когда", "какой", "какая", "какие", "нужно", "нужен", "можно ли"];
const SELECTION_WORDS = ["выбрать", "выбор", "подобрать", "какой нужен"];
const JUNK_WORDS = ["бесплатно", "скачать", "торрент", "вакансия", "работа", "обучение", "своими руками", "бу", "купить"];

function lemmatizeToken(token: string): string {
  // Lightweight Russian stemmer: strips common inflectional endings.
  return token
    .replace(/(ами|ями|ого|его|ому|ему|ыми|ими|ой|ей|ую|юю|ая|яя|ое|ее|ы|и|а|я|у|ю|е|ом|ем|ах|ях|ов|ев|ью)$/u, "")
    .trim();
}

export function normalize(keyword: string): { normalized: string; tokens: string[]; lemmas: string[] } {
  const cleaned = keyword
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const tokens = cleaned.split(" ").filter((t) => t && !STOPWORDS.has(t));
  const lemmas = tokens.map(lemmatizeToken).filter((t) => t.length > 1);
  const normalized = [...lemmas].sort().join(" ");
  return { normalized, tokens, lemmas };
}

type ContextIndex = {
  services: { id: number; name: string; tokens: string[] }[];
  tasks: { id: number; name: string; tokens: string[] }[];
  regions: string[];
  forbidden: string[];
  restrictions: string[];
};

function buildContextIndex(context: CompanyContext[]): ContextIndex {
  const toTokens = (name: string) => normalize(name).lemmas;
  return {
    services: context
      .filter((c) => c.context_type === "service" || c.context_type === "service_category" || c.context_type === "equipment_type")
      .map((c) => ({ id: c.id, name: c.name, tokens: toTokens(c.name) })),
    tasks: context.filter((c) => c.context_type === "task").map((c) => ({ id: c.id, name: c.name, tokens: toTokens(c.name) })),
    regions: context.filter((c) => c.context_type === "region").map((c) => c.name.toLowerCase()),
    forbidden: context.filter((c) => c.context_type === "forbidden_topic").map((c) => c.name.toLowerCase()),
    restrictions: context.filter((c) => c.context_type === "restriction").map((c) => c.name.toLowerCase()),
  };
}

function hasAny(text: string, words: string[]): boolean {
  return words.some((w) => text.includes(w));
}

function matchEntities(lemmas: string[], entities: { name: string; tokens: string[] }[]): string[] {
  const set = new Set(lemmas);
  const matched: string[] = [];
  for (const entity of entities) {
    if (entity.tokens.length === 0) continue;
    const overlap = entity.tokens.filter((t) => set.has(t)).length;
    if (overlap >= Math.max(1, Math.ceil(entity.tokens.length / 2))) matched.push(entity.name);
  }
  return matched;
}

export type ClassifiedKeyword = {
  normalized: string;
  tokens: string[];
  lemmas: string[];
  modifiers: string[];
  detected_geo: string[];
  detected_service: string[];
  detected_task: string[];
  intent: Intent;
  intent_confidence: number;
  is_relevant: boolean;
  irrelevance_reason: string;
};

export function classify(keyword: string, index: ContextIndex, minFrequency: number, frequency: number): ClassifiedKeyword {
  const { normalized, tokens, lemmas } = normalize(keyword);
  const text = keyword.toLowerCase();
  const modifiers: string[] = [];
  if (hasAny(text, PRICE_WORDS)) modifiers.push("price");
  if (hasAny(text, COMMERCIAL_WORDS)) modifiers.push("commercial");
  if (hasAny(text, QUESTION_WORDS)) modifiers.push("question");
  if (hasAny(text, COMPARISON_WORDS)) modifiers.push("comparison");
  if (hasAny(text, SELECTION_WORDS)) modifiers.push("selection");

  const detected_geo = index.regions.filter((r) => text.includes(r));
  const detected_service = matchEntities(lemmas, index.services);
  const detected_task = matchEntities(lemmas, index.tasks);

  // ---- relevance filters (Task.md §10.2) ----
  let is_relevant = true;
  let irrelevance_reason = "relevant";
  if (hasAny(text, index.forbidden)) {
    is_relevant = false;
    irrelevance_reason = "forbidden";
  } else if (hasAny(text, JUNK_WORDS)) {
    is_relevant = false;
    irrelevance_reason = "not_business_fit";
  } else if (frequency < minFrequency) {
    is_relevant = false;
    irrelevance_reason = "too_narrow";
  } else if (detected_service.length === 0 && detected_task.length === 0 && index.services.length > 0) {
    is_relevant = false;
    irrelevance_reason = "not_business_fit";
  }

  // ---- intent classification (Task.md §11) ----
  const signals: string[] = [];
  let intent: Intent = "unknown";
  if (modifiers.includes("price")) {
    intent = "commercial_price";
    signals.push("price_modifier");
  } else if (modifiers.includes("comparison")) {
    intent = "commercial_comparison";
    signals.push("comparison_modifier");
  } else if (modifiers.includes("commercial") && detected_geo.length > 0) {
    intent = "commercial_local";
    signals.push("commercial_modifier", "geo");
  } else if (modifiers.includes("commercial")) {
    intent = "commercial_service";
    signals.push("commercial_modifier");
  } else if (modifiers.includes("selection")) {
    intent = "informational_selection";
    signals.push("selection_modifier");
  } else if (modifiers.includes("question")) {
    intent = "informational_how_to";
    signals.push("question_modifier");
  } else if (detected_service.length > 0) {
    intent = "commercial_service";
    signals.push("service_detected");
  }
  if (detected_service.length > 0) signals.push("service_detected");
  if (detected_task.length > 0) signals.push("task_detected");
  if (detected_geo.length > 0 && !signals.includes("geo")) signals.push("geo");

  const intent_confidence = Math.min(95, 35 + signals.length * 15);
  if (!is_relevant) intent = "irrelevant";

  return {
    normalized,
    tokens,
    lemmas,
    modifiers,
    detected_geo,
    detected_service,
    detected_task,
    intent,
    intent_confidence,
    is_relevant,
    irrelevance_reason,
  };
}

type RawRow = { id: number; keyword: string; frequency: number | null; region: string | null };

/**
 * Process all raw keywords that don't yet have a normalized row.
 * De-duplicates by normalized_keyword + region (keeps max frequency).
 */
export async function cleanAndNormalize(minFrequency: number): Promise<number> {
  const context = await loadContext();
  const index = buildContextIndex(context);
  const rawRows = await run<RawRow>(
    `SELECT r.id, r.keyword, r.frequency, r.region
     FROM seo.raw_keywords r
     WHERE NOT EXISTS (SELECT 1 FROM seo.normalized_keywords n WHERE n.raw_keyword_id = r.id)`,
  );

  let processed = 0;
  for (const raw of rawRows) {
    const frequency = raw.frequency ?? 0;
    const c = classify(raw.keyword, index, minFrequency, frequency);
    const status = c.is_relevant ? "classified" : "excluded";
    await run(
      `INSERT INTO seo.normalized_keywords
        (raw_keyword_id, keyword, normalized_keyword, frequency, region, tokens, lemmas, modifiers,
         detected_geo, detected_service, detected_task, detected_intent, intent_confidence,
         is_relevant, irrelevance_reason, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       ON CONFLICT (normalized_keyword, COALESCE(region, '')) DO UPDATE
         SET frequency = GREATEST(seo.normalized_keywords.frequency, EXCLUDED.frequency)`,
      [
        raw.id,
        raw.keyword,
        c.normalized || raw.keyword.toLowerCase(),
        frequency,
        raw.region,
        c.tokens,
        c.lemmas,
        c.modifiers,
        c.detected_geo,
        c.detected_service,
        c.detected_task,
        c.intent,
        c.intent_confidence,
        c.is_relevant,
        c.irrelevance_reason,
        status,
      ],
    );
    processed += 1;
  }
  return processed;
}
