import "server-only";

import fs from "node:fs";
import path from "node:path";
import { one, run } from "./db";
import { chatJson, generateImage, getLastChatError } from "./openai";
import type { ContentBrief, GeneratedArticle } from "./types";

/**
 * Article draft generator. Turns an approved brief into a draft article
 * (title, meta, HTML body, FAQ). Strictly grounded in the brief's facts.
 */

const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y",
  к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
  х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

/** Coerce any LLM-provided value (object/array/number/null) into a plain string. */
function asText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    return asText(o.name ?? o.title ?? o.text ?? o.label ?? o.question ?? o.value ?? "");
  }
  return String(value);
}

function slugify(input: unknown): string {
  return asText(input)
    .toLowerCase()
    .split("")
    .map((ch) => TRANSLIT[ch] ?? ch)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .split("-")
    .slice(0, 7)
    .join("-");
}

function escapeHtml(input: unknown): string {
  return asText(input).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function sanitizeExternalUrl(input: unknown): string | null {
  const raw = asText(input).trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function asTextList(values: unknown, limit = 8): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const text = asText(value).replace(/\s+/g, " ").trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= limit) break;
  }
  return out;
}

function compactText(value: unknown, maxLength: number): string {
  const text = asText(value).replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function compactResearchSources(value: unknown, maxItems: number): Array<{ title: string; url: string; snippet?: string }> {
  if (!Array.isArray(value)) return [];
  const out: Array<{ title: string; url: string; snippet?: string }> = [];
  const seen = new Set<string>();

  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const url = sanitizeExternalUrl(item.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);

    const title = compactText(item.title || url, 140);
    const snippet = compactText(item.snippet, 260);
    out.push(snippet ? { title, url, snippet } : { title, url });

    if (out.length >= maxItems) break;
  }

  return out;
}

function listHtml(items: string[]): string {
  if (items.length === 0) return "";
  return `<ul>\n${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("\n")}\n</ul>`;
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function envInt(name: string, fallback: number, min: number, max: number): number {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw)) return fallback;
  return clampInt(raw, min, max);
}

type FallbackSectionData = {
  primary: string;
  pageGoal: string;
  targetUser: string;
  intent: string;
  businessGoal: string;
  secondaryKeywords: string[];
  questions: string[];
  nextQuestionIntents: string[];
  differentiationPoints: string[];
  evidenceRequirements: string[];
  trustSignals: string[];
  serpFeatures: string[];
  keywordUsagePolicy: string;
  externalSourcePolicy: string;
  lengthRequirements: SeoLengthRange;
  ctaRequirements: string[];
  sourceFacts: string[];
  missingData: string[];
  researchSummary: string;
};

type SeoLengthRange = {
  min: number;
  target: number;
  max: number;
};

function getSeoLengthRange(intentRaw: string): SeoLengthRange {
  const intent = intentRaw.toLowerCase();
  if (/commercial|transactional|service|купить|заказ|lead/.test(intent)) {
    return { min: 5500, target: 6200, max: 7600 };
  }
  if (/informational|faq|guide|blog|info/.test(intent)) {
    return { min: 4200, target: 5200, max: 6800 };
  }
  return { min: 4800, target: 5600, max: 7000 };
}

function buildFallbackSectionData(brief: ContentBrief): FallbackSectionData {
  const fallbackRange = getSeoLengthRange(asText(brief.search_intent).trim());
  const rawLength = brief.length_requirements;
  const min = typeof rawLength?.min_chars === "number" ? rawLength.min_chars : fallbackRange.min;
  const target = typeof rawLength?.target_chars === "number" ? rawLength.target_chars : fallbackRange.target;
  const max = typeof rawLength?.max_chars === "number" ? rawLength.max_chars : fallbackRange.max;
  const normalizedRange: SeoLengthRange = {
    min: clampInt(min, 1500, 12000),
    target: clampInt(Math.max(target, min + 200), 1800, 14000),
    max: clampInt(Math.max(max, target + 200), 2200, 18000),
  };

  return {
    primary: asText(brief.primary_keyword).trim() || "услуга",
    pageGoal: asText(brief.page_goal).trim(),
    targetUser: asText(brief.target_user).trim(),
    intent: asText(brief.search_intent).trim(),
    businessGoal: asText(brief.business_goal).trim(),
    secondaryKeywords: asTextList(brief.secondary_keywords, 14),
    questions: asTextList(brief.questions_to_answer, 10),
    nextQuestionIntents: asTextList(brief.next_question_intents, 8),
    differentiationPoints: asTextList(brief.differentiation_points, 8),
    evidenceRequirements: asTextList(brief.evidence_requirements, 8),
    trustSignals: asTextList(brief.trust_signals, 8),
    serpFeatures: asTextList(brief.serp_features, 8),
    keywordUsagePolicy: asText(brief.keyword_usage_policy).trim(),
    externalSourcePolicy: asText(brief.external_source_policy).trim(),
    lengthRequirements: normalizedRange,
    ctaRequirements: asTextList(brief.cta_requirements, 8),
    sourceFacts: asTextList(brief.source_facts, 12),
    missingData: asTextList(brief.missing_data, 6),
    researchSummary: asText(brief.research_summary).trim(),
  };
}

function buildArticlePromptPayload(brief: ContentBrief): Record<string, unknown> {
  const length = brief.length_requirements;
  const lengthRequirements = length && typeof length === "object"
    ? {
        min_chars: clampInt(Number(length.min_chars) || 0, 1200, 12000),
        target_chars: clampInt(Number(length.target_chars) || 0, 1400, 14000),
        max_chars: clampInt(Number(length.max_chars) || 0, 1600, 18000),
      }
    : undefined;

  return {
    page_goal: compactText(brief.page_goal, 240),
    page_type: compactText(brief.page_type, 80),
    search_intent: compactText(brief.search_intent, 120),
    target_user: compactText(brief.target_user, 240),
    business_goal: compactText(brief.business_goal, 240),
    primary_keyword: compactText(brief.primary_keyword, 180),
    secondary_keywords: asTextList(brief.secondary_keywords, 14),
    questions_to_answer: asTextList(brief.questions_to_answer, 12),
    required_blocks: asTextList(brief.required_blocks, 10),
    forbidden_claims: asTextList(brief.forbidden_claims, 10),
    source_facts: asTextList(brief.source_facts, 16),
    missing_data: asTextList(brief.missing_data, 8),
    internal_link_targets: asTextList(brief.internal_link_targets, 8),
    cta_requirements: asTextList(brief.cta_requirements, 8),
    meta_requirements: {
      title_rule: compactText(brief.meta_requirements?.title_rule, 220),
      description_rule: compactText(brief.meta_requirements?.description_rule, 220),
    },
    schema_requirements: asTextList(brief.schema_requirements, 6),
    quality_requirements: asTextList(brief.quality_requirements, 10),
    next_question_intents: asTextList(brief.next_question_intents, 8),
    differentiation_points: asTextList(brief.differentiation_points, 8),
    evidence_requirements: asTextList(brief.evidence_requirements, 8),
    trust_signals: asTextList(brief.trust_signals, 8),
    serp_features: asTextList(brief.serp_features, 8),
    external_source_policy: compactText(brief.external_source_policy, 1000),
    keyword_usage_policy: compactText(brief.keyword_usage_policy, 1000),
    length_requirements: lengthRequirements,
    research_summary: compactText(brief.research_summary, 3200),
    research_sources: compactResearchSources(brief.research_sources, 8),
  };
}

