import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const { Client } = pg;

const ROOT = path.resolve(process.cwd(), "..");
const inventoryPath = process.env.INVENTORY_PATH || path.join(ROOT, "katet-url-inventory.csv");
const databaseUrl = process.env.DATABASE_URL || "postgres://katet_directus:katet_directus_password@127.0.0.1:55432/katet_directus";

const wp = {
  container: process.env.WP_DB_CONTAINER || "katet-wp-db",
  database: process.env.WP_DB_NAME || "katet_local",
  user: process.env.WP_DB_USER || "katet_local",
  password: process.env.WP_DB_PASSWORD || "katet_local_password",
};

const generatedTemplates = new Set(["author_archive", "blog_category"]);
const generatedPaths = new Set(["/blog/", "/arenda_spetstekhniki/", "/zapros/da/", "/zapros/net/"]);

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
  const cleanHeaders = headers.map((header) => header.replace(/^\uFEFF/, ""));
  return dataRows.map((values) => Object.fromEntries(cleanHeaders.map((header, index) => [header, values[index] || ""])));
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function wpJsonRows(sql) {
  const output = execFileSync(
    "docker",
    [
      "exec",
      wp.container,
      "mariadb",
      `-u${wp.user}`,
      `-p${wp.password}`,
      "--default-character-set=utf8mb4",
      "--batch",
      "--raw",
      "--skip-column-names",
      wp.database,
      "-e",
      sql,
    ],
    { encoding: "utf8", maxBuffer: 1024 * 1024 * 200 },
  );

  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function ensureTrailingSlash(value) {
  if (!value || value === "/") return "/";
  const withSlash = value.startsWith("/") ? value : `/${value}`;
  return withSlash.endsWith("/") ? withSlash : `${withSlash}/`;
}

function normalizePath(permalink, fallbackPath) {
  const source = permalink || fallbackPath;
  if (!source) return null;
  try {
    const url = new URL(source);
    return ensureTrailingSlash(decodeURIComponent(url.pathname));
  } catch {
    return ensureTrailingSlash(decodeURIComponent(source));
  }
}

function normalizePathKey(value) {
  try {
    return ensureTrailingSlash(decodeURIComponent(value));
  } catch {
    return ensureTrailingSlash(value);
  }
}

function normalizeCanonical(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    return normalizePath(url.pathname, url.pathname);
  } catch {
    return normalizeComparable(value);
  }
}

function normalizeNumber(value) {
  if (value === null || value === undefined || value === "") return "";
  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(parsed) : normalizeComparable(value);
}

function normalizeBoolean(value) {
  if (value === null || value === undefined || value === "") return "";
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "да", "on"].includes(normalized)) return "true";
  if (["0", "false", "no", "нет", "off"].includes(normalized)) return "false";
  return normalized;
}

function parseFilterKeys(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return [...String(value).matchAll(/s:\d+:"([^"]+)"/g)].map((match) => match[1]);
}

function normalizeFilterKeys(value) {
  if (!value) return "";
  if (Array.isArray(value)) return value.map(String).filter(Boolean).join("|");

  const text = String(value).trim();
  if (!text) return "";

  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean).join("|");
  } catch {
    // Not JSON: fall through to PHP serialized parsing.
  }

  const parsed = parseFilterKeys(text);
  return parsed.length ? parsed.join("|") : normalizeComparable(text);
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

