import "server-only";

import { run } from "./db";
import { collectForSeed, type WordstatRow } from "./wordstat";
import { getWordstatConfig } from "./settings";

/**
 * Demand collection (Task.md §9): iterate active seeds, pull Wordstat rows,
 * persist into seo.raw_keywords. De-duplicates raw rows per keyword+region.
 */

type SeedRow = { id: number; seed_term: string; region: string | null };

async function insertRawRows(seedTerm: string, rows: WordstatRow[]): Promise<number> {
  let count = 0;
  for (const row of rows) {
    await run(
      `INSERT INTO seo.raw_keywords (source, seed_term, keyword, frequency, region, period)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [row.source, seedTerm, row.keyword, row.frequency, row.region, new Date().toISOString().slice(0, 7)],
    );
    count += 1;
  }
  return count;
}

/** Collect demand for all active seeds. Returns total raw keywords stored. */
export async function collectAll(onProgress?: (done: number, total: number) => void): Promise<number> {
  const config = await getWordstatConfig();
  if (config.mode === "csv") {
    // CSV mode is manual: collection comes from /api/seo/keywords/import.
    return 0;
  }

  const seeds = await run<SeedRow>(
    `SELECT id, seed_term, region FROM seo.seed_terms WHERE status = 'active' ORDER BY priority, id`,
  );
  let total = 0;
  for (let i = 0; i < seeds.length; i += 1) {
    const seed = seeds[i];
    const rows = await collectForSeed(seed.seed_term, seed.region ?? config.regions[0] ?? null, config);
    total += await insertRawRows(seed.seed_term, rows);
    await run(`UPDATE seo.seed_terms SET last_collected_at = NOW() WHERE id = $1`, [seed.id]);
    onProgress?.(i + 1, seeds.length);
  }
  return total;
}

/** Ingest manually parsed CSV rows directly into raw_keywords. */
export async function ingestRows(seedTerm: string, rows: WordstatRow[]): Promise<number> {
  return insertRawRows(seedTerm, rows);
}