function fallbackFaqAnswer(question: string, primary: string): string {
  const q = question.toLowerCase();
  if (/что включает|что входит/.test(q)) {
    return "Обычно услуга включает анализ задачи, согласование этапов выполнения, организацию работ на площадке и контроль промежуточного и итогового результата.";
  }
  if (/цена|стоим|сколько/.test(q)) {
    return "Стоимость рассчитывается индивидуально. На итог влияют объем работ, состояние и площадь участка, сложность логистики и требуемые сроки запуска.";
  }
  if (/срок|когда|время/.test(q)) {
    return "Сроки определяются после оценки задачи и условий объекта. Обычно сначала согласуют этапы и доступность площадки, после чего фиксируют рабочий график.";
  }
  if (/данные|нужн|какие.*параметр|для оформления/.test(q)) {
    return "Для корректного расчета обычно нужны параметры площадки, ожидаемый результат, ограничения по срокам и удобный канал связи для уточнений.";
  }
  if (/риск|ошиб|учесть/.test(q)) {
    return "Ключевые риски: неточная постановка задачи, неполные исходные данные и отсутствие согласованных критериев приемки. Эти моменты лучше закрыть до старта.";
  }
  if (/ускор|быстр/.test(q)) {
    return "Ускорение достигается за счет заранее подготовленных входных данных, согласованных этапов и оперативной коммуникации по контрольным точкам.";
  }
  if (/что входит|как.*проход|этап/.test(q)) {
    return "В стандартный процесс входят уточнение задачи, подбор оптимального решения, согласование плана работ и контроль качества результата на каждом этапе.";
  }
  if (/документ|договор|оплат/.test(q)) {
    return "Перед стартом работ обычно подтверждают договорные условия и порядок оплаты. Полный перечень документов уточняется менеджером под конкретный объект.";
  }
  return `По запросу «${primary}» оптимальный формат подбирается после короткого брифа: уточняются параметры площадки, сроки, бюджетные ожидания и приоритеты заказчика.`;
}

function buildFaqPairs(questions: string[], primary: string): Array<{ question: string; answer: string }> {
  const defaults = [
    `Что включает услуга «${primary}»?`,
    "Как рассчитываются стоимость и сроки?",
    "Какие данные нужны для оформления заявки?",
    "Какие риски важно учесть перед стартом работ?",
    "Как ускорить запуск работ без потери качества?",
  ];
  const base = questions.length > 0 ? questions.slice(0, 6) : defaults;
  return base.map((question) => ({ question, answer: fallbackFaqAnswer(question, primary) }));
}

function faqHtml(items: Array<{ question: string; answer: string }>): string {
  return items
    .map((item) => `<h3>${escapeHtml(item.question)}</h3>\n<p>${escapeHtml(item.answer)}</p>`)
    .join("\n");
}

function resolveFallbackHeading(block: string): string {
  const raw = block.trim();
  if (!raw) return "Раздел";
  const lower = raw.toLowerCase();

  if (/faq|вопрос/.test(lower)) {
    return "Частые вопросы по теме";
  }

  if (/cta|форма|заявк|заказ|связ|контакт|следующ.*шаг|запрос.*расчет|получить.*расчет/.test(lower)) {
    return "Как получить расчет и перейти к следующему шагу";
  }

  if (/критер|сравнен|вариант/.test(lower)) {
    return "Как сравнить варианты и выбрать подходящее решение";
  }

  if (/ограничен|возражен|сомнен|когда не подходит/.test(lower)) {
    return "Ограничения и что важно проверить заранее";
  }

  return raw;
}