function normalizeComparable(value) {
  return decodeEntities(String(value ?? ""))
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeField(field, value) {
  if (field === "canonical_url") return normalizeCanonical(value);
  if (["price_amount", "hours_per_shift", "featured_image_legacy_id", "hero_image_legacy_id"].includes(field)) {
    return normalizeNumber(value);
  }
  if (field === "allow_filters") return normalizeBoolean(value);
  if (field === "filter_keys") return normalizeFilterKeys(value);
  return normalizeComparable(value);
}

function looksLikeLegacySeoNoise(value) {
  const text = normalizeComparable(value).toLocaleLowerCase("ru-RU");
  return text.includes("elementor") || text.includes("wp-content") || (text.includes("{") && text.includes("}"));
}

function allowsSeoAutofill(field, sourceValue, targetValue) {
  if (!["seo_title", "meta_description"].includes(field)) return false;
  if (!normalizeComparable(targetValue)) return false;
  const source = normalizeComparable(sourceValue);
  return !source || looksLikeLegacySeoNoise(source);
}

function robotDirectives(row) {
  const values = [];
  if (row.is_robots_noindex) values.push("noindex");
  if (row.is_robots_nofollow) values.push("nofollow");
  if (row.is_robots_noarchive) values.push("noarchive");
  if (row.is_robots_noimageindex) values.push("noimageindex");
  if (row.is_robots_nosnippet) values.push("nosnippet");
  return values.length ? values.join(",") : "";
}

function parsePrice(value) {
  if (!value) return "";
  const normalized = String(value).replace(/[^0-9,.]/g, "").replace(",", ".");
  if (!normalized) return "";
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? String(parsed) : "";
}

function parseInteger(value) {
  if (!value) return "";
  const parsed = Number.parseInt(String(value).replace(/[^0-9-]/g, ""), 10);
  return Number.isFinite(parsed) ? String(parsed) : "";
}

function commonPostSelect(postType) {
  return `
    SELECT JSON_OBJECT(
      'legacy_id', p.ID,
      'status', p.post_status,
      'title', p.post_title,
      'slug', p.post_name,
      'body', p.post_content,
      'excerpt', p.post_excerpt,
      'permalink', yi.permalink,
      'seo_title', yi.title,
      'meta_description', COALESCE(yi.description, (SELECT meta_value FROM wp_postmeta WHERE post_id = p.ID AND meta_key = '_yoast_wpseo_metadesc' LIMIT 1)),
      'canonical_url', COALESCE(yi.canonical, (SELECT meta_value FROM wp_postmeta WHERE post_id = p.ID AND meta_key = '_yoast_wpseo_canonical' LIMIT 1)),
      'is_robots_noindex', yi.is_robots_noindex,
      'is_robots_nofollow', yi.is_robots_nofollow,
      'is_robots_noarchive', yi.is_robots_noarchive,
      'is_robots_noimageindex', yi.is_robots_noimageindex,
      'is_robots_nosnippet', yi.is_robots_nosnippet
    ) AS doc
    FROM wp_posts p
    LEFT JOIN wp_yoast_indexable yi ON yi.object_type = 'post' AND yi.object_id = p.ID
    WHERE p.post_type = ${sqlString(postType)}
      AND p.post_status IN ('publish', 'pending')
    ORDER BY p.ID
  `;
}

function equipmentSelect() {
  return `
    SELECT JSON_OBJECT(
      'legacy_id', p.ID,
      'status', p.post_status,
      'title', p.post_title,
      'slug', p.post_name,
      'body', p.post_content,
      'excerpt', p.post_excerpt,
      'permalink', yi.permalink,
      'seo_title', yi.title,
      'meta_description', COALESCE(yi.description, (SELECT meta_value FROM wp_postmeta WHERE post_id = p.ID AND meta_key = '_yoast_wpseo_metadesc' LIMIT 1)),
      'canonical_url', COALESCE(yi.canonical, (SELECT meta_value FROM wp_postmeta WHERE post_id = p.ID AND meta_key = '_yoast_wpseo_canonical' LIMIT 1)),
      'is_robots_noindex', yi.is_robots_noindex,
      'is_robots_nofollow', yi.is_robots_nofollow,
      'is_robots_noarchive', yi.is_robots_noarchive,
      'is_robots_noimageindex', yi.is_robots_noimageindex,
      'is_robots_nosnippet', yi.is_robots_nosnippet,
      'price_raw', (SELECT NULLIF(meta_value, '') FROM wp_postmeta WHERE post_id = p.ID AND meta_key = 'tsena' LIMIT 1),
      'price_alt', (SELECT NULLIF(meta_value, '') FROM wp_postmeta WHERE post_id = p.ID AND meta_key = 'tsena_copy' LIMIT 1),
      'hours_per_shift', (SELECT NULLIF(meta_value, '') FROM wp_postmeta WHERE post_id = p.ID AND meta_key = 'chasov_v_smene' LIMIT 1),
      'featured_image_legacy_id', (SELECT NULLIF(meta_value, '') FROM wp_postmeta WHERE post_id = p.ID AND meta_key = '_thumbnail_id' LIMIT 1)
    ) AS doc
    FROM wp_posts p
    LEFT JOIN wp_yoast_indexable yi ON yi.object_type = 'post' AND yi.object_id = p.ID
    WHERE p.post_type = 'spetstekhnika'
      AND p.post_status IN ('publish', 'pending')
    ORDER BY p.ID
  `;
}

function termSelect(taxonomy) {
  return `
    SELECT JSON_OBJECT(
      'legacy_term_id', t.term_id,
      'legacy_taxonomy_id', tt.term_taxonomy_id,
      'name', t.name,
      'slug', t.slug,
      'description', tt.description,
      'permalink', yi.permalink,
      'seo_title', yi.title,
      'meta_description', yi.description,
      'canonical_url', yi.canonical,
      'is_robots_noindex', yi.is_robots_noindex,
      'is_robots_nofollow', yi.is_robots_nofollow,
      'is_robots_noarchive', yi.is_robots_noarchive,
      'is_robots_noimageindex', yi.is_robots_noimageindex,
      'is_robots_nosnippet', yi.is_robots_nosnippet,
      'body', COALESCE(
        (SELECT meta_value FROM wp_termmeta WHERE term_id = t.term_id AND meta_key IN ('seo-tekst', 'opisanie_brand', 'opisanie') ORDER BY meta_id DESC LIMIT 1),
        tt.description
      ),
      'hero_image_legacy_id', (SELECT NULLIF(meta_value, '') FROM wp_termmeta WHERE term_id = t.term_id AND meta_key IN ('izobrazhenie', 'thumbnail_id') ORDER BY meta_id DESC LIMIT 1),
      'discount_value', (SELECT NULLIF(meta_value, '') FROM wp_termmeta WHERE term_id = t.term_id AND meta_key = 'velichina-skiki' LIMIT 1),
      'allow_filters', (SELECT NULLIF(meta_value, '') FROM wp_termmeta WHERE term_id = t.term_id AND meta_key = 'allowfilters' LIMIT 1)
    ) AS doc
    FROM wp_terms t
    INNER JOIN wp_term_taxonomy tt ON tt.term_id = t.term_id
    LEFT JOIN wp_yoast_indexable yi ON yi.object_type = 'term' AND yi.object_id = t.term_id AND yi.object_sub_type = tt.taxonomy
    WHERE tt.taxonomy = ${sqlString(taxonomy)}
    ORDER BY t.term_id
  `;
}

function addSourceRecord(records, pathValue, record) {
  if (!pathValue) return;
  records.set(pathValue, record);
}

function buildSourceRecords() {
  const records = new Map();

  for (const row of wpJsonRows(commonPostSelect("page"))) {
    addSourceRecord(records, normalizePath(row.permalink, row.legacy_id === 57 ? "/" : `/${row.slug}/`), {
      kind: "page",
      source_id: String(row.legacy_id),
      title: row.title,
      slug: row.slug,
      body: row.body,
      excerpt: row.excerpt,
      seo_title: row.seo_title,
      meta_description: row.meta_description,
      canonical_url: row.canonical_url,
      robots: robotDirectives(row),
    });
  }

  for (const row of wpJsonRows(commonPostSelect("post"))) {
    addSourceRecord(records, normalizePath(row.permalink, `/${row.slug}/`), {
      kind: "post",
      source_id: String(row.legacy_id),
      title: row.title,
      slug: row.slug,
      body: row.body,
      excerpt: row.excerpt,
      seo_title: row.seo_title,
      meta_description: row.meta_description,
      canonical_url: row.canonical_url,
      robots: robotDirectives(row),
    });
  }

  for (const row of wpJsonRows(commonPostSelect("reviews"))) {
    addSourceRecord(records, normalizePath(row.permalink, `/reviews/${row.slug}/`), {
      kind: "reviews",
      source_id: String(row.legacy_id),
      title: row.title,
      slug: row.slug,
      body: row.body,
      excerpt: row.excerpt,
      seo_title: row.seo_title,
      meta_description: row.meta_description,
      canonical_url: row.canonical_url,
      robots: robotDirectives(row),
    });
  }

  for (const row of wpJsonRows(equipmentSelect())) {
    addSourceRecord(records, normalizePath(row.permalink, `/arenda_spetstekhniki/${row.slug}/`), {
      kind: "spetstekhnika",
      source_id: String(row.legacy_id),
      title: row.title,
      slug: row.slug,
      body: row.body,
      excerpt: row.excerpt,
      seo_title: row.seo_title,
      meta_description: row.meta_description,
      canonical_url: row.canonical_url,
      robots: robotDirectives(row),
      price_raw: row.price_raw,
      price_amount: parsePrice(row.price_raw),
      price_alt: row.price_alt,
      hours_per_shift: parseInteger(row.hours_per_shift),
      featured_image_legacy_id: parseInteger(row.featured_image_legacy_id),
    });
  }

  const terms = [
    ["vid-techniki", "arenda"],
    ["brand", "brand"],
    ["tipy-rabot", "tipy-rabot"],
  ];

  for (const [taxonomy, prefix] of terms) {
    for (const row of wpJsonRows(termSelect(taxonomy))) {
      addSourceRecord(records, normalizePath(row.permalink, `/${prefix}/${row.slug}/`), {
        kind: taxonomy,
        source_id: String(row.legacy_term_id),
        title: row.name,
        slug: row.slug,
        body: row.body,
        excerpt: row.description,
        seo_title: row.seo_title,
        meta_description: row.meta_description,
        canonical_url: row.canonical_url,
        robots: robotDirectives(row),
        hero_image_legacy_id: parseInteger(row.hero_image_legacy_id),
        discount_value: row.discount_value,
        allow_filters: row.allow_filters,
        filter_keys: JSON.stringify(parseFilterKeys(row.allow_filters)),
      });
    }
  }

  return records;
}

async function buildTargetRecords() {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const { rows } = await client.query(`
      SELECT 'page' AS kind, legacy_id::text AS source_id, url_path, title, slug, body, excerpt, seo_title, meta_description, canonical_url, robots,
        NULL::text AS price_raw, NULL::text AS price_amount, NULL::text AS price_alt, NULL::text AS hours_per_shift, NULL::text AS featured_image_legacy_id,
        NULL::text AS hero_image_legacy_id, NULL::text AS discount_value, NULL::text AS allow_filters, NULL::text AS filter_keys
      FROM pages
      UNION ALL
      SELECT 'post' AS kind, legacy_id::text AS source_id, url_path, title, slug, body, excerpt, seo_title, meta_description, canonical_url, robots,
        NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text
      FROM posts
      UNION ALL
      SELECT 'reviews' AS kind, legacy_id::text AS source_id, url_path, title, slug, body, excerpt, seo_title, meta_description, canonical_url, robots,
        NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text
      FROM reviews
      UNION ALL
      SELECT 'spetstekhnika' AS kind, legacy_id::text AS source_id, url_path, title, slug, body, excerpt, seo_title, meta_description, canonical_url, robots,
        price_raw, COALESCE(price_amount::text, '') AS price_amount, price_alt, COALESCE(hours_per_shift::text, '') AS hours_per_shift, COALESCE(featured_image_legacy_id::text, '') AS featured_image_legacy_id,
        NULL::text, NULL::text, NULL::text, NULL::text
      FROM equipment_items
      UNION ALL
      SELECT 'vid-techniki' AS kind, legacy_term_id::text AS source_id, url_path, name AS title, slug, body, description AS excerpt, seo_title, meta_description, canonical_url, robots,
        NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, COALESCE(hero_image_legacy_id::text, '') AS hero_image_legacy_id, discount_value, COALESCE(allow_filters::text, '') AS allow_filters, COALESCE(filter_keys::text, '[]') AS filter_keys
      FROM equipment_types
      UNION ALL
      SELECT 'brand' AS kind, legacy_term_id::text AS source_id, url_path, name AS title, slug, body, description AS excerpt, seo_title, meta_description, canonical_url, robots,
        NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text
      FROM brands
      UNION ALL
      SELECT 'tipy-rabot' AS kind, legacy_term_id::text AS source_id, url_path, name AS title, slug, body, description AS excerpt, seo_title, meta_description, canonical_url, robots,
        NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text
      FROM work_types
    `);

    return new Map(rows.map((row) => [ensureTrailingSlash(row.url_path), row]));
  } finally {
    await client.end();
  }
}

