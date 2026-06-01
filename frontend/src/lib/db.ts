import "server-only";

import pg, { type QueryResultRow } from "pg";

const { Pool } = pg;

const connectionString =
  process.env.DATABASE_URL ??
  "postgres://katet_directus:katet_directus_password@127.0.0.1:55432/katet_directus";

const DEFAULT_LOCAL_DATABASE_URL = "postgres://katet_directus:katet_directus_password@127.0.0.1:55432/katet_directus";
const READONLY_QUERY_RE = /^\s*(select|with)\b/i;
const CONNECTION_ERROR_CODES = new Set(["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "EHOSTUNREACH", "ENOTFOUND"]);
const fallbackEnv = process.env.KATET_ALLOW_DB_READ_FALLBACK;
const allowReadFallback =
  fallbackEnv === "1" ||
  (fallbackEnv !== "0" && !process.env.DATABASE_URL && connectionString === DEFAULT_LOCAL_DATABASE_URL);

let hasLoggedReadFallback = false;

const globalForPg = globalThis as typeof globalThis & {
  katetPool?: pg.Pool;
};

export const pool =
  globalForPg.katetPool ??
  new Pool({
    connectionString,
    max: 8,
  });

if (process.env.NODE_ENV !== "production") {
  globalForPg.katetPool = pool;
}

function isReadonlyQuery(text: string) {
  return READONLY_QUERY_RE.test(text);
}

function isConnectionError(error: unknown): error is NodeJS.ErrnoException {
  if (!error || typeof error !== "object") return false;
  const maybeCode = (error as NodeJS.ErrnoException).code;
  return typeof maybeCode === "string" && CONNECTION_ERROR_CODES.has(maybeCode);
}

export async function query<T extends QueryResultRow>(text: string, params: unknown[] = []) {
  try {
    const result = await pool.query<T>(text, params);
    return result.rows;
  } catch (error) {
    if (allowReadFallback && isReadonlyQuery(text) && isConnectionError(error)) {
      if (!hasLoggedReadFallback) {
        console.warn("[db] Read fallback enabled: local database is unavailable, returning empty rows for readonly queries.");
        hasLoggedReadFallback = true;
      }
      return [] as T[];
    }

    throw error;
  }
}