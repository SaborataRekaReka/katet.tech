import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = path.resolve(process.cwd(), "..");
const inventoryPath = process.env.INVENTORY_PATH || path.join(ROOT, "katet-url-inventory.csv");
const nextBaseUrl = process.env.NEXT_BASE_URL || "http://localhost:3000";
const legacyBaseUrl = process.env.LEGACY_BASE_URL || "";
const strictSeo = process.env.STRICT_SEO === "1";
const strictLegacy = process.env.STRICT_LEGACY === "1";
const concurrency = Number(process.env.MIGRATION_CONCURRENCY || (legacyBaseUrl ? 4 : 12));
const fetchTimeoutMs = Number(process.env.MIGRATION_FETCH_TIMEOUT_MS || 45_000);

const forbiddenMarkers = [
  "elementor",
  "wp-content",
  "wp-includes",
  "jquery",
  "wp-hooks",
  "/legacy/",
  "legacy/home.html",
  "cdn.envybox.io",
  "legacy-landing",
  "site-header",
  "class=\"topbar",
  "class='topbar",
  "catalog-strip",
];

const plannedRedirects = new Map([
  ["/zapros/da/", "/arenda_spetstekhniki/"],
  ["/zapros/net/", "/arenda_spetstekhniki/"],
]);

function parseCsv(text) {
  const rows = [];
  let cell = "";
  let row = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }

  const [headers, ...dataRows] = rows;
  return dataRows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])));
}

function decodeEntities(value) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function normalizeText(value) {
  return decodeEntities(value || "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getAttr(tag, name) {
  const match = tag.match(new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return match ? decodeEntities(match[2] || match[3] || match[4] || "") : "";
}

function extractTags(html, name) {
  return html.match(new RegExp(`<${name}\\b[^>]*>`, "gi")) || [];
}

function extractMeta(html, name) {
  for (const tag of extractTags(html, "meta")) {
    if (getAttr(tag, "name").toLowerCase() === name.toLowerCase()) return getAttr(tag, "content");
  }
  return "";
}

function extractCanonical(html, baseUrl) {
  for (const tag of extractTags(html, "link")) {
    if (getAttr(tag, "rel").toLowerCase().split(/\s+/).includes("canonical")) {
      const href = getAttr(tag, "href");
      if (!href) return "";
      try {
        return new URL(href, baseUrl).pathname;
      } catch {
        return href;
      }
    }
  }
  return "";
}

function extractFields(html, baseUrl) {
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "";
  const h1Matches = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((match) => normalizeText(match[1]));
  return {
    title: normalizeText(title),
    description: normalizeText(extractMeta(html, "description")),
    robots: normalizeText(extractMeta(html, "robots")),
    canonicalPath: extractCanonical(html, baseUrl),
    h1: h1Matches[0] || "",
    h1Count: h1Matches.length,
    text: normalizeText(html),
  };
}

function equalText(left, right) {
  return normalizeText(left).toLocaleLowerCase("ru-RU") === normalizeText(right).toLocaleLowerCase("ru-RU");
}

function normalizePathForCompare(value) {
  try {
    return decodeURI(value || "");
  } catch {
    return (value || "").replace(/%[\da-f]{2}/gi, (match) => match.toUpperCase());
  }
}

async function fetchHtml(baseUrl, urlPath) {
  const url = new URL(urlPath, baseUrl).toString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), fetchTimeoutMs);

  try {
    const response = await fetch(url, { redirect: "manual", signal: controller.signal });
    const html = await response.text();
    return {
      url,
      status: response.status,
      location: response.headers.get("location") || "",
      html,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function errorMessage(error) {
  if (error?.name === "AbortError") return `timeout>${fetchTimeoutMs}ms`;
  return error?.message || String(error);
}

const inventory = parseCsv(await readFile(inventoryPath, "utf8"));

async function verifyRow(row) {
  const errors = [];
  const warnings = [];
  let next;

  try {
    next = await fetchHtml(nextBaseUrl, row.path);
  } catch (error) {
    return { ...row, status: 0, errors: [`next-fetch=${errorMessage(error)}`], warnings };
  }

  const plannedRedirect = plannedRedirects.get(row.path);
  if (plannedRedirect) {
    const actualPath = normalizePathForCompare(locationPath(next.location, nextBaseUrl));
    const expectedPath = normalizePathForCompare(plannedRedirect);
    if (![301, 308].includes(next.status)) errors.push(`status=${next.status}${next.location ? ` location=${next.location}` : ""}`);
    if (actualPath !== expectedPath) errors.push(`redirect=${next.location || "missing-location"}`);
    return { ...row, status: next.status, errors, warnings };
  }

  const lowerHtml = next.html.toLocaleLowerCase("ru-RU");
  const forbidden = forbiddenMarkers.filter((marker) => lowerHtml.includes(marker.toLocaleLowerCase("ru-RU")));
  const fields = extractFields(next.html, nextBaseUrl);

  if (next.status !== 200) errors.push(`status=${next.status}${next.location ? ` location=${next.location}` : ""}`);
  if (forbidden.length) errors.push(`forbidden=${forbidden.join("|")}`);

  if (!fields.title) warnings.push("missing-title");
  if (!fields.h1) warnings.push("missing-h1");
  if (fields.h1Count !== 1) warnings.push(`h1-count=${fields.h1Count}`);
  if (!fields.canonicalPath) warnings.push("missing-canonical");

  if (strictSeo) {
    if (!fields.title) errors.push("missing-title");
    if (!fields.h1) errors.push("missing-h1");
    if (fields.h1Count !== 1) errors.push(`h1-count=${fields.h1Count}`);
    if (!fields.canonicalPath) errors.push("missing-canonical");
    if (fields.canonicalPath && normalizePathForCompare(fields.canonicalPath) !== normalizePathForCompare(row.path)) {
      errors.push(`canonical=${fields.canonicalPath}`);
    }
  }

  if (legacyBaseUrl) {
    let legacy;

    try {
      legacy = await fetchHtml(legacyBaseUrl, row.path);
    } catch (error) {
      const message = `legacy-fetch=${errorMessage(error)}`;
      if (strictLegacy) errors.push(message);
      else warnings.push(message);
      return { ...row, status: next.status, errors, warnings };
    }

    const legacyFields = extractFields(legacy.html, legacyBaseUrl);
    const legacyDiffs = [];

    if (!equalText(fields.title, legacyFields.title)) legacyDiffs.push("title");
    if (!equalText(fields.description, legacyFields.description)) legacyDiffs.push("description");
    if (!equalText(fields.h1, legacyFields.h1)) legacyDiffs.push("h1");

    if (legacyDiffs.length) {
      const message = `legacy-diff=${legacyDiffs.join("|")}`;
      if (strictLegacy) errors.push(message);
      else warnings.push(message);
    }
  }

  return { ...row, status: next.status, errors, warnings };
}

async function runWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;
  let completed = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index]);
      completed += 1;
      if (completed % 25 === 0 || completed === items.length) {
        console.log(`PROGRESS=${completed}/${items.length}`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runWorker));
  return results;
}