function fieldsForRecord(record) {
  const base = ["kind", "source_id", "title", "slug", "body", "excerpt", "seo_title", "meta_description", "canonical_url", "robots"];
  if (record?.kind === "spetstekhnika") {
    return [...base, "price_raw", "price_amount", "price_alt", "hours_per_shift", "featured_image_legacy_id"];
  }
  if (record?.kind === "vid-techniki") {
    return [...base, "hero_image_legacy_id", "discount_value", "filter_keys"];
  }
  return base;
}

function compareRecords(pathValue, source, target) {
  const errors = [];

  if (!source) errors.push("missing-source");
  if (!target) errors.push("missing-target");
  if (!source || !target) return errors;

  for (const field of fieldsForRecord(source)) {
    const left = normalizeField(field, source[field]);
    const right = normalizeField(field, target[field]);
    if (left !== right && allowsSeoAutofill(field, source[field], target[field])) continue;
    if (left !== right) errors.push(`${field}-diff`);
  }

  return errors;
}

function groupSummary(results) {
  const groups = new Map();
  for (const result of results) {
    const key = `${result.type}/${result.template}`;
    const summary = groups.get(key) || { count: 0, fail: 0 };
    summary.count += 1;
    if (result.errors.length) summary.fail += 1;
    groups.set(key, summary);
  }
  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right));
}