function renderFallbackSection(block: string, data: FallbackSectionData): string {
  const title = resolveFallbackHeading(block);
  const lower = title.toLowerCase();

  if (/прямой ответ|scope|для кого|когда актуальн/.test(lower)) {
    const scope = data.nextQuestionIntents.length > 0
      ? data.nextQuestionIntents.slice(0, 4)
      : [
          `Решение по теме «${data.primary}» актуально, когда нужен прогнозируемый результат в понятные сроки.`,
          "Сначала определяют ограничения площадки и критерии приемки, затем выбирают рабочий сценарий.",
        ];
    return `<h2>${escapeHtml(title)}</h2>\n<p>Краткий ответ: по теме «${escapeHtml(data.primary)}» результат зависит от корректного scope задачи и условий объекта, а не только от формальной цены.</p>\n${listHtml(scope)}\n<p>Если эти условия заранее не зафиксированы, вероятность задержек и переделок существенно выше.</p>`;
  }

  if (/ввод|вступ|обзор/.test(lower)) {
    const intro = data.pageGoal || `Страница помогает закрыть поисковый спрос по теме «${data.primary}» и привести целевую заявку.`;
    const audience = data.targetUser
      ? `Материал ориентирован на аудиторию: ${data.targetUser}.`
      : "Материал ориентирован на пользователя, который выбирает практичное решение под конкретную задачу.";
    const intent = data.intent
      ? `Поисковый интент: ${data.intent}.`
      : "Контент построен в коммерческом формате: от проблемы к понятному сценарию обращения.";
    const related = data.secondaryKeywords.length > 0
      ? `Дополнительно раскрываем связанные запросы: ${data.secondaryKeywords.slice(0, 8).join(", ")}.`
      : "В тексте раскрыты подзадачи, которые обычно определяют выбор услуги и итоговый результат.";

    return `<h2>${escapeHtml(title)}</h2>\n<p>${escapeHtml(intro)}</p>\n<p>${escapeHtml(audience)} ${escapeHtml(intent)}</p>\n<p>${escapeHtml(related)}</p>`;
  }

  if (/когда|нужна|примен|область|для чего/.test(lower)) {
    const scenarios = data.secondaryKeywords.length > 0
      ? data.secondaryKeywords.slice(0, 6).map((k) => `Запрос или сценарий: ${k}.`)
      : [
        `Работы по теме «${data.primary}» планируются при подготовке объекта к дальнейшим этапам строительства или благоустройства.`,
        "Отдельное внимание уделяют условиям площадки, доступности техники и согласованию последовательности операций.",
      ];

    return `<h2>${escapeHtml(title)}</h2>\n<p>Услуга востребована, когда нужен прогнозируемый результат, контролируемые сроки и прозрачная схема взаимодействия с исполнителем.</p>\n${listHtml(scenarios)}\n<p>На старте важно зафиксировать исходные условия, чтобы избежать перерасхода бюджета и сдвига сроков.</p>`;
  }

  if (/описан|услуг|этап|процесс|как.*работ|что входит/.test(lower)) {
    const facts = data.sourceFacts.length > 0
      ? `<p>Подтвержденные факты из контекста компании:</p>\n${listHtml(data.sourceFacts.slice(0, 8))}`
      : "<p>Перед стартом работ фиксируются параметры задачи, условия площадки и критерии приемки результата.</p>";
    const stages = [
      "Короткий бриф с уточнением цели работ и ограничений объекта.",
      "Подбор рабочего сценария и согласование этапов выполнения.",
      "Запуск работ с контролем промежуточного качества.",
      "Финальная проверка результата и фиксация дальнейших шагов.",
    ];
    const research = data.researchSummary
      ? `<p>${escapeHtml(data.researchSummary.slice(0, 650))}</p>`
      : "";

    return `<h2>${escapeHtml(title)}</h2>\n<p>По теме «${escapeHtml(data.primary)}» качественный результат достигается за счет понятного процесса: от корректной постановки задачи до контроля финального состояния площадки.</p>\n<p>Чем точнее определены исходные параметры, тем легче удержать сроки и избежать лишних доработок.</p>\n${facts}\n<p>Типовая структура работ:</p>\n${listHtml(stages)}${research ? `\n${research}` : ""}`;
  }

  if (/фактор|стоим|цен|срок|бюджет/.test(lower)) {
    const factors = [
      "Площадь и конфигурация участка, сложность доступа к зоне работ.",
      "Требуемый результат и критерии качества на выходе.",
      "Последовательность этапов и наличие смежных работ на объекте.",
      "Организационные ограничения: окна допуска, график, погодные условия.",
    ];
    return `<h2>${escapeHtml(title)}</h2>\n<p>Итоговая стоимость и продолжительность работ формируются после анализа исходных данных по объекту.</p>\n${listHtml(factors)}\n<p>Чтобы ускорить расчет, заранее подготовьте базовую информацию по площадке и ожидаемому результату.</p>`;
  }

  if (/критер|сравнен|вариант/.test(lower)) {
    const comparisons = data.differentiationPoints.length > 0
      ? data.differentiationPoints.slice(0, 6)
      : [
          "Сравнивайте не только цену, но и прозрачность этапов выполнения работ.",
          "Проверяйте, как исполнитель фиксирует ограничения и условия приемки.",
          "Уточняйте, какие исходные данные необходимы для точного расчета.",
        ];
    return `<h2>${escapeHtml(title)}</h2>\n<p>Для сравнения вариантов по теме «${escapeHtml(data.primary)}» используйте критерии, которые влияют на итог, а не только на стартовую стоимость.</p>\n${listHtml(comparisons)}\n<p>Такой подход снижает риск выбора решения, которое выглядит дешевле, но приводит к доработкам и потерям времени.</p>`;
  }

  if (/преимущ|почему|выгода/.test(lower)) {
    const items = [
      "Прозрачная постановка задачи и понятная логика выполнения работ.",
      "Снижение вероятности переделок за счет согласования этапов до старта.",
      "Контроль ключевых параметров, влияющих на итоговый результат.",
      "Гибкость по срокам при сохранении технологической последовательности.",
      "Фокус на практической пользе для заказчика, а не формальном объеме операций.",
    ];
    if (data.businessGoal) items.unshift(`Ориентация на бизнес-цель: ${data.businessGoal}.`);
    return `<h2>${escapeHtml(title)}</h2>\n<p>Преимущества подхода по запросу «${escapeHtml(data.primary)}»:</p>\n${listHtml(items)}\n<p>Такой подход помогает получить прогнозируемый результат и сохранить управляемость проекта на всех этапах.</p>`;
  }

  if (/выбрать|подряд|исполнител|критер/.test(lower)) {
    const checks = [
      "Попросите описать последовательность работ и критерии приемки результата.",
      "Уточните, какие исходные данные нужны для точного расчета и запуска.",
      "Проверьте, как будет организована обратная связь по ходу работ.",
      "Согласуйте перечень рисков и порядок действий при изменении условий на объекте.",
    ];
    return `<h2>${escapeHtml(title)}</h2>\n<p>Выбор исполнителя по теме «${escapeHtml(data.primary)}» стоит строить не только по цене, но и по прозрачности процесса.</p>\n${listHtml(checks)}\n<p>Чем детальнее проработаны критерии на старте, тем выше вероятность получить ожидаемый результат без лишних итераций.</p>`;
  }

  if (/ошиб|риск/.test(lower)) {
    const mistakes = [
      "Запуск работ без четко сформулированного результата и критериев качества.",
      "Оценка только по минимальной цене без анализа организационных рисков.",
      "Недостаточный сбор исходных данных по объекту до старта.",
      "Отсутствие контрольных точек в процессе выполнения.",
    ];
    return `<h2>${escapeHtml(title)}</h2>\n<p>Основные ошибки заказчика обычно связаны с неполной постановкой задачи и недооценкой исходных ограничений площадки.</p>\n${listHtml(mistakes)}\n<p>Чтобы избежать рисков, закрепите требования к результату и формат контроля еще до начала работ.</p>`;
  }

  if (/ограничен|возражен|сомнен/.test(lower)) {
    const evidence = data.evidenceRequirements.length > 0
      ? data.evidenceRequirements.slice(0, 6)
      : [
          "Уточняйте исходные данные, без них нельзя обещать точные сроки.",
          "Проверяйте применимость решения к конкретным условиям площадки.",
          "Сверяйте тезисы с практикой, а не с шаблонными общими формулировками.",
        ];
    return `<h2>${escapeHtml(title)}</h2>\n<p>Частые возражения по теме «${escapeHtml(data.primary)}» связаны с неопределенностью условий. Закрывайте их фактами, критериями и прозрачными ограничениями.</p>\n${listHtml(evidence)}\n<p>Если данных недостаточно, корректнее обозначить это явно, чем давать обещания без подтверждения.</p>`;
  }

  if (/faq|вопрос/.test(lower)) {
    const items = buildFaqPairs(data.questions, data.primary);
    return `<h2>${escapeHtml(title)}</h2>\n<p>Ниже собраны вопросы, которые чаще всего задают перед оформлением заявки:</p>\n${faqHtml(items)}`;
  }

  if (/cta|форма|заявк|заказ|связ|контакт|следующ.*шаг|получить.*расчет/.test(lower)) {
    const ctaItems = data.ctaRequirements.length > 0
      ? data.ctaRequirements.slice(0, 8)
      : [
        "Кратко опишите задачу и ожидаемый результат.",
        "Укажите адрес/локацию и желаемые сроки работ.",
        "Оставьте удобный контакт для оперативного ответа.",
      ];
    const missing = data.missingData.length > 0
      ? `<p>Для точного расчета могут потребоваться дополнительные данные: ${escapeHtml(data.missingData.slice(0, 5).join(", "))}.</p>`
      : "";

    return `<h2>${escapeHtml(title)}</h2>\n<p>Чтобы получить расчет по теме «${escapeHtml(data.primary)}», оставьте заявку и укажите параметры объекта. Это позволит быстрее подготовить реалистичное предложение по срокам и условиям.</p>\n${listHtml(ctaItems)}${missing ? `\n${missing}` : ""}`;
  }

  const generic =
    `Раздел «${title}» раскрывает практические аспекты по теме «${data.primary}» ` +
    `с учетом поискового интента «${data.intent || "commercial_service"}».`;
  return `<h2>${escapeHtml(title)}</h2>\n<p>${escapeHtml(generic)}</p>\n<p>Задача раздела — дать пользователю понятный и применимый сценарий действий до отправки заявки.</p>`;
}

function fallbackTargetChars(data: FallbackSectionData): number {
  const range = data.lengthRequirements;
  const raw = range.min + data.secondaryKeywords.length * 120 + data.questions.length * 90;
  return clampInt(raw, range.min, range.max);
}

function ensureSeoBodyLength(bodyHtml: string, data: FallbackSectionData, targetChars: number): string {
  let html = bodyHtml;
  if (htmlToText(html).length >= targetChars) return html;

  const keywordHints = data.secondaryKeywords.length > 0 ? data.secondaryKeywords : [data.primary];
  const expansions = [
    `Перед запуском работ по теме «${data.primary}» важно согласовать не только стартовые сроки, но и измеримые критерии результата. Это снижает вероятность спорных ситуаций и упрощает приемку.`,
    `Если объект имеет ограничения по доступу, логистике или очередности этапов, эти условия стоит зафиксировать заранее. Такой подход помогает избежать простоев и перерасхода бюджета.`,
    `Запрос «${keywordHints[0] || data.primary}» часто связан с практической задачей «сделать быстрее и без переделок». Для этого нужен прозрачный план работ, контрольные точки и единые ожидания по качеству.`,
    `При сравнении вариантов имеет смысл оценивать не только стоимость, но и управляемость процесса: скорость обратной связи, ясность этапов и готовность работать с изменениями на объекте.`,
    `Чем полнее исходные данные на старте, тем точнее расчет и прогноз по срокам. Минимальный набор обычно включает описание площадки, целевой результат и ограничения по графику.`,
    `Для коммерческих задач по теме «${data.primary}» особенно важен баланс между скоростью запуска и контролем качества. Оптимальный сценарий — когда оба параметра заранее зафиксированы в плане работ.`,
    `Запросы вида «${keywordHints[1] || keywordHints[0] || data.primary}» обычно требуют детализации условий до начала работ. Это помогает исполнителю подобрать корректное решение, а заказчику — прогнозировать итог без скрытых рисков.`,
    `Итоговая эффективность зависит от последовательности этапов и дисциплины выполнения. Даже небольшой чек-лист перед стартом снижает вероятность ошибок и ускоряет получение результата.`,
  ];

  html += "\n<h2>Практические рекомендации и чек-лист</h2>";
  for (const paragraph of expansions) {
    if (htmlToText(html).length >= targetChars) break;
    html += `\n<p>${escapeHtml(paragraph)}</p>`;
  }

  const tailTemplates = [
    "Перед стартом работ сформируйте короткий бриф: цель, сроки, ограничения и критерии приемки. Это экономит время на согласованиях и ускоряет запуск.",
    "На практике самый частый источник задержек — неполные исходные данные. Чем точнее вводные на старте, тем предсказуемее бюджет и график.",
    "Хороший рабочий сценарий всегда учитывает не только цену, но и управляемость процесса: этапы, ответственных и контрольные точки.",
    "Если объект сложный по доступу или логистике, эти условия лучше обсудить заранее. Это снижает риск простоев и корректировок в середине работ.",
    "Для заказчика важно заранее определить приоритет: минимальный срок, бюджет или качество. Это помогает выбрать подходящую стратегию выполнения.",
    "Отдельно стоит согласовать формат коммуникации: кто подтверждает этапы, как быстро обрабатываются изменения и в каком виде фиксируется результат.",
    "Проверочный чек-лист перед запуском обычно включает параметры площадки, план этапов, контакт ответственного и условия приемки результата.",
    "Запросы по теме спецтехники чаще всего выигрывают, когда решение подбирают под задачу объекта, а не по универсальному шаблону.",
  ];

  let guard = 0;
  while (htmlToText(html).length < targetChars && guard < 12) {
    const kw = keywordHints[guard % keywordHints.length];
    const template = tailTemplates[guard % tailTemplates.length];
    const tail =
      `По запросу «${kw}» важно согласовать ожидаемый результат и порядок взаимодействия. ${template}`;
    html += `\n<p>${escapeHtml(tail)}</p>`;
    guard += 1;
  }

  return html;
}

function hasHeadingLike(bodyHtml: string, pattern: RegExp): boolean {
  const headings = extractHeadings(bodyHtml);
  return headings.some((heading) => pattern.test(heading.toLowerCase()));
}

