import "server-only";

import { one, run } from "./db";
import type { ScoringConfig, SemanticsCleaningConfig, WordstatConfig } from "./types";

const DEFAULT_SCORING: ScoringConfig = {
  weights: { business_fit: 0.35, seo_opportunity: 0.3, content_readiness: 0.25, risk: 0.1 },
  thresholds: {
    include_business_fit: 70,
    include_seo: 40,
    include_readiness: 50,
    max_risk: 50,
    intent_confidence: 60,
    min_frequency: 5,
  },
};

const DEFAULT_WORDSTAT: WordstatConfig = {
  mode: "csv",
  regions: ["Москва", "Московская область"],
  min_frequency: 5,
  max_keywords_per_seed: 40,
};

const DEFAULT_SEMANTICS_CLEANING: SemanticsCleaningConfig = {
  min_frequency: 5,
  require_business_fit: true,
  junk_words: [],
};

function normalizeSemanticsCleaningConfig(value: unknown): SemanticsCleaningConfig {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const minFrequencyRaw = Number(raw.min_frequency);
  const min_frequency = Number.isFinite(minFrequencyRaw)
    ? Math.max(1, Math.trunc(minFrequencyRaw))
    : DEFAULT_SEMANTICS_CLEANING.min_frequency;
  const require_business_fit = raw.require_business_fit !== false;
  const junk_words = Array.isArray(raw.junk_words)
    ? raw.junk_words.map((w) => String(w).trim().toLowerCase()).filter((w) => w.length > 0).slice(0, 300)
    : [];
  return { min_frequency, require_business_fit, junk_words };
}

function normalizeWordstatConfig(value: unknown): WordstatConfig {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const mode = raw.mode === "api" ? "api" : "csv";

  const regionsRaw = Array.isArray(raw.regions) ? raw.regions : DEFAULT_WORDSTAT.regions;
  const regions = regionsRaw
    .map((r) => String(r).trim())
    .filter((r) => r.length > 0);

  const minFrequencyRaw = Number(raw.min_frequency);
  const min_frequency = Number.isFinite(minFrequencyRaw)
    ? Math.max(1, Math.trunc(minFrequencyRaw))
    : DEFAULT_WORDSTAT.min_frequency;

  const maxKeywordsRaw = Number(raw.max_keywords_per_seed);
  const max_keywords_per_seed = Number.isFinite(maxKeywordsRaw)
    ? Math.max(1, Math.trunc(maxKeywordsRaw))
    : DEFAULT_WORDSTAT.max_keywords_per_seed;

  return {
    mode,
    regions: regions.length > 0 ? regions : DEFAULT_WORDSTAT.regions,
    min_frequency,
    max_keywords_per_seed,
  };
}

async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await one<{ value: T }>(`SELECT value FROM seo.settings WHERE key = $1`, [key]);
  return row?.value ?? fallback;
}

export async function getScoringConfig(): Promise<ScoringConfig> {
  return getSetting("scoring", DEFAULT_SCORING);
}

export async function getWordstatConfig(): Promise<WordstatConfig> {
  const value = await getSetting<unknown>("wordstat", DEFAULT_WORDSTAT);
  return normalizeWordstatConfig(value);
}

export async function getSemanticsCleaningConfig(): Promise<SemanticsCleaningConfig> {
  const value = await getSetting<unknown>("semantics_cleaning", DEFAULT_SEMANTICS_CLEANING);
  return normalizeSemanticsCleaningConfig(value);
}

export async function setSemanticsCleaningConfig(value: Partial<SemanticsCleaningConfig>): Promise<SemanticsCleaningConfig> {
  const current = await getSemanticsCleaningConfig();
  const merged: SemanticsCleaningConfig = normalizeSemanticsCleaningConfig({
    ...current,
    ...value,
    junk_words: Array.isArray(value.junk_words) ? value.junk_words : current.junk_words,
  });
  await setSetting("semantics_cleaning", merged);
  return merged;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await run(
    `INSERT INTO seo.settings (key, value, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [key, JSON.stringify(value)],
  );
}
