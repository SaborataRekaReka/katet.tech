import "server-only";

import { getWordstatConfig } from "./settings";
import type { WordstatConfig } from "./types";

/**
 * Wordstat adapter — abstracts how search-demand data is obtained.
 * Modes (Task.md §6.2):
 *   - "api"  API collection (legacy Wordstat endpoint or Yandex Search API Cloud)
 *   - "csv"  manual CSV/XLSX export parsed and ingested
 */

export type WordstatRow = {
  keyword: string;
  frequency: number;
  region: string | null;
  source: "wordstat_api" | "csv";
};

type WordstatApiProvider = "legacy" | "cloud";

type OAuthTokenResponse = {
  access_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

type TokenSource = "explicit" | "refresh_token" | "client_credentials";

type ResolvedApiToken = {
  token: string;
  source: TokenSource;
  scope: string;
};

type LegacyTopRequestsResponse = {
  topRequests?: { phrase: string; count: number }[];
};

type CloudTopRequestsResponse = {
  results?: { phrase?: string; count?: number | string }[];
  associations?: { phrase?: string; count?: number | string }[];
};

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_LEGACY_ENDPOINT = "https://api.wordstat.yandex.net/v1/topRequests";
const DEFAULT_CLOUD_ENDPOINT = "https://searchapi.api.cloud.yandex.net/v2/wordstat/topRequests";

const CLOUD_REGION_ALIAS_TO_ID: Record<string, string> = {
  moscow: "213",
  "moscow oblast": "1",
  "moscow region": "1",
  russia: "225",
};

let cachedOAuthToken:
  | {
      token: string;
      expiresAtMs: number;
      source: Exclude<TokenSource, "explicit">;
      scope: string;
    }
  | null =
  null;

function parseBooleanEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === "1" || raw === "true" || raw === "yes" || raw === "on") return true;
  if (raw === "0" || raw === "false" || raw === "no" || raw === "off") return false;
  return fallback;
}

function getHttpTimeoutMs(): number {
  const raw = Number(process.env.WORDSTAT_HTTP_TIMEOUT_MS);
  if (!Number.isFinite(raw)) return DEFAULT_TIMEOUT_MS;
  return Math.max(1000, Math.trunc(raw));
}

function getApiProvider(): WordstatApiProvider {
  const explicit = process.env.WORDSTAT_API_PROVIDER?.trim().toLowerCase();
  if (explicit === "cloud") return "cloud";
  if (explicit === "legacy") return "legacy";

  // Auto-select Cloud if Cloud credentials are present.
  if (process.env.WORDSTAT_CLOUD_API_KEY?.trim() || process.env.WORDSTAT_CLOUD_IAM_TOKEN?.trim()) {
    return "cloud";
  }
  return "legacy";
}

function isLikelyAppCredential(value: string): boolean {
  return /^[a-f0-9]{32}$/i.test(value);
}

function parseCloudRegionMapEnv(): Record<string, string> {
  const raw = process.env.WORDSTAT_CLOUD_REGION_MAP_JSON?.trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      const k = key.trim().toLowerCase();
      const v = String(value ?? "").trim();
      if (k && v) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function resolveCloudRegions(region: string | null): string[] {
  const explicit = (process.env.WORDSTAT_CLOUD_REGION_IDS ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
  if (explicit.length > 0) return explicit;
  if (!region) return [];

  const regionTrimmed = region.trim();
  if (!regionTrimmed) return [];
  if (/^\d+$/.test(regionTrimmed)) return [regionTrimmed];

  const byEnvMap = parseCloudRegionMapEnv()[regionTrimmed.toLowerCase()];
  if (byEnvMap) return [byEnvMap];

  const byAlias = CLOUD_REGION_ALIAS_TO_ID[regionTrimmed.toLowerCase()];
  if (byAlias) return [byAlias];

  return [];
}

function normalizeCount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.trunc(value));
  if (typeof value === "string") {
    const digits = value.replace(/[^\d]/g, "");
    if (!digits) return null;
    const parsed = Number.parseInt(digits, 10);
    return Number.isNaN(parsed) ? null : Math.max(0, parsed);
  }
  return null;
}

function getCloudAuthorizationHeader(): string {
  const apiKey = process.env.WORDSTAT_CLOUD_API_KEY?.trim();
  if (apiKey) return `Api-Key ${apiKey}`;
  const iamToken = process.env.WORDSTAT_CLOUD_IAM_TOKEN?.trim();
  if (iamToken) return `Bearer ${iamToken}`;
  throw new Error(
    "[seo/wordstat] cloud provider selected but no cloud auth configured; set WORDSTAT_CLOUD_API_KEY or WORDSTAT_CLOUD_IAM_TOKEN",
  );
}

function getCloudFolderId(): string {
  const folderId = process.env.WORDSTAT_CLOUD_FOLDER_ID?.trim();
  if (!folderId) {
    throw new Error(
      "[seo/wordstat] cloud provider selected but WORDSTAT_CLOUD_FOLDER_ID is missing",
    );
  }
  return folderId;
}

