import "server-only";

import { run } from "./db";
import { normalize } from "./clean";
import type { Intent, RecommendedAction, SitePage } from "./types";

/**
 * Site Gap Analyzer (Task.md §13). Compares each cluster against existing site
 * pages to decide whether to create a new page, update an existing one, add an
 * FAQ/section, or do nothing — and flags cannibalization risk.
 */

let cachedPages: { page: SitePage; lemmas: Set<string> }[] | null = null;

export async function loadSitePages(): Promise<{ page: SitePage; lemmas: Set<string> }[]> {
  if (cachedPages) return cachedPages;
  const queries = [
    { source: "page", sql: `SELECT 'page' AS source, url_path, title, seo_title, meta_description, body FROM public.pages WHERE url_path IS NOT NULL` },
    { source: "post", sql: `SELECT 'post' AS source, url_path, title, seo_title, meta_description, body FROM public.posts WHERE url_path IS NOT NULL` },
    { source: "equipment_type", sql: `SELECT 'equipment_type' AS source, url_path, name AS title, seo_title, meta_description, body FROM public.equipment_types WHERE url_path IS NOT NULL` },
    { source: "work_type", sql: `SELECT 'work_type' AS source, url_path, name AS title, seo_title, meta_description, body FROM public.work_types WHERE url_path IS NOT NULL` },
    { source: "brand", sql: `SELECT 'brand' AS source, url_path, name AS title, seo_title, meta_description, body FROM public.brands WHERE url_path IS NOT NULL` },
  ];
  const all: SitePage[] = [];
  for (const q of queries) {
    try {
      const rows = await run<SitePage>(q.sql);
      all.push(...rows);
    } catch {
      // table may not exist in some environments — skip gracefully
    }
  }
  cachedPages = all.map((page) => {
    const text = `${page.title} ${page.seo_title ?? ""} ${page.meta_description ?? ""}`;
    return { page, lemmas: new Set(normalize(text).lemmas) };
  });
  return cachedPages;
}

export function resetSiteCache() {
  cachedPages = null;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const item of a) if (b.has(item)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

export type GapResult = {
  recommended_action: RecommendedAction;
  target_existing_url: string | null;
  similar_urls: string[];
  cannibalization_risk: boolean;
  reason: string;
};

export async function analyzeGap(primaryKeyword: string, intent: Intent | null): Promise<GapResult> {
  const pages = await loadSitePages();
  const queryLemmas = new Set(normalize(primaryKeyword).lemmas);

  const scored = pages
    .map(({ page, lemmas }) => ({ url: page.url_path, score: jaccard(queryLemmas, lemmas) }))
    .filter((entry) => entry.score > 0.18)
    .sort((a, b) => b.score - a.score);

  const similar_urls = scored.slice(0, 5).map((s) => s.url);
  const strongMatches = scored.filter((s) => s.score >= 0.5);
  const best = scored[0];

  const isQuestion = intent === "faq" || intent === "informational_how_to" || intent === "informational_selection";

  if (!best) {
    return {
      recommended_action: "create_new_page",
      target_existing_url: null,
      similar_urls,
      cannibalization_risk: false,
      reason: "Под этот спрос не найдено существующей страницы",
    };
  }

  if (strongMatches.length >= 2) {
    return {
      recommended_action: "manual_review",
      target_existing_url: best.url,
      similar_urls,
      cannibalization_risk: true,
      reason: "Несколько похожих страниц — риск каннибализации, нужна ручная проверка",
    };
  }

  if (best.score >= 0.5) {
    if (isQuestion) {
      return {
        recommended_action: "add_faq_to_existing_page",
        target_existing_url: best.url,
        similar_urls,
        cannibalization_risk: false,
        reason: "Вопросный интент уже близок к существующей странице — добавить FAQ-блок",
      };
    }
    return {
      recommended_action: "update_existing_page",
      target_existing_url: best.url,
      similar_urls,
      cannibalization_risk: false,
      reason: "Есть подходящая страница — усилить её вместо создания дубля",
    };
  }

  if (best.score >= 0.3) {
    return {
      recommended_action: "add_section_to_existing_page",
      target_existing_url: best.url,
      similar_urls,
      cannibalization_risk: false,
      reason: "Кластер раскрывает подтему существующей страницы",
    };
  }

  return {
    recommended_action: "create_new_page",
    target_existing_url: null,
    similar_urls,
    cannibalization_risk: false,
    reason: "Совпадения слабые — оправдано создание отдельной страницы",
  };
}
