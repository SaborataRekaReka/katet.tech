import "server-only";

import { run } from "./db";
import { normalize } from "./clean";
import type { Intent, RecommendedAction, SitePage } from "./types";

/**
 * Site Gap Analyzer (Task.md §13). Compares each cluster against existing site
 * pages to decide whether to create a new page, update an existing one, add an
 * FAQ/section, or do nothing — and flags cannibalization risk.
 */

let cachedPages: { page: SitePage; lemmas: Set<string>; titleLemmas: Set<string> }[] | null = null;

export async function loadSitePages(): Promise<{ page: SitePage; lemmas: Set<string>; titleLemmas: Set<string> }[]> {
  if (cachedPages) return cachedPages;
  const queries = [
    { source: "page", sql: `SELECT 'page' AS source, url_path, title, seo_title, meta_description, LEFT(COALESCE(body, ''), 4000) AS body FROM public.pages WHERE url_path IS NOT NULL` },
    { source: "post", sql: `SELECT 'post' AS source, url_path, title, seo_title, meta_description, LEFT(COALESCE(body, ''), 4000) AS body FROM public.posts WHERE url_path IS NOT NULL` },
    { source: "equipment_type", sql: `SELECT 'equipment_type' AS source, url_path, name AS title, seo_title, meta_description, LEFT(COALESCE(body, ''), 4000) AS body FROM public.equipment_types WHERE url_path IS NOT NULL` },
    { source: "work_type", sql: `SELECT 'work_type' AS source, url_path, name AS title, seo_title, meta_description, LEFT(COALESCE(body, ''), 4000) AS body FROM public.work_types WHERE url_path IS NOT NULL` },
    { source: "brand", sql: `SELECT 'brand' AS source, url_path, name AS title, seo_title, meta_description, LEFT(COALESCE(body, ''), 4000) AS body FROM public.brands WHERE url_path IS NOT NULL` },
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
    const titleText = `${page.title} ${page.seo_title ?? ""}`;
    const text = `${titleText} ${page.meta_description ?? ""} ${page.body ?? ""}`;
    return {
      page,
      lemmas: new Set(normalize(text).lemmas),
      titleLemmas: new Set(normalize(titleText).lemmas),
    };
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

function queryCoverage(query: Set<string>, page: Set<string>): number {
  if (query.size === 0 || page.size === 0) return 0;
  let intersection = 0;
  for (const item of query) if (page.has(item)) intersection += 1;
  return intersection / query.size;
}

function hubPenalty(url: string): number {
  const lower = url.toLowerCase();
  if (lower === "/" || lower === "/blog/" || lower === "/brand/" || lower === "/tipy-rabot/" || lower === "/goroda/") {
    return 0.68;
  }
  if (lower.startsWith("/brand/") || lower.startsWith("/tipy-rabot/") || lower.startsWith("/goroda/")) {
    return 0.85;
  }
  return 1;
}

function servicePagePenalty(title: string): number {
  const lower = title.toLowerCase();
  if (/отзыв|блог|контакт|о компании|политик|соглашен|доставка|оплата/u.test(lower)) {
    return 0.72;
  }
  return 1;
}

export type GapResult = {
  recommended_action: RecommendedAction;
  target_existing_url: string | null;
  best_score: number;
  similar_urls: string[];
  similar_pages: { source: string; url: string; title: string; score: number }[];
  cannibalization_risk: boolean;
  reason: string;
};

export async function analyzeGap(primaryKeyword: string, intent: Intent | null): Promise<GapResult> {
  const pages = await loadSitePages();
  const queryLemmas = new Set(normalize(primaryKeyword).lemmas);

  const scored = pages
    .map(({ page, lemmas, titleLemmas }) => {
      const overlap = queryCoverage(queryLemmas, lemmas);
      const titleOverlap = queryCoverage(queryLemmas, titleLemmas);
      const jac = jaccard(queryLemmas, lemmas);
      const semanticScore = overlap * 0.65 + jac * 0.35;
      const titlePenalty = titleOverlap > 0 ? 1 : 0.82;
      const score = (semanticScore * 0.75 + titleOverlap * 0.25)
        * hubPenalty(page.url_path)
        * servicePagePenalty(page.title)
        * titlePenalty;
      return {
      url: page.url_path,
      source: page.source,
      title: page.title,
      score,
      overlap,
      titleOverlap,
      jac,
      };
    })
    .filter((entry) => entry.score > 0.09)
    .sort((a, b) => b.score - a.score);

  const similar_urls = scored.slice(0, 5).map((s) => s.url);
  const similar_pages = scored.slice(0, 5).map((s) => ({
    source: s.source,
    url: s.url,
    title: s.title,
    score: Number(s.score.toFixed(3)),
  }));
  const strongMatches = scored.filter((s) => s.score >= 0.62);
  const best = scored[0];

  const isQuestion = intent === "faq" || intent === "informational_how_to" || intent === "informational_selection";

  if (!best) {
    return {
      recommended_action: "create_new_page",
      target_existing_url: null,
      best_score: 0,
      similar_urls,
      similar_pages,
      cannibalization_risk: false,
      reason: "Под этот спрос не найдено существующей страницы",
    };
  }

  if (strongMatches.length >= 2) {
    return {
      recommended_action: "manual_review",
      target_existing_url: best.url,
      best_score: Number(best.score.toFixed(3)),
      similar_urls,
      similar_pages,
      cannibalization_risk: true,
      reason: "Несколько похожих страниц — риск каннибализации, нужна ручная проверка",
    };
  }

  if (best.score >= 0.62) {
    if (isQuestion) {
      return {
        recommended_action: "add_faq_to_existing_page",
        target_existing_url: best.url,
        best_score: Number(best.score.toFixed(3)),
        similar_urls,
        similar_pages,
        cannibalization_risk: false,
        reason: "Вопросный интент уже близок к существующей странице — добавить FAQ-блок",
      };
    }
    return {
      recommended_action: "update_existing_page",
      target_existing_url: best.url,
      best_score: Number(best.score.toFixed(3)),
      similar_urls,
      similar_pages,
      cannibalization_risk: false,
      reason: "Есть подходящая страница — усилить её вместо создания дубля",
    };
  }

  if (best.score >= 0.35) {
    return {
      recommended_action: "add_section_to_existing_page",
      target_existing_url: best.url,
      best_score: Number(best.score.toFixed(3)),
      similar_urls,
      similar_pages,
      cannibalization_risk: false,
      reason: "Кластер раскрывает подтему существующей страницы",
    };
  }

  return {
    recommended_action: "create_new_page",
    target_existing_url: null,
    best_score: Number(best.score.toFixed(3)),
    similar_urls,
    similar_pages,
    cannibalization_risk: false,
    reason: "Совпадения слабые — оправдано создание отдельной страницы",
  };
}
