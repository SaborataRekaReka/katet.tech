import "server-only";

import { run } from "./db";
import type { CompanyContext, Intent, SemanticsCleaningConfig } from "./types";
import { loadContext, normalizeContextType } from "./seed";

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
const BUSINESS_FIT_WORDS = [
  ...PRICE_WORDS,
  ...COMMERCIAL_WORDS,
  "аренд",
  "услуг",
  "заказ",
  "с экипаж",
  "экипаж",
  "нужн",
  "москва",
  "московск",
];
const GENERIC_SERVICE_TOKENS = new Set(["спецтехник", "техник"]);
const ENTITY_ACTION_TOKENS = new Set(["аренд", "услуг"]);
const JUNK_TOKEN_WORDS = ["дром", "авито"];
const BASE_JUNK_WORDS = [
  "бесплатно",
  "скачать",
  "торрент",
  "вакансия",
  "работа",
  "обучение",
  "своими руками",
  "бу",
  "купить",
  "куплю",
  "купл",
  "продажа",
  "продать",
  "продам",
  "ремонт",
  "запчаст",
  "запасные части",
  "сервис",
  "оквэд",
  "учет",
  "учёт",
  "гостехнадзор",
  "регистрация",
  "документ",
  "удостоверение",
  "права на",
  "мультик",
  "мультики",
  "для детей",
  "игрушк",
  "картинк",
  "фото",
  "звук",
  "раскраск",
  "работ",
  "водител",
  "машинист",
  "ооо",
  "ип ",
  "завод",
  "магазин",
  "производство",
  "аукцион",
  "торги",
  "выставк",
  "китай",
  "шины",
  "резина",
  "путевой",
  "рапорт",
  "номер",
  "ключ",
  "эфко",
  "официальный сайт",
  "сайт",
  "договор",
  "образец",
  "шаблон",
  "бланк",
  "акт ",
  "окпд",
  "косгу",
  "эсм",
  "патент",
  "коммерческое предложение",
  "самозанят",
  "диспетчер",
  "менеджер",
  "арендатор",
  "субаренда",
  "сдать в аренду",
  "сдача в аренду",
  "счет",
  "счёт",
  "код услуги",
  "код аренды",
  "лизинг",
  "трал",
  "перевозк",
  "доставка спецтехники",
  "рынок аренды",
  "бизнес на аренде",
  "объявлен",
  "заявк",
  "спб",
  "санкт",
  "петербург",
  "нижний новгород",
  "нижний",
  "новгород",
  "новосибирск",
  "челябинск",
  "казан",
  "самар",
  "саратов",
  "ростов",
  "воронеж",
  "волгоград",
  "омск",
  "уфа",
  "тюмень",
  "ярослав",
  "рязань",
  "улан",
  "удэ",
  "рубцовск",
  "слово",
];

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
  services: { id: number; name: string; tokens: string[]; contextType: string }[];
  tasks: { id: number; name: string; tokens: string[] }[];
  regions: string[];
  forbidden: string[];
  restrictions: string[];
};

function buildContextIndex(context: CompanyContext[]): ContextIndex {
  const toTokens = (name: string) => normalize(name).lemmas;
  const canonicalTypeOf = (row: CompanyContext) => normalizeContextType(row.context_type);
  return {
    services: context
      .filter((c) => {
        const type = canonicalTypeOf(c);
        return type === "service" || type === "service_category" || type === "equipment_type";
      })
      .map((c) => ({ id: c.id, name: c.name, tokens: toTokens(c.name), contextType: canonicalTypeOf(c) })),
    tasks: context
      .filter((c) => canonicalTypeOf(c) === "task")
      .map((c) => ({ id: c.id, name: c.name, tokens: toTokens(c.name) })),
    regions: context
      .filter((c) => canonicalTypeOf(c) === "region")
      .map((c) => c.name.toLowerCase()),
    forbidden: context
      .filter((c) => canonicalTypeOf(c) === "forbidden_topic")
      .map((c) => c.name.toLowerCase()),
    restrictions: context
      .filter((c) => canonicalTypeOf(c) === "restriction")
      .map((c) => c.name.toLowerCase()),
  };
}

