import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const WEBMASTER_BASE = "https://api.webmaster.yandex.net/v4";
const OAUTH_TOKEN_URL = "https://oauth.yandex.ru/token";
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_FEED_TYPE = "SERVICES";
const DEFAULT_REGION_IDS = [225];

const ALLOWED_FEED_TYPES = new Set(["REALTY", "VACANCY", "GOODS", "DOCTORS", "CARS", "SERVICES"]);
const OK_FEED_STATUSES = new Set(["OK", "FEED_ALREADY_ADDED"]);

function normalizeFeedType(value) {
  return String(value || "").trim().toUpperCase();
}

function findFeedByUrl(feeds, feedUrl) {
  return feeds.find((feed) => String(feed?.url || "").trim() === feedUrl);
}

function loadDotEnvFiles(frontendRoot) {
  const envFiles = [
    path.join(frontendRoot, ".env.local"),
    path.join(frontendRoot, ".env"),
  ];

  for (const filePath of envFiles) {
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const eqIndex = trimmed.indexOf("=");
      if (eqIndex <= 0) continue;

      const key = trimmed.slice(0, eqIndex).trim();
      const value = trimmed.slice(eqIndex + 1).trim();
      if (key && !process.env[key]) process.env[key] = value;
    }
  }
}

function getTimeoutMs() {
  const raw = Number(process.env.YANDEX_WEBMASTER_TIMEOUT_MS);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_TIMEOUT_MS;
  return Math.max(1_000, Math.trunc(raw));
}

function parseRegionIds() {
  const raw = (process.env.YANDEX_WEBMASTER_FEED_REGION_IDS || "").trim();
  if (!raw) return [...DEFAULT_REGION_IDS];

  const parsed = raw
    .split(",")
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((num) => Number.isFinite(num) && num > 0);

  return parsed.length > 0 ? parsed : [...DEFAULT_REGION_IDS];
}

function getFeedType() {
  const value = (process.env.YANDEX_WEBMASTER_FEED_TYPE || DEFAULT_FEED_TYPE).trim().toUpperCase();
  if (!ALLOWED_FEED_TYPES.has(value)) {
    throw new Error(
      `YANDEX_WEBMASTER_FEED_TYPE must be one of: ${[...ALLOWED_FEED_TYPES].join(", ")}. Received: ${value}`,
    );
  }
  return value;
}

function normalizeOrigin(urlValue) {
  const parsed = new URL(urlValue);
  const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
  const protocol = parsed.protocol.toLowerCase();
  const port = parsed.port ? `:${parsed.port}` : "";
  return `${protocol}//${hostname}${port}`;
}

function toAuthHeader(token) {
  const trimmed = token.trim();
  if (/^(OAuth|Bearer)\s+/i.test(trimmed)) return trimmed;
  return `OAuth ${trimmed}`;
}

async function requestOAuthTokenByRefreshToken(timeoutMs) {
  const clientId = process.env.YANDEX_WEBMASTER_CLIENT_ID?.trim();
  const clientSecret = process.env.YANDEX_WEBMASTER_CLIENT_SECRET?.trim();
  const refreshToken = process.env.YANDEX_WEBMASTER_REFRESH_TOKEN?.trim();

  if (!clientId || !clientSecret || !refreshToken) {
    return null;
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const response = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
    signal: AbortSignal.timeout(timeoutMs),
  });

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const details = typeof payload === "object" && payload !== null ? JSON.stringify(payload) : text;
    throw new Error(`OAuth refresh request failed: HTTP ${response.status}${details ? `, ${details}` : ""}`);
  }

  const token = payload?.access_token;
  if (!token || typeof token !== "string") {
    throw new Error("OAuth refresh request succeeded but access_token is missing in response.");
  }

  return token;
}

async function resolveOAuthToken(timeoutMs) {
  const explicit = process.env.YANDEX_WEBMASTER_OAUTH_TOKEN?.trim();
  if (explicit) return explicit;

  const refreshed = await requestOAuthTokenByRefreshToken(timeoutMs);
  if (refreshed) return refreshed;

  throw new Error(
    "Missing OAuth token. Set YANDEX_WEBMASTER_OAUTH_TOKEN or provide YANDEX_WEBMASTER_CLIENT_ID + YANDEX_WEBMASTER_CLIENT_SECRET + YANDEX_WEBMASTER_REFRESH_TOKEN.",
  );
}