const results = await runWithConcurrency(inventory, concurrency, verifyRow);

const failures = results.filter((result) => result.errors.length);
const warnings = results.filter((result) => result.warnings.length);
const byTemplate = Map.groupBy ? Map.groupBy(results, (result) => result.template) : null;

console.log(`INVENTORY=${inventoryPath}`);
console.log(`NEXT_BASE_URL=${nextBaseUrl}`);
if (legacyBaseUrl) console.log(`LEGACY_BASE_URL=${legacyBaseUrl}`);
console.log(`CONCURRENCY=${concurrency}`);
console.log(`FETCH_TIMEOUT_MS=${fetchTimeoutMs}`);
console.log(`TOTAL=${results.length} OK=${results.length - failures.length} FAIL=${failures.length} WARN=${warnings.length}`);

if (byTemplate) {
  for (const [template, items] of [...byTemplate.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const templateFailures = items.filter((item) => item.errors.length).length;
    const templateWarnings = items.filter((item) => item.warnings.length).length;
    console.log(`TEMPLATE=${template} COUNT=${items.length} FAIL=${templateFailures} WARN=${templateWarnings}`);
  }
}

if (warnings.length) {
  console.log("WARNINGS_SAMPLE:");
  for (const item of warnings.slice(0, 20)) console.log(`${item.path} ${item.warnings.join(",")}`);
}

if (failures.length) {
  console.log("FAILURES:");
  for (const item of failures.slice(0, 50)) console.log(`${item.path} ${item.errors.join(",")}`);
  process.exitCode = 1;
}

function locationPath(location, baseUrl) {
  if (!location) return "";
  try {
    return new URL(location, baseUrl).pathname;
  } catch {
    return location;
  }
}