import "server-only";

import { one, run } from "./db";
import { chatJson, MODELS } from "./openai";
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

function fallbackArticle(brief: ContentBrief): GeneratedArticle {
  const primary = asText(brief.primary_keyword);
  const pageGoal = asText(brief.page_goal);
  const title = primary.charAt(0).toUpperCase() + primary.slice(1);
  const questions = Array.isArray(brief.questions_to_answer) ? brief.questions_to_answer : [];
  const faq = questions.slice(0, 5).map((q) => ({ question: asText(q), answer: "" }));
  const requiredBlocks = Array.isArray(brief.required_blocks) ? brief.required_blocks : [];
  const blocks = requiredBlocks.map((b) => `<h2>${escapeHtml(b)}</h2>\n<p></p>`).join("\n");
  return {
    title,
    slug: slugify(primary),
    seo_title: title,
    meta_description: pageGoal.slice(0, 160),
    body_html: `<p>${escapeHtml(pageGoal)}</p>\n${blocks}`,
    body_markdown: "",
    faq,
  };
}

type PlanRow = { id: number; cluster_id: number };

/** Generate and persist an article draft for a plan item with a ready brief. */
export async function generateArticle(planItemId: number): Promise<number> {
  const briefRow = await one<{ id: number; brief: ContentBrief }>(
    `SELECT id, brief FROM seo.content_briefs WHERE content_plan_item_id = $1 ORDER BY id DESC LIMIT 1`,
    [planItemId],
  );
  if (!briefRow) throw new Error(`No brief for plan item ${planItemId}`);
  const plan = await one<PlanRow>(`SELECT id, cluster_id FROM seo.content_plan_items WHERE id = $1`, [planItemId]);
  if (!plan) throw new Error(`Plan item ${planItemId} not found`);

  const brief = briefRow.brief;
  let article = fallbackArticle(brief);

  const llm = await chatJson<GeneratedArticle>({
    model: MODELS.strong,
    temperature: 0.5,
    maxTokens: 3000,
    system:
      "Ты опытный SEO-копирайтер. Напиши черновик страницы для сайта на русском СТРОГО по переданному ТЗ. " +
      "Используй только факты из source_facts ТЗ. Не выдумывай цены, характеристики, районы, сроки и кейсы. " +
      "Структура по required_blocks. Естественно используй primary_keyword и secondary_keywords. " +
      "Верни строго JSON: {title, slug, seo_title, meta_description, body_html, faq:[{question,answer}]}. " +
      "body_html — валидный HTML с <h2>/<p>/<ul>; без <html>/<body>. slug — латиницей. meta_description до 160 символов.",
    user: JSON.stringify(brief),
  });
  if (llm && llm.title && llm.body_html) {
    const title = asText(llm.title);
    article = {
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

  await run(`UPDATE seo.content_plan_items SET status = 'in_content_generation', updated_at = NOW() WHERE id = $1`, [
    planItemId,
  ]);

  return row!.id;
}