function buildApiUrl(pathValue, query = undefined) {
  const url = new URL(`${WEBMASTER_BASE}${pathValue}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

async function webmasterRequest({ token, method, pathValue, query, body, timeoutMs }) {
  const result = await webmasterRequestRaw({ token, method, pathValue, query, body, timeoutMs });

  if (!result.ok) {
    const details = result.payload && typeof result.payload === "object" ? JSON.stringify(result.payload) : result.text;
    throw new Error(`Webmaster API ${method} ${result.url.pathname} failed: HTTP ${result.status}${details ? `, ${details}` : ""}`);
  }

  return result.payload;
}

async function webmasterRequestRaw({ token, method, pathValue, query, body, timeoutMs }) {
  const url = buildApiUrl(pathValue, query);
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: toAuthHeader(token),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  return {
    ok: response.ok,
    status: response.status,
    payload,
    text,
    url,
  };
}

async function verifyFeedReachability(feedUrl, timeoutMs) {
  const response = await fetch(feedUrl, {
    method: "GET",
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`Feed URL is not reachable: HTTP ${response.status} (${feedUrl})`);
  }

  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  const accepted = ["application/xml", "text/xml", "application/octet-stream"];
  const contentTypeOk = accepted.some((allowed) => contentType.includes(allowed));
  if (!contentTypeOk) {
    console.warn(`[warn] Feed Content-Type is '${contentType || "unknown"}'. Expected one of: ${accepted.join(", ")}.`);
  }
}

function pickHostByUrl(hosts, hostUrl) {
  const targetOrigin = normalizeOrigin(hostUrl);

  const withOrigin = hosts
    .filter((host) => Boolean(host?.host_id))
    .map((host) => {
      const candidates = [
        host.ascii_host_url,
        host.unicode_host_url,
        host.main_mirror?.ascii_host_url,
        host.main_mirror?.unicode_host_url,
      ].filter(Boolean);

      const origins = candidates
        .map((candidate) => {
          try {
            return normalizeOrigin(candidate);
          } catch {
            return null;
          }
        })
        .filter(Boolean);

      return {
        host,
        verified: Boolean(host.verified || host.main_mirror?.verified),
        origins,
      };
    });

  const exact = withOrigin.find((entry) => entry.verified && entry.origins.includes(targetOrigin));
  if (exact) return exact.host;

  const fallback = withOrigin.find((entry) => entry.origins.includes(targetOrigin));
  if (fallback) return fallback.host;

  const targetHost = new URL(hostUrl).hostname.toLowerCase().replace(/^www\./, "");
  const byHostname = withOrigin.find((entry) =>
    entry.origins.some((origin) => {
      try {
        return new URL(origin).hostname.toLowerCase().replace(/^www\./, "") === targetHost;
      } catch {
        return false;
      }
    }),
  );

  return byHostname?.host ?? null;
}

async function resolveUserId(token, timeoutMs) {
  const payload = await webmasterRequest({
    token,
    method: "GET",
    pathValue: "/user",
    timeoutMs,
  });

  const userId = payload?.user_id ?? payload?.["user-id"];
  if (!userId) {
    throw new Error(`Cannot resolve user_id from API response: ${JSON.stringify(payload)}`);
  }

  return String(userId);
}

async function resolveHostId(token, userId, timeoutMs) {
  const explicit = process.env.YANDEX_WEBMASTER_HOST_ID?.trim();
  if (explicit) return explicit;

  const hostUrl = (process.env.YANDEX_WEBMASTER_HOST_URL || process.env.NEXT_PUBLIC_SITE_URL || "").trim();
  if (!hostUrl) {
    throw new Error("Set NEXT_PUBLIC_SITE_URL or YANDEX_WEBMASTER_HOST_URL to resolve host_id automatically.");
  }

  const payload = await webmasterRequest({
    token,
    method: "GET",
    pathValue: `/user/${encodeURIComponent(userId)}/hosts`,
    timeoutMs,
  });

  const hosts = Array.isArray(payload?.hosts) ? payload.hosts : [];
  const matched = pickHostByUrl(hosts, hostUrl);
  if (!matched?.host_id) {
    const available = hosts
      .map((host) => `${host.host_id} (${host.ascii_host_url || host.unicode_host_url || "unknown"}, verified=${String(host.verified)})`)
      .join("; ");
    throw new Error(
      `Could not find host_id for ${hostUrl}. Add/verify this site in Yandex Webmaster first. Available hosts: ${available || "none"}`,
    );
  }

  return String(matched.host_id);
}

async function listFeeds(token, userId, hostId, timeoutMs) {
  const payload = await webmasterRequest({
    token,
    method: "GET",
    pathValue: `/user/${encodeURIComponent(userId)}/hosts/${encodeURIComponent(hostId)}/feeds/list`,
    timeoutMs,
  });

  return Array.isArray(payload?.feeds) ? payload.feeds : [];
}

async function pushFeed(token, userId, hostId, feedUrl, feedType, regionIds, timeoutMs) {
  const payload = await webmasterRequest({
    token,
    method: "POST",
    pathValue: `/user/${encodeURIComponent(userId)}/hosts/${encodeURIComponent(hostId)}/feeds/batch/add`,
    body: {
      feeds: [
        {
          url: feedUrl,
          type: feedType,
          regionIds,
        },
      ],
    },
    timeoutMs,
  });

  const status = payload?.feeds?.[0]?.status;
  if (!status || !OK_FEED_STATUSES.has(status)) {
    throw new Error(`Feed upload was not accepted. Status: ${status || "unknown"}. Response: ${JSON.stringify(payload)}`);
  }

  return status;
}

async function removeFeedByUrl(token, userId, hostId, feedUrl, timeoutMs) {
  const pathValue = `/user/${encodeURIComponent(userId)}/hosts/${encodeURIComponent(hostId)}/feeds/batch/remove`;
  const payloadCandidates = [
    { feeds: [{ url: feedUrl }] },
    { feeds: [feedUrl] },
    { urls: [feedUrl] },
  ];

  let lastError = null;

  for (const body of payloadCandidates) {
    const result = await webmasterRequestRaw({
      token,
      method: "DELETE",
      pathValue,
      body,
      timeoutMs,
    });

    if (result.ok) {
      return;
    }

    const details = result.payload && typeof result.payload === "object"
      ? JSON.stringify(result.payload)
      : result.text;

    if (result.status === 400) {
      lastError = `HTTP 400${details ? `, ${details}` : ""}`;
      continue;
    }

    throw new Error(
      `Failed to remove existing feed before re-upload: HTTP ${result.status}${details ? `, ${details}` : ""}`,
    );
  }

  throw new Error(`Failed to remove existing feed before re-upload. ${lastError || "No details"}`);
}

async function main() {
  const frontendRoot = path.resolve(process.cwd());
  loadDotEnvFiles(frontendRoot);

  const timeoutMs = getTimeoutMs();
  const token = await resolveOAuthToken(timeoutMs);

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "").trim().replace(/\/$/, "");
  if (!siteUrl) {
    throw new Error("NEXT_PUBLIC_SITE_URL is required.");
  }

  const feedUrl = (process.env.YANDEX_WEBMASTER_FEED_URL || `${siteUrl}/yandex-feed.xml`).trim();
  if (!/^https:\/\//i.test(feedUrl)) {
    throw new Error(`Feed URL must be HTTPS and publicly reachable by Yandex. Received: ${feedUrl}`);
  }

  const feedType = getFeedType();
  const regionIds = parseRegionIds();

  console.log(`[step] Checking feed URL: ${feedUrl}`);
  await verifyFeedReachability(feedUrl, timeoutMs);

  console.log("[step] Resolving user_id");
  const userId = await resolveUserId(token, timeoutMs);

  console.log("[step] Resolving host_id");
  const hostId = await resolveHostId(token, userId, timeoutMs);

  console.log(`[info] user_id=${userId}`);
  console.log(`[info] host_id=${hostId}`);
  console.log(`[info] feed_type=${feedType}`);
  console.log(`[info] region_ids=${regionIds.join(",")}`);

  console.log("[step] Fetching current feed list");
  const feedsBeforePush = await listFeeds(token, userId, hostId, timeoutMs);
  const existingFeed = findFeedByUrl(feedsBeforePush, feedUrl);

  if (existingFeed) {
    const existingType = normalizeFeedType(existingFeed.type);
    if (existingType && existingType !== feedType) {
      console.log(`[step] Existing feed has type=${existingType}, expected ${feedType}. Removing old feed registration.`);
      await removeFeedByUrl(token, userId, hostId, feedUrl, timeoutMs);
    }
  }

  console.log("[step] Uploading feed to Yandex Webmaster");
  const uploadStatus = await pushFeed(token, userId, hostId, feedUrl, feedType, regionIds, timeoutMs);
  console.log(`[info] upload_status=${uploadStatus}`);

  console.log("[step] Fetching feed list");
  const feeds = await listFeeds(token, userId, hostId, timeoutMs);
  const matching = findFeedByUrl(feeds, feedUrl);

  if (!matching) {
    console.warn("[warn] Feed is not yet visible in feeds/list. It may appear after a short delay.");
  } else {
    const actualType = normalizeFeedType(matching.type);
    if (actualType && actualType !== feedType) {
      throw new Error(`Feed type mismatch after upload. Expected ${feedType}, got ${actualType}.`);
    }

    console.log(`[done] Feed is present in Webmaster: ${matching.url} (type=${matching.type}, regions=${(matching.regionIds || []).join(",")})`);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[error] ${message}`);
  process.exit(1);
});