function containsAnyKeyword(bodyHtml: string, values: string[]): boolean {
  const text = htmlToText(bodyHtml).toLowerCase();
  return values.some((value) => {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return false;
    return text.includes(normalized);
  });
}

function countKeywordMentions(bodyHtml: string, keyword: string): number {
  const normalized = keyword.trim();
  if (!normalized) return 0;
  const plain = htmlToText(bodyHtml);
  const regex = new RegExp(escapeRegExp(normalized), "gi");
  const matches = plain.match(regex);
  return matches ? matches.length : 0;
}

function keywordMentionBounds(chars: number): { min: number; max: number } {
  const min = clampInt(Math.round(chars / 2300), 2, 5);
  const max = clampInt(Math.round(chars / 650), 7, 14);
  return { min, max: Math.max(max, min + 2) };
}

function enforceKeywordBalance(bodyHtml: string, primary: string): string {
  const keyword = primary.trim();
  if (!keyword) return bodyHtml;

  let html = bodyHtml;
  const textChars = htmlToText(html).length;
  const bounds = keywordMentionBounds(textChars);
  let mentions = countKeywordMentions(html, keyword);

  let guard = 0;
  while (mentions < bounds.min && guard < 4) {
    const extra =
      `По запросу «${keyword}» важно заранее согласовать критерии результата и формат взаимодействия, ` +
      "чтобы снизить риски задержек и избежать переработок на объекте.";
    html += `\n<p>${escapeHtml(extra)}</p>`;
    mentions += 1;
    guard += 1;
  }

  if (mentions <= bounds.max) return html;

  const regex = new RegExp(escapeRegExp(keyword), "gi");
  let seen = 0;
  return html.replace(regex, (match) => {
    seen += 1;
    if (seen <= bounds.max) return match;
    return "услуга по уплотнению грунта";
  });
}

function enforceIntentCoverage(bodyHtml: string, data: FallbackSectionData): string {
  let html = bodyHtml;

  if (data.nextQuestionIntents.length > 0 && !containsAnyKeyword(html, data.nextQuestionIntents)) {
    html += `\n<h2>Важные уточнения перед выбором решения</h2>\n${listHtml(data.nextQuestionIntents.slice(0, 6))}`;
  }

  if (data.differentiationPoints.length > 0 && !containsAnyKeyword(html, data.differentiationPoints)) {
    html += `\n<h2>Что отличает сильное решение от шаблонного</h2>\n${listHtml(data.differentiationPoints.slice(0, 6))}`;
  }

  if (data.evidenceRequirements.length > 0 && !containsAnyKeyword(html, data.evidenceRequirements)) {
    html += `\n<h2>Как проверять обоснованность рекомендаций</h2>\n${listHtml(data.evidenceRequirements.slice(0, 6))}`;
  }

  if (data.trustSignals.length > 0 && !containsAnyKeyword(html, data.trustSignals)) {
    html += `\n<h2>Сигналы доверия и прозрачности</h2>\n${listHtml(data.trustSignals.slice(0, 6))}`;
  }

  return html;
}