const inventory = parseCsv(await readFile(inventoryPath, "utf8"));
const comparableInventory = inventory.filter((row) => !generatedTemplates.has(row.template) && !generatedPaths.has(row.path));
const skipped = inventory.length - comparableInventory.length;

const sourceRecords = buildSourceRecords();
const targetRecords = await buildTargetRecords();

const results = comparableInventory.map((row) => {
  const pathKey = normalizePathKey(row.path);
  const source = sourceRecords.get(pathKey);
  const target = targetRecords.get(pathKey);
  return {
    ...row,
    errors: compareRecords(row.path, source, target),
  };
});

const failures = results.filter((result) => result.errors.length);
const fieldFailures = new Map();

for (const failure of failures) {
  for (const error of failure.errors) fieldFailures.set(error, (fieldFailures.get(error) || 0) + 1);
}

console.log(`INVENTORY=${inventoryPath}`);
console.log(`WP_SOURCE=${wp.container}/${wp.database}`);
console.log(`TARGET_DB=${databaseUrl.replace(/:[^:@/]+@/, ":***@")}`);
console.log(`SOURCE_RECORDS=${sourceRecords.size}`);
console.log(`TARGET_RECORDS=${targetRecords.size}`);
console.log(`TOTAL=${results.length} OK=${results.length - failures.length} FAIL=${failures.length} SKIPPED_GENERATED=${skipped}`);

for (const [group, summary] of groupSummary(results)) {
  console.log(`GROUP=${group} COUNT=${summary.count} FAIL=${summary.fail}`);
}

for (const [field, count] of [...fieldFailures.entries()].sort(([left], [right]) => left.localeCompare(right))) {
  console.log(`FIELD_FAIL=${field} COUNT=${count}`);
}

if (failures.length) {
  console.log("FAILURES:");
  for (const item of failures.slice(0, 80)) console.log(`${item.path} ${item.errors.join(",")}`);
  process.exitCode = 1;
}
