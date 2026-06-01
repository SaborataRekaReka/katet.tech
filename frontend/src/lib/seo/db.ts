import "server-only";

import { pool } from "@/lib/db";
import type { QueryResultRow } from "pg";

/**
 * Write-capable query helper for the SEO pipeline.
 * `@/lib/db`#query only allows readonly fallback; the pipeline needs INSERT/UPDATE,
 * so it talks to the shared pool directly.
 */
export async function run<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await pool.query<T>(text, params);
  return result.rows;
}

export async function one<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await run<T>(text, params);
  return rows[0] ?? null;
}

export { pool };
