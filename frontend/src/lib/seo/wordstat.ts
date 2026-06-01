import "server-only";

import { getWordstatConfig } from "./settings";
import type { WordstatConfig } from "./types";

/**
 * Wordstat adapter — abstracts how search-demand data is obtained.
 * Modes (Task.md §6.2):
 *   - "api"  official Yandex Wordstat API (requires OAuth token)
 *   - "csv"  manual CSV/XLSX export parsed and ingested
 *   - "mock" deterministic synthetic data so the pipeline runs without external access
 */

export type WordstatRow = {
  keyword: string;
  frequency: number;
  region: string | null;
  source: "wordstat_api" | "csv" | "mock";
};

const COMMERCIAL_MODIFIERS = ["цена", "стоимость", "заказать", "недорого", "аренда", "услуги", "с экипажем"];
const GEO_MODIFIERS = ["в Москве", "Москва", "Московская область", "в Подмосковье", "рядом"];
const QUESTION_MODIFIERS = ["как выбрать", "сколько стоит", "что лучше", "какой нужен"];

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** Deterministic pseudo-frequency so mock data is stable across runs. */
function mockFrequency(keyword: string): number {
  const base = hash(keyword) % 900;
  return base + 10;
}

function buildMockRows(seed: string, region: string | null, limit: number): WordstatRow[] {
  const variants = new Set<string>();
  variants.add(seed);
  for (const mod of COMMERCIAL_MODIFIERS) variants.add(`${seed} ${mod}`);
  for (const geo of GEO_MODIFIERS) variants.add(`${seed} ${geo}`);
  for (const q of QUESTION_MODIFIERS) variants.add(`${q} ${seed}`);
  // a few combined long-tail forms
  for (const mod of COMMERCIAL_MODIFIERS.slice(0, 3)) {
    for (const geo of GEO_MODIFIERS.slice(0, 2)) variants.add(`${seed} ${mod} ${geo}`);
  }

  return Array.from(variants)
    .slice(0, limit)
    .map((keyword) => ({
      keyword,
      frequency: mockFrequency(keyword),
      region,
      source: "mock" as const,
    }));
}

/**
 * Official Wordstat API call.
 * Docs: https://yandex.ru/support2/wordstat/en/content/api-wordstat
 * The request shape is intentionally defensive: it returns [] on any error so the
 * pipeline degrades gracefully when the token/quota is unavailable.
 */
async function fetchFromApi(seed: string, region: string | null, limit: number): Promise<WordstatRow[]> {
  const token = process.env.WORDSTAT_API_TOKEN?.trim();
  const endpoint =
    process.env.WORDSTAT_API_URL?.trim() || "https://api.wordstat.yandex.net/v1/topRequests";
  if (!token) {
    console.warn("[seo/wordstat] api mode requested but WORDSTAT_API_TOKEN is missing — returning empty set");
    return [];
  }
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ phrase: seed, regions: region ? [region] : undefined, limit }),
    });
    if (!response.ok) {
      console.warn(`[seo/wordstat] api responded ${response.status}`);
      return [];
    }
    const data = (await response.json()) as {
      topRequests?: { phrase: string; count: number }[];
    };
    return (data.topRequests ?? []).slice(0, limit).map((row) => ({
      keyword: row.phrase,
      frequency: row.count,
      region,
      source: "wordstat_api" as const,
    }));
  } catch (error) {
    console.error("[seo/wordstat] api fetch failed:", (error as Error).message);
    return [];
  }
}

/** Collect keywords for a single seed term according to current config. */
export async function collectForSeed(
  seed: string,
  region: string | null,
  config?: WordstatConfig,
): Promise<WordstatRow[]> {
  const cfg = config ?? (await getWordstatConfig());
  const limit = cfg.max_keywords_per_seed;
  let rows: WordstatRow[];
  if (cfg.mode === "api") {
    rows = await fetchFromApi(seed, region, limit);
    if (rows.length === 0) rows = buildMockRows(seed, region, limit); // safety fallback
  } else {
    rows = buildMockRows(seed, region, limit);
  }
  return rows.filter((row) => row.frequency >= cfg.min_frequency);
}

/**
 * Parse a manually exported Wordstat CSV/TSV.
 * Accepts "phrase,frequency" or "phrase\tfrequency" with an optional header row.
 */
export function parseCsv(content: string, region: string | null): WordstatRow[] {
  const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const rows: WordstatRow[] = [];
  for (const line of lines) {
    const parts = line.split(/[\t;,]/).map((part) => part.trim());
    if (parts.length < 2) continue;
    const keyword = parts[0].replace(/^"|"$/g, "");
    const freq = Number.parseInt(parts[1].replace(/[^\d]/g, ""), 10);
    if (!keyword || Number.isNaN(freq)) continue; // skips header rows automatically
    rows.push({ keyword, frequency: freq, region, source: "csv" });
  }
  return rows;
}