function normalizeArticleHtml(bodyHtml: string): string {
  return bodyHtml
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function removeAdjacentDuplicateParagraphs(bodyHtml: string): string {
  const parts = bodyHtml.split(/(<p\b[^>]*>[\s\S]*?<\/p>)/gi);
  let lastParagraph = "";

  const out = parts
    .map((part) => {
      if (!/^<p\b/i.test(part)) return part;
      const normalized = htmlToText(part).toLowerCase().replace(/\s+/g, " ").trim();
      if (!normalized) return "";
      if (normalized === lastParagraph) return "";
      lastParagraph = normalized;
      return part;
    })
    .join("");

  return out;
}

function postEditArticleBody(bodyHtml: string, brief: ContentBrief, mode: "fallback" | "llm"): string {
  if (mode === "llm") {
    // Keep LLM narrative intact: only normalize formatting and remove accidental duplicate paragraphs.
    const normalized = removeAdjacentDuplicateParagraphs(normalizeArticleHtml(bodyHtml));
    const data = buildFallbackSectionData(brief);
    return enforceIntentCoverage(normalized, data);
  }

  const data = buildFallbackSectionData(brief);
  const range = data.lengthRequirements;

  let html = bodyHtml;

  if (!hasHeadingLike(html, /(выбрать|подряд)/i)) {
    html += `\n${renderFallbackSection("Как выбрать подрядчика", data)}`;
  }

  if (!hasHeadingLike(html, /(ошиб|риск)/i)) {
    html += `\n${renderFallbackSection("Типичные ошибки заказчика", data)}`;
  }

  if (!hasHeadingLike(html, /(cta|заявк|форма|связ|контакт|следующ.*шаг|получить.*расчет)/i)) {
    html += `\n${renderFallbackSection("Следующий шаг: как получить расчет", data)}`;
  }

  if (!hasHeadingLike(html, /(критер|сравнен|вариант)/i)) {
    html += `\n${renderFallbackSection("Как сравнить варианты по задаче", data)}`;
  }

  if (!hasHeadingLike(html, /(ограничен|возражен|сомнен)/i)) {
    html += `\n${renderFallbackSection("Ограничения и что важно проверить заранее", data)}`;
  }

  if (htmlToText(html).length < range.min) {
    html = ensureSeoBodyLength(html, data, range.target);
  }

  html = enforceIntentCoverage(html, data);
  html = enforceKeywordBalance(html, data.primary);
  return normalizeArticleHtml(html);
}

function fallbackArticle(brief: ContentBrief): GeneratedArticle {
  const data = buildFallbackSectionData(brief);
  const requiredBlocks = asTextList(brief.required_blocks, 12);

  const title = data.primary.charAt(0).toUpperCase() + data.primary.slice(1);
  const faq = buildFaqPairs(data.questions, data.primary);

  const defaultBlocks = [
    "Частые вопросы по теме",
    "Следующий шаг: как получить расчет",
  ];
  const blocksToRender = requiredBlocks.length > 0 ? requiredBlocks : defaultBlocks;

  let bodyHtml = blocksToRender.map((block) => renderFallbackSection(block, data)).join("\n");

  if (!blocksToRender.some((b) => /faq/i.test(b))) {
    bodyHtml += `\n${renderFallbackSection("FAQ", data)}`;
  }
  if (!blocksToRender.some((b) => /cta|форма|заявк|связ|контакт|следующ.*шаг|расчет/i.test(b))) {
    bodyHtml += `\n${renderFallbackSection("Следующий шаг: как получить расчет", data)}`;
  }

  bodyHtml = ensureSeoBodyLength(bodyHtml, data, fallbackTargetChars(data));
  bodyHtml = enforceIntentCoverage(bodyHtml, data);
  bodyHtml = enforceKeywordBalance(bodyHtml, data.primary);

  const metaBase = data.pageGoal
    ? `${data.primary}: ${data.pageGoal}`
    : `${data.primary}: описание услуги, этапы, факторы стоимости, преимущества, FAQ и заявка.`;

  return {
    title,
    slug: slugify(data.primary),
    seo_title: `${title} - условия, этапы, FAQ`.slice(0, 70),
    meta_description: metaBase.slice(0, 160),
    body_html: bodyHtml,
    body_markdown: "",
    faq,
  };
}

type PlanRow = { id: number; cluster_id: number };

type ImagePlacementPlan = {
  anchor_h2?: string;
  prompt: string;
  alt?: string;
};

type ImagePlanResponse = {
  placements?: ImagePlacementPlan[];
};

type InsertedImage = {
  html: string;
  anchor_h2?: string;
};

function resolvePublicDir(): string {
  const candidates = [path.join(process.cwd(), "public"), path.join(process.cwd(), "frontend", "public")];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  return found ?? candidates[0];
}

function imageExtByMime(mimeType: string): string {
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  return "png";
}

function extractHeadings(bodyHtml: string): string[] {
  const matches = [...bodyHtml.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)];
  return matches
    .map((match) => asText(match[1]).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function paragraphCount(bodyHtml: string): number {
  return (bodyHtml.match(/<p\b/gi) || []).length;
}

function h2Count(bodyHtml: string): number {
  return (bodyHtml.match(/<h2\b/gi) || []).length;
}

function hasForbiddenBodyTags(bodyHtml: string): boolean {
  return /<(form|script|style|iframe|button)\b/i.test(bodyHtml);
}

function htmlToText(bodyHtml: string): string {
  return bodyHtml
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function meaningfulParagraphCount(bodyHtml: string, minChars = 40): number {
  const matches = [...bodyHtml.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)];
  return matches.filter((match) => htmlToText(asText(match[1])).length >= minChars).length;
}

type BodyQuality = {
  textLength: number;
  richParagraphs: number;
  headingsH2: number;
  forbiddenTags: boolean;
  hasComparisonSignals: boolean;
  hasConstraintSignals: boolean;
  hasCtaSignals: boolean;
  hasEvidenceSignals: boolean;
  duplicateParagraphRate: number;
};

function assessArticleBodyQuality(bodyHtml: string): BodyQuality {
  const text = htmlToText(bodyHtml).toLowerCase();
  const paragraphs = [...bodyHtml.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((match) => htmlToText(asText(match[1])).toLowerCase().replace(/\s+/g, " ").trim())
    .filter((item) => item.length > 30);
  const uniq = new Set(paragraphs);
  const duplicateParagraphRate =
    paragraphs.length === 0 ? 0 : Math.max(0, (paragraphs.length - uniq.size) / paragraphs.length);

  return {
    textLength: text.length,
    richParagraphs: meaningfulParagraphCount(bodyHtml, 55),
    headingsH2: h2Count(bodyHtml),
    forbiddenTags: hasForbiddenBodyTags(bodyHtml),
    hasComparisonSignals: /(сравнен|критер|вариант|альтернатив)/i.test(text),
    hasConstraintSignals: /(ограничен|когда не|не подходит|услов|риск|ошиб)/i.test(text),
    hasCtaSignals: /(заявк|связ|позвон|контакт|оставьте|обратн)/i.test(text),
    hasEvidenceSignals: /(пример|кейс|чек-?лист|пошаг|критер|практич|данн|факт)/i.test(text),
    duplicateParagraphRate,
  };
}

function isAcceptableLlmArticleBody(bodyHtml: string, minTextLength: number): boolean {
  const quality = assessArticleBodyQuality(bodyHtml);
  return (
    quality.textLength >= minTextLength &&
    quality.richParagraphs >= 5 &&
    quality.headingsH2 >= 5 &&
    !quality.forbiddenTags &&
    quality.hasComparisonSignals &&
    quality.hasConstraintSignals &&
    quality.hasCtaSignals &&
    quality.hasEvidenceSignals &&
    quality.duplicateParagraphRate <= 0.25
  );
}

function qualitySummary(quality: BodyQuality, minTextLength: number): string {
  const reasons: string[] = [];
  if (quality.textLength < minTextLength) {
    reasons.push(`текста мало (${quality.textLength} < ${minTextLength})`);
  }
  if (quality.richParagraphs < 5) reasons.push(`мало содержательных абзацев (${quality.richParagraphs} < 5)`);
  if (quality.headingsH2 < 5) reasons.push(`мало H2-разделов (${quality.headingsH2} < 5)`);
  if (quality.forbiddenTags) reasons.push("обнаружены запрещенные теги form/script/style/iframe/button");
  if (!quality.hasComparisonSignals) reasons.push("нет явного блока сравнения/критериев выбора");
  if (!quality.hasConstraintSignals) reasons.push("нет ограничений/рисков/ошибок");
  if (!quality.hasCtaSignals) reasons.push("нет явного CTA для следующего шага");
  if (!quality.hasEvidenceSignals) reasons.push("не хватает доказательной/практической части");
  if (quality.duplicateParagraphRate > 0.25) {
    reasons.push(`слишком много повторов абзацев (${Math.round(quality.duplicateParagraphRate * 100)}%)`);
  }
  return reasons.length > 0 ? reasons.join("; ") : "ok";
}

function appendSourcesBlock(bodyHtml: string, brief: ContentBrief): string {
  const sources = Array.isArray(brief.research_sources) ? brief.research_sources : [];
  if (sources.length === 0) return bodyHtml;

  const items = sources
    .slice(0, 8)
    .map((source) => {
      const url = sanitizeExternalUrl(source.url);
      if (!url) return "";
      const title = escapeHtml(source.title || url);
      return `<li><a href="${url}" target="_blank" rel="nofollow noopener noreferrer">${title}</a></li>`;
    })
    .filter((item) => item.length > 0)
    .join("\n");

  if (!items) return bodyHtml;
  return `${bodyHtml}\n<h2>Источники и материалы по теме</h2>\n<ul>\n${items}\n</ul>`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function insertImagesByAnchors(bodyHtml: string, images: InsertedImage[]): { html: string; rest: InsertedImage[] } {
  let html = bodyHtml;
  const rest: InsertedImage[] = [];
  for (const image of images) {
    const anchor = (image.anchor_h2 || "").trim();
    if (!anchor) {
      rest.push(image);
      continue;
    }
    const regex = new RegExp(`(<h2[^>]*>[^<]*${escapeRegExp(anchor)}[^<]*<\\/h2>)`, "i");
    if (!regex.test(html)) {
      rest.push(image);
      continue;
    }
    html = html.replace(regex, `$1\n${image.html}`);
  }
  return { html, rest };
}

function insertImagesEveryThreeParagraphs(bodyHtml: string, images: InsertedImage[]): string {
  if (images.length === 0) return bodyHtml;
  const parts = bodyHtml.split(/(<\/p>)/i);
  let paragraphIndex = 0;
  let imageIndex = 0;
  const out: string[] = [];

  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    out.push(part);
    if (!/^<\/p>$/i.test(part)) continue;
    paragraphIndex += 1;
    if (paragraphIndex % 3 !== 0) continue;
    if (imageIndex >= images.length) continue;
    out.push(`\n${images[imageIndex].html}\n`);
    imageIndex += 1;
  }

  while (imageIndex < images.length) {
    out.push(`\n${images[imageIndex].html}\n`);
    imageIndex += 1;
  }

  return out.join("");
}

async function buildImagePlan(
  brief: ContentBrief,
  article: GeneratedArticle,
  maxImages: number,
): Promise<ImagePlacementPlan[]> {
  if (maxImages <= 0) return [];
  const headings = extractHeadings(article.body_html);
  const paragraphTotal = paragraphCount(article.body_html);
  const planned = Math.max(1, Math.min(maxImages, Math.floor(paragraphTotal / 3)));
  const llm = await chatJson<ImagePlanResponse>({
    modelSlot: "cheap",
    system:
      "Ты редактор SEO-статьи. Верни JSON: { placements: [{ anchor_h2, prompt, alt }] }. " +
      "Нужно 1-4 изображения по смысловым разделам статьи. prompt на русском, конкретный и безопасный. " +
      "anchor_h2 должен быть одним из переданных заголовков H2 или пустым.",
    user: JSON.stringify({
      primary_keyword: brief.primary_keyword,
      title: article.title,
      headings,
      desired_count: planned,
    }),
    temperature: 0.2,
    maxTokens: 600,
  });

  const placements = Array.isArray(llm?.placements) ? llm!.placements : [];
  const valid = placements
    .map((item) => ({
      anchor_h2: asText(item.anchor_h2),
      prompt: asText(item.prompt),
      alt: asText(item.alt),
    }))
    .filter((item) => item.prompt.length > 15)
    .slice(0, planned);

  if (valid.length > 0) return valid;

  return headings.slice(0, planned).map((heading) => ({
    anchor_h2: heading,
    prompt: `Реалистичная строительная сцена по теме: ${heading}. Спецтехника в работе, дневной свет, без текста и логотипов.`,
    alt: heading,
  }));
}

async function generateAndInsertImages(
  article: GeneratedArticle,
  brief: ContentBrief,
  isTimedOut?: () => boolean,
  maxImages = 4,
): Promise<string> {
  const plan = await buildImagePlan(brief, article, maxImages);
  if (plan.length === 0) return article.body_html;

  const publicDir = resolvePublicDir();
  const imageDir = path.join(publicDir, "assets", "seo-ai");
  fs.mkdirSync(imageDir, { recursive: true });

  const inserted: InsertedImage[] = [];
  for (let index = 0; index < plan.length; index += 1) {
    if (isTimedOut?.()) break;
    const item = plan[index];
    const image = await generateImage(item.prompt, "1536x1024");
    if (!image) continue;

    const ext = imageExtByMime(image.mimeType);
    const fileName = `${article.slug || "article"}-${Date.now()}-${index + 1}.${ext}`;
    const filePath = path.join(imageDir, fileName);
    fs.writeFileSync(filePath, image.bytes);

    const relative = `/assets/seo-ai/${fileName}`;
    const alt = escapeHtml(item.alt || item.anchor_h2 || article.title);
    const figure =
      `<figure class=\"seo-ai-image\">` +
      `<img src=\"${relative}\" alt=\"${alt}\" loading=\"lazy\" decoding=\"async\" />` +
      `</figure>`;
    inserted.push({ html: figure, anchor_h2: item.anchor_h2 });
  }

  if (inserted.length === 0) return article.body_html;
  const byAnchor = insertImagesByAnchors(article.body_html, inserted);
  return insertImagesEveryThreeParagraphs(byAnchor.html, byAnchor.rest);
}

type GenerateArticleOptions = {
  isTimedOut?: () => boolean;
  remainingMs?: () => number;
  disableImages?: boolean;
};

/** Generate and persist an article draft for a plan item with a ready brief. */
export async function generateArticle(planItemId: number, options: GenerateArticleOptions = {}): Promise<number> {
  const briefRow = await one<{ id: number; brief: ContentBrief }>(
    `SELECT id, brief FROM seo.content_briefs WHERE content_plan_item_id = $1 ORDER BY id DESC LIMIT 1`,
    [planItemId],
  );
  if (!briefRow) throw new Error(`No brief for plan item ${planItemId}`);
  const plan = await one<PlanRow>(`SELECT id, cluster_id FROM seo.content_plan_items WHERE id = $1`, [planItemId]);
  if (!plan) throw new Error(`Plan item ${planItemId} not found`);

  const brief = briefRow.brief;
  const llmMinTextLength = buildFallbackSectionData(brief).lengthRequirements.min;
  const allowFallback = process.env.SEO_ALLOW_ARTICLE_FALLBACK === "1";
  const tryLlmInFallback = process.env.SEO_TRY_LLM_WITH_FALLBACK !== "0";
  const tryImagesInFallback = process.env.SEO_TRY_IMAGES_WITH_FALLBACK === "1";
  const allowTemplateOnQuota = process.env.SEO_ALLOW_TEMPLATE_ON_QUOTA === "1";
  const minImageBudgetMs = envInt("SEO_ARTICLE_IMAGE_MIN_REMAINING_MS", 120_000, 0, 3_600_000);
  const maxArticleImages = envInt("SEO_ARTICLE_MAX_IMAGES", 3, 0, 6);
  const shouldCallLlm = !allowFallback || tryLlmInFallback;
  let article = fallbackArticle(brief);
  let articleMode: "fallback" | "llm" = "fallback";
  const articlePrompt = buildArticlePromptPayload(brief);

  const llm = shouldCallLlm
    ? await chatJson<GeneratedArticle>({
      modelSlot: "strong",
      temperature: 0.5,
      maxTokens: 4200,
      system:
        "Ты опытный SEO-копирайтер. Напиши черновик страницы для сайта на русском СТРОГО по переданному ТЗ. " +
        "Работай по gold standard SEO content 2026: helpful content, answer-ready sections, next-question intent, information gain, конкретные критерии выбора и практические шаги. " +
        "Используй только факты из source_facts ТЗ. Не выдумывай цены, характеристики, районы, сроки и кейсы. " +
        "Для полезной экспертной части используй research_summary и research_sources из ТЗ: добавляй практические рекомендации, критерии выбора, типовые ошибки и чек-листы. " +
        "Учитывай external_source_policy и keyword_usage_policy из ТЗ. " +
        "Не делай SEO-текст ради плотности ключей: ключи должны быть естественными и смысловыми. " +
        "Каждый H2 должен быть самодостаточным и понятным вне контекста. " +
        "В каждом H2 сначала дай прямой ответ 1-2 предложениями, затем добавь контекст и структурированные пункты (список/таблица). " +
        "Обязательно закрой: сравнение вариантов, ограничения/когда не подходит, типовые ошибки, следующий шаг пользователя (CTA). " +
        "Избегай broad-claims без уточнений (для кого, при каких условиях, какие ограничения). " +
        "Если используешь данные из ресерча, формулируй нейтрально и не приписывай их компании. " +
        "Не пиши служебные пометки для редактора, внутренние инструкции и технические дисклеймеры в body_html. " +
        "Запрещено вставлять в body_html теги <form>, <script>, <style>, <iframe>, <button> и JSON-LD. " +
        `Нужна полноценная экспертная статья: минимум ${llmMinTextLength} символов чистого текста, минимум 5 разделов H2 и минимум 5 содержательных абзацев. ` +
        "Избегай повторяющихся предложений и штампов. " +
        "Трактуй required_blocks как минимальные функциональные требования, а не как буквальные заголовки. " +
        "Остальные H2 и их формулировки выбери сам на основе research_summary/research_sources и интента. " +
        "Естественно используй primary_keyword и secondary_keywords. " +
        "Верни строго JSON: {title, slug, seo_title, meta_description, body_html, faq:[{question,answer}]}. " +
        "body_html — валидный HTML с <h2>/<p>/<ul>; без <html>/<body>. slug — латиницей. meta_description до 160 символов.",
      user: JSON.stringify(articlePrompt),
    })
    : null;
  if (llm && llm.title && llm.body_html) {
    const title = asText(llm.title);
    const candidate: GeneratedArticle = {
      title,
      slug: llm.slug ? slugify(llm.slug) : slugify(title),
      seo_title: asText(llm.seo_title) || title,
      meta_description: asText(llm.meta_description).slice(0, 160),
      body_html: asText(llm.body_html),
      body_markdown: asText(llm.body_markdown),
      faq: Array.isArray(llm.faq)
        ? llm.faq.map((f) => ({ question: asText(f?.question), answer: asText(f?.answer) }))
        : [],
    };
    if (isAcceptableLlmArticleBody(candidate.body_html, llmMinTextLength)) {
      article = candidate;
      articleMode = "llm";
    } else {
      const quality = assessArticleBodyQuality(candidate.body_html);
      const details = qualitySummary(quality, llmMinTextLength);
      throw new Error(
        "LLM вернула черновик ниже минимальных критериев качества: " +
          `${details}. ` +
          "Черновик не сохранён. Повторите генерацию (fallback для низкого качества отключен).",
      );
    }
  } else if (shouldCallLlm) {
    const reason = getLastChatError();
    const quotaIssue = /insufficient_quota|billing\s+hard\s+limit/i.test(reason ?? "");

    if (quotaIssue && !allowTemplateOnQuota) {
      throw new Error(
        `LLM недоступна из-за квоты${reason ? `: ${reason}` : ""}. ` +
          "Шаблонный fallback для quota-ошибок отключен. Пополните квоту OpenAI и повторите генерацию.",
      );
    }

    if (!allowFallback) {
      throw new Error(
        `Не удалось сгенерировать текст статьи через LLM${reason ? `: ${reason}` : ""}. ` +
          "Проверьте OPENAI_MODEL_STRONG, квоту и доступ к модели. " +
          "Для аварийного режима можно включить SEO_ALLOW_ARTICLE_FALLBACK=1.",
      );
    }
  }

  article.body_html = postEditArticleBody(article.body_html, brief, articleMode);
  article.body_html = appendSourcesBlock(article.body_html, brief);
  if (options.isTimedOut?.()) {
    throw new Error(`Article for plan #${planItemId}: timed out before media generation`);
  }
  const hasImageTimeBudget = options.remainingMs ? options.remainingMs() >= minImageBudgetMs : true;
  const shouldGenerateImages =
    !options.disableImages &&
    maxArticleImages > 0 &&
    hasImageTimeBudget &&
    (!allowFallback || tryImagesInFallback);

  if (shouldGenerateImages) {
    article.body_html = await generateAndInsertImages(article, brief, options.isTimedOut, maxArticleImages);
  } else if (!hasImageTimeBudget) {
    console.warn(
      `[seo/article] skip images for plan #${planItemId}: remaining time ${options.remainingMs?.()}ms below budget ${minImageBudgetMs}ms`,
    );
  }

  if (options.isTimedOut?.()) {
    throw new Error(`Article for plan #${planItemId}: timed out before persistence`);
  }

  const urlPath = `/${article.slug || "stranica"}/`;
  const schema =
    article.faq.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: article.faq.map((f) => ({
            "@type": "Question",
            name: f.question,
            acceptedAnswer: { "@type": "Answer", text: f.answer },
          })),
        }
      : null;

  const row = await one<{ id: number }>(
    `INSERT INTO seo.generated_articles
       (content_plan_item_id, brief_id, title, slug, url_path, seo_title, meta_description,
        body_html, body_markdown, faq, schema_jsonld, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'draft') RETURNING id`,
    [
      planItemId,
      briefRow.id,
      article.title,
      article.slug,
      urlPath,
      article.seo_title,
      article.meta_description,
      article.body_html,
      article.body_markdown,
      JSON.stringify(article.faq),
      schema ? JSON.stringify(schema) : null,
    ],
  );

  await run(`UPDATE seo.content_plan_items SET status = 'content_generated', updated_at = NOW() WHERE id = $1`, [
    planItemId,
  ]);

  return row!.id;
}