async function requestOAuthToken(body: URLSearchParams): Promise<OAuthTokenResponse> {
  const timeoutMs = getHttpTimeoutMs();
  let response: Response;
  try {
    response = await fetch("https://oauth.yandex.ru/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[seo/wordstat] oauth token request failed: ${message}`);
  }

  if (!response.ok) {
    const details = (await response.text().catch(() => "")).trim();
    throw new Error(
      `[seo/wordstat] oauth token endpoint responded ${response.status}${details ? `: ${details.slice(0, 180)}` : ""}`,
    );
  }

  return (await response.json()) as OAuthTokenResponse;
}

async function getApiToken(): Promise<ResolvedApiToken> {
  const explicitToken = process.env.WORDSTAT_API_TOKEN?.trim();
  if (explicitToken) {
    if (isLikelyAppCredential(explicitToken)) {
      throw new Error(
        "[seo/wordstat] WORDSTAT_API_TOKEN looks like app credential (Client ID/Client Secret), not an OAuth access token. Put a real access_token (usually starts with y0_) or use WORDSTAT_REFRESH_TOKEN + client credentials.",
      );
    }
    return { token: explicitToken, source: "explicit", scope: "" };
  }

  const clientId = process.env.WORDSTAT_CLIENT_ID?.trim();
  const clientSecret = process.env.WORDSTAT_CLIENT_SECRET?.trim();
  const refreshToken = process.env.WORDSTAT_REFRESH_TOKEN?.trim();
  if (!clientId || !clientSecret) {
    throw new Error(
      "[seo/wordstat] api mode requested but no credentials configured; set WORDSTAT_API_TOKEN or set WORDSTAT_CLIENT_ID + WORDSTAT_CLIENT_SECRET (optionally with WORDSTAT_REFRESH_TOKEN)",
    );
  }

  if (cachedOAuthToken && cachedOAuthToken.expiresAtMs > Date.now() + 60_000) {
    return {
      token: cachedOAuthToken.token,
      source: cachedOAuthToken.source,
      scope: cachedOAuthToken.scope,
    };
  }

  const source: Exclude<TokenSource, "explicit"> = refreshToken ? "refresh_token" : "client_credentials";
  const body = refreshToken
    ? new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      })
    : new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
      });

  const data = await requestOAuthToken(body);
  const token = data.access_token?.trim();
  const scope = data.scope?.trim() ?? "";
  if (!token) {
    throw new Error(
      `[seo/wordstat] oauth ${source} response has no access_token${data.error ? ` (${data.error}${data.error_description ? `: ${data.error_description}` : ""})` : ""}`,
    );
  }

  const expiresInSec =
    typeof data.expires_in === "number" && Number.isFinite(data.expires_in)
      ? Math.max(120, Math.floor(data.expires_in))
      : 3600;
  cachedOAuthToken = {
    token,
    expiresAtMs: Date.now() + (expiresInSec - 60) * 1000,
    source,
    scope,
  };
  return { token, source, scope };
}

/**
 * Legacy Wordstat API call (api.wordstat.yandex.net).
 * Docs: https://yandex.ru/support2/wordstat/en/content/api-wordstat
 */
