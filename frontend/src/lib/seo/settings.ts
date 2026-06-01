import "server-only";

import { one, run } from "./db";
import type { ScoringConfig, WordstatConfig } from "./types";

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
  mode: "mock",
  regions: ["Москва", "Московская область"],
  min_frequency: 5,
  max_keywords_per_seed: 40,
};

async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await one<{ value: T }>(`SELECT value FROM seo.settings WHERE key = $1`, [key]);
  return row?.value ?? fallback;
}

export async function getScoringConfig(): Promise<ScoringConfig> {
  return getSetting("scoring", DEFAULT_SCORING);
}

export async function getWordstatConfig(): Promise<WordstatConfig> {
  return getSetting("wordstat", DEFAULT_WORDSTAT);
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await run(
    `INSERT INTO seo.settings (key, value, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [key, JSON.stringify(value)],
  );
}