function hasAny(text: string, words: string[]): boolean {
  return words.some((w) => text.includes(w));
}

function hasTokenWord(text: string, word: string): boolean {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|\\s)${escaped}(\\s|$)`, "u").test(text);
}

function hasJunk(text: string, junkWords: string[]): boolean {
  if (hasAny(text, junkWords)) return true;
  return JUNK_TOKEN_WORDS.some((word) => hasTokenWord(text, word));
}

function hasBusinessFit(text: string): boolean {
  return hasAny(text, BUSINESS_FIT_WORDS);
}

function tokenOverlap(lemmas: string[], tokens: string[]): number {
  const set = new Set(lemmas);
  return tokens.filter((token) => set.has(token)).length;
}

function matchServices(lemmas: string[], entities: ContextIndex["services"], businessFit: boolean): string[] {
  const matched: string[] = [];
  for (const entity of entities) {
    if (entity.tokens.length === 0) continue;
    const coreTokens = entity.tokens.filter((token) => !ENTITY_ACTION_TOKENS.has(token));
    const overlap = tokenOverlap(lemmas, coreTokens);
    if (overlap === 0) continue;

    const genericOnly = coreTokens.every((token) => GENERIC_SERVICE_TOKENS.has(token));
    if (genericOnly) {
      if (businessFit && overlap === coreTokens.length) matched.push(entity.name);
      continue;
    }

    if (entity.contextType === "equipment_type") {
      if (overlap >= Math.max(1, Math.ceil(coreTokens.length * 0.7))) matched.push(entity.name);
      continue;
    }

    if (businessFit && overlap >= Math.max(1, Math.ceil(coreTokens.length * 0.75))) matched.push(entity.name);
  }
  return matched;
}

function matchTasks(lemmas: string[], entities: { name: string; tokens: string[] }[]): string[] {
  const matched: string[] = [];
  for (const entity of entities) {
    if (entity.tokens.length === 0) continue;
    const overlap = tokenOverlap(lemmas, entity.tokens);
    if (overlap >= Math.min(entity.tokens.length, 2)) matched.push(entity.name);
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

type CleaningRules = {
  min_frequency: number;
  require_business_fit: boolean;
  junk_words: string[];
};

export function classify(keyword: string, index: ContextIndex, rules: CleaningRules, frequency: number): ClassifiedKeyword {
  const { normalized, tokens, lemmas } = normalize(keyword);
  const text = keyword.toLowerCase();
  const modifiers: string[] = [];
  if (hasAny(text, PRICE_WORDS)) modifiers.push("price");
  if (hasAny(text, COMMERCIAL_WORDS)) modifiers.push("commercial");
  if (hasAny(text, QUESTION_WORDS)) modifiers.push("question");
  if (hasAny(text, COMPARISON_WORDS)) modifiers.push("comparison");
  if (hasAny(text, SELECTION_WORDS)) modifiers.push("selection");

  const detected_geo = index.regions.filter((r) => text.includes(r));
  const businessFit = rules.require_business_fit ? hasBusinessFit(text) : true;
  const detected_service = matchServices(lemmas, index.services, businessFit || detected_geo.length > 0);
  const detected_task = matchTasks(lemmas, index.tasks);

  // ---- relevance filters (Task.md §10.2) ----
  let is_relevant = true;
  let irrelevance_reason = "relevant";
  if (hasAny(text, index.forbidden)) {
    is_relevant = false;
    irrelevance_reason = "forbidden";
  } else if (hasJunk(text, rules.junk_words)) {
    is_relevant = false;
    irrelevance_reason = "not_business_fit";
  } else if (frequency < rules.min_frequency) {
    is_relevant = false;
    irrelevance_reason = "too_narrow";
  } else if (
    rules.require_business_fit
    && detected_service.length === 0
    && detected_task.length === 0
    && index.services.length > 0
  ) {
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

type CleanOptions = {
  reprocess?: boolean;
  cleaning?: Partial<SemanticsCleaningConfig>;
};

function normalizeCustomJunkWords(words: string[] | undefined): string[] {
  if (!Array.isArray(words)) return [];
  return words.map((word) => String(word).trim().toLowerCase()).filter((word) => word.length > 0);
}

/**
 * Process all raw keywords that don't yet have a normalized row.
 * De-duplicates by normalized_keyword + region (keeps max frequency).
 */
export async function cleanAndNormalize(minFrequency: number, options: CleanOptions = {}): Promise<number> {
  const context = await loadContext();
  const index = buildContextIndex(context);
  const reprocess = Boolean(options.reprocess);
  const customJunkWords = normalizeCustomJunkWords(options.cleaning?.junk_words);
  const rules: CleaningRules = {
    min_frequency: Math.max(1, Number(options.cleaning?.min_frequency ?? minFrequency) || minFrequency),
    require_business_fit: options.cleaning?.require_business_fit ?? true,
    junk_words: [...BASE_JUNK_WORDS, ...customJunkWords],
  };
  const rawRows = await run<RawRow>(
    `SELECT r.id, r.keyword, r.frequency, r.region
     FROM seo.raw_keywords r
     WHERE $1::boolean = TRUE
        OR NOT EXISTS (SELECT 1 FROM seo.normalized_keywords n WHERE n.raw_keyword_id = r.id)`,
    [reprocess],
  );

  let processed = 0;
  for (const raw of rawRows) {
    const frequency = raw.frequency ?? 0;
    const c = classify(raw.keyword, index, rules, frequency);
    const status = c.is_relevant ? "classified" : "excluded";
    await run(
      `INSERT INTO seo.normalized_keywords
        (raw_keyword_id, keyword, normalized_keyword, frequency, region, tokens, lemmas, modifiers,
         detected_geo, detected_service, detected_task, detected_intent, intent_confidence,
         is_relevant, irrelevance_reason, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       ON CONFLICT (normalized_keyword, COALESCE(region, '')) DO UPDATE
         SET frequency = GREATEST(seo.normalized_keywords.frequency, EXCLUDED.frequency),
             tokens = CASE WHEN $17::boolean THEN EXCLUDED.tokens ELSE seo.normalized_keywords.tokens END,
             lemmas = CASE WHEN $17::boolean THEN EXCLUDED.lemmas ELSE seo.normalized_keywords.lemmas END,
             modifiers = CASE WHEN $17::boolean THEN EXCLUDED.modifiers ELSE seo.normalized_keywords.modifiers END,
             detected_geo = CASE WHEN $17::boolean THEN EXCLUDED.detected_geo ELSE seo.normalized_keywords.detected_geo END,
             detected_service = CASE WHEN $17::boolean THEN EXCLUDED.detected_service ELSE seo.normalized_keywords.detected_service END,
             detected_task = CASE WHEN $17::boolean THEN EXCLUDED.detected_task ELSE seo.normalized_keywords.detected_task END,
             detected_intent = CASE WHEN $17::boolean THEN EXCLUDED.detected_intent ELSE seo.normalized_keywords.detected_intent END,
             intent_confidence = CASE WHEN $17::boolean THEN EXCLUDED.intent_confidence ELSE seo.normalized_keywords.intent_confidence END,
             is_relevant = CASE WHEN $17::boolean THEN EXCLUDED.is_relevant ELSE seo.normalized_keywords.is_relevant END,
             irrelevance_reason = CASE WHEN $17::boolean THEN EXCLUDED.irrelevance_reason ELSE seo.normalized_keywords.irrelevance_reason END,
             status = CASE WHEN $17::boolean THEN EXCLUDED.status ELSE seo.normalized_keywords.status END,
             cluster_id = CASE WHEN $17::boolean THEN NULL ELSE seo.normalized_keywords.cluster_id END`,
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
        reprocess,
      ],
    );
    processed += 1;
  }
  return processed;
}