async function fetchFromLegacyApi(seed: string, region: string | null, limit: number): Promise<WordstatRow[]> {
  const { token, source: tokenSource, scope: tokenScope } = await getApiToken();
  const endpoint = process.env.WORDSTAT_API_URL?.trim() || DEFAULT_LEGACY_ENDPOINT;
  const timeoutMs = getHttpTimeoutMs();
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ phrase: seed, regions: region ? [region] : undefined, limit }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[seo/wordstat] request failed: ${message}`);
  }
  if (!response.ok) {
    let details = "";
    try {
      details = (await response.text()).trim();
    } catch {
      details = "";
    }
    let hint = "";
    if (response.status === 403) {
      hint = tokenSource === "client_credentials"
        ? " Hint: token was issued via client_credentials and may lack user context for Wordstat. Prefer WORDSTAT_API_TOKEN from authorization_code flow, or set WORDSTAT_REFRESH_TOKEN to refresh a user-granted token."
        : isLikelyAppCredential(token)
        ? " Hint: WORDSTAT_API_TOKEN looks like Client ID/Client Secret; put a real OAuth access_token (usually starts with y0_) or configure WORDSTAT_CLIENT_ID + WORDSTAT_CLIENT_SECRET."
        : " Hint: OAuth token is accepted syntactically, but Wordstat API access is forbidden for current app/account.";
      if (!tokenScope) {
        hint +=
          " OAuth token response has empty scope; verify Wordstat rights in OAuth app and consider Yandex Search API (Cloud) migration if legacy endpoint access is closed.";
      }
    }
    throw new Error(
      `[seo/wordstat] api responded ${response.status}${details ? `: ${details.slice(0, 180)}` : ""}${hint}`,
    );
  }

  const data = (await response.json()) as LegacyTopRequestsResponse;
  return (data.topRequests ?? []).slice(0, limit).map((row) => ({
    keyword: row.phrase,
    frequency: row.count,
    region,
    source: "wordstat_api" as const,
  }));
}

/**
 * Yandex Search API Cloud Wordstat call (searchapi.api.cloud.yandex.net).
 * Protobuf contract path: yandex/cloud/searchapi/v2/wordstat_service.proto
 */
async function fetchFromCloudApi(seed: string, region: string | null, limit: number): Promise<WordstatRow[]> {
  const endpoint = process.env.WORDSTAT_CLOUD_ENDPOINT?.trim() || DEFAULT_CLOUD_ENDPOINT;
  const authorization = getCloudAuthorizationHeader();
  const folderId = getCloudFolderId();
  const timeoutMs = getHttpTimeoutMs();

  const body: Record<string, unknown> = {
    phrase: seed,
    numPhrases: limit,
    folderId,
  };
  const regionIds = resolveCloudRegions(region);
  if (regionIds.length > 0) body.regions = regionIds;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: authorization,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[seo/wordstat] cloud request failed: ${message}`);
  }

  if (!response.ok) {
    let details = "";
    try {
      details = (await response.text()).trim();
    } catch {
      details = "";
    }

    let hint = "";
    if (response.status === 401) {
      hint =
        " Hint: Cloud endpoint requires valid Yandex Cloud auth: Authorization: Api-Key <key> or Bearer <iam_token>.";
    } else if (response.status === 403) {
      hint =
        " Hint: Auth succeeded but caller has no Wordstat access in this cloud folder (check service role/permissions).";
    } else if (response.status === 400) {
      hint =
        " Hint: Verify request fields for Cloud endpoint (phrase/numPhrases/folderId/regions) and that region IDs are valid.";
    }

    throw new Error(
      `[seo/wordstat] cloud api responded ${response.status}${details ? `: ${details.slice(0, 220)}` : ""}${hint}`,
    );
  }

  const includeAssociations = parseBooleanEnv("WORDSTAT_CLOUD_INCLUDE_ASSOCIATIONS", true);
  const data = (await response.json()) as CloudTopRequestsResponse;
  const combined = [
    ...(data.results ?? []),
    ...(includeAssociations ? (data.associations ?? []) : []),
  ];

  const unique = new Set<string>();
  const rows: WordstatRow[] = [];
  for (const row of combined) {
    const keyword = String(row.phrase ?? "").trim();
    const frequency = normalizeCount(row.count);
    if (!keyword || frequency === null) continue;
    const key = keyword.toLowerCase();
    if (unique.has(key)) continue;
    unique.add(key);
    rows.push({
      keyword,
      frequency,
      region,
      source: "wordstat_api",
    });
    if (rows.length >= limit) break;
  }

  return rows;
}

async function fetchFromApi(seed: string, region: string | null, limit: number): Promise<WordstatRow[]> {
  const provider = getApiProvider();
  if (provider === "cloud") return fetchFromCloudApi(seed, region, limit);
  return fetchFromLegacyApi(seed, region, limit);
}

/** Collect keywords for a single seed term according to current config. */
export async function collectForSeed(
  seed: string,
  region: string | null,
  config?: WordstatConfig,
): Promise<WordstatRow[]> {
  const cfg = config ?? (await getWordstatConfig());
  if (cfg.mode !== "api") return [];

  const limit = cfg.max_keywords_per_seed;
  const rows = await fetchFromApi(seed, region, limit);
  return rows.filter((row) => row.frequency >= cfg.min_frequency);
}

function parseImportContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((line) => String(line ?? "")).join("\n");
  if (typeof content === "object" && content !== null && "value" in content) {
    const value = (content as { value?: unknown }).value;
    if (typeof value === "string") return value;
    if (Array.isArray(value)) return value.map((line) => String(line ?? "")).join("\n");
  }
  if (content == null) return "";
  return String(content);
}

function isHeaderKeyword(keyword: string): boolean {
  const normalized = keyword.trim().toLowerCase().replace(/^\uFEFF/, "");
  return normalized === "запросы со словами" || normalized === "запрос" || normalized === "фраза" || normalized === "keyword";
}

/**
 * Parse a manually exported Wordstat CSV/TSV.
 * Accepts "phrase,frequency", "phrase\tfrequency" and one phrase per line.
 */
export function parseCsv(content: unknown, region: string | null, defaultFrequency = 1): WordstatRow[] {
  const lines = parseImportContent(content).split(/\r\n|\n|\r/).map((line) => line.trim()).filter(Boolean);
  const rows: WordstatRow[] = [];
  for (const line of lines) {
    const parts = line.split(/[\t;,]/).map((part) => part.trim());
    const keyword = (parts[0] ?? "").replace(/^\uFEFF/, "").replace(/^"|"$/g, "").trim();
    if (!keyword || isHeaderKeyword(keyword)) continue;

    const rawFrequency = parts[1]?.replace(/[^\d]/g, "") ?? "";
    const parsedFrequency = rawFrequency ? Number.parseInt(rawFrequency, 10) : Number.NaN;
    const freq = Number.isNaN(parsedFrequency) ? Math.max(1, Math.trunc(defaultFrequency)) : parsedFrequency;
    rows.push({ keyword, frequency: freq, region, source: "csv" });
  }
  return rows;
}
