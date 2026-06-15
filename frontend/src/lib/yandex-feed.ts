import "server-only";

import { query } from "./db";
import { directusUrl, siteUrl, stripHtml } from "./format";
import fallbackOfferPaths from "./yandex-feed-fallback-paths.json";

type FeedCategory = {
  id: string;
  name: string;
};

type FeedWorkType = {
  name: string;
};

type FeedRow = {
  id: string;
  title: string;
  slug: string;
  url_path: string;
  excerpt: string | null;
  body: string | null;
  price_amount: string | null;
  price_raw: string | null;
  price_alt: string | null;
  hours_per_shift: number | null;
  image_id: string | null;
  equipment_types: FeedCategory[] | null;
  work_types: FeedWorkType[] | null;
};

type DirectusEquipmentItem = {
  id?: string | number | null;
  title?: string | null;
  slug?: string | null;
  url_path?: string | null;
  excerpt?: string | null;
  body?: string | null;
  price_amount?: string | number | null;
  price_raw?: string | null;
  price_alt?: string | null;
  hours_per_shift?: number | string | null;
  featured_file_id?: string | null;
};

const FALLBACK_CATEGORY_ID = "equipment";
const FALLBACK_CATEGORY_NAME = "Equipment";
const DESCRIPTION_LIMIT = 2500;
const FALLBACK_OFFER_PRICE = "0";
const SERVICES_FEED_TYPE = "SERVICES";
const DEFAULT_SET_ID = "s1";
const DEFAULT_SET_NAME = "Аренда спецтехники";
const DEFAULT_SET_PATH = "/arenda_spetstekhniki/";
const DEFAULT_SERVICE_REGION = "Россия";

function xmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toYmlDate(value: Date) {
  const pad = (num: number) => String(num).padStart(2, "0");
  const year = value.getUTCFullYear();
  const month = pad(value.getUTCMonth() + 1);
  const day = pad(value.getUTCDate());
  const hours = pad(value.getUTCHours());
  const minutes = pad(value.getUTCMinutes());
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function toAbsoluteUrl(pathValue: string) {
  if (/^https?:\/\//i.test(pathValue)) return pathValue;
  if (pathValue.startsWith("/")) return `${siteUrl()}${pathValue}`;
  return `${siteUrl()}/${pathValue}`;
}

function getFeedType() {
  return (process.env.YANDEX_WEBMASTER_FEED_TYPE || SERVICES_FEED_TYPE).trim().toUpperCase();
}

function resolveOfferPath(row: FeedRow) {
  const pathValue = row.url_path?.trim();
  if (pathValue) return pathValue;
  return `/arenda_spetstekhniki/${row.slug}/`;
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function slugToTitle(slug: string) {
  const title = slug
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!title) return "Спецтехника";
  return title.charAt(0).toUpperCase() + title.slice(1);
}

function normalizeOfferPath(pathValue: string) {
  const trimmed = pathValue.trim();
  if (!trimmed) return null;

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      const normalizedPath = parsed.pathname || "/";
      return normalizedPath.endsWith("/") ? normalizedPath : `${normalizedPath}/`;
    } catch {
      return null;
    }
  }

  const withSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withSlash.endsWith("/") ? withSlash : `${withSlash}/`;
}

function truncate(value: string, limit: number) {
  if (value.length <= limit) return value;
  return `${value.slice(0, Math.max(0, limit - 3)).trim()}...`;
}

function parsePrice(raw: string | null) {
  if (!raw) return null;

  const direct = Number(raw.replace(/\s+/g, "").replace(/,/g, "."));
  if (Number.isFinite(direct) && direct > 0) {
    const rounded = Math.round(direct * 100) / 100;
    return Number.isInteger(rounded) ? String(Math.trunc(rounded)) : rounded.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  }

  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return null;

  const parsed = Number.parseInt(digits, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return String(parsed);
}

function resolveOfferPrice(row: FeedRow) {
  const parsed = parsePrice(row.price_amount) ?? parsePrice(row.price_raw) ?? parsePrice(row.price_alt);
  if (parsed) return { value: parsed, isFallback: false };
  return { value: FALLBACK_OFFER_PRICE, isFallback: true };
}

function normalizeCategoryId(value: string) {
  const sanitized = value.trim().replace(/[^a-zA-Z0-9_-]/g, "-");
  return sanitized || FALLBACK_CATEGORY_ID;
}

function resolvePictureUrl(imageId: string | null) {
  if (!imageId) return null;

  const base = directusUrl().trim().replace(/\/$/, "");
  if (!/^https:\/\//i.test(base)) return null;

  try {
    const parsed = new URL(base);
    const hostname = parsed.hostname.toLowerCase();
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
      return null;
    }
  } catch {
    return null;
  }

  return `${base}/assets/${imageId}`;
}

function buildDescription(row: FeedRow) {
  const text = stripHtml(row.excerpt || row.body || "");
  const normalized = normalizeText(text);
  if (normalized) return truncate(normalized, DESCRIPTION_LIMIT);
  return truncate(normalizeText(row.title), DESCRIPTION_LIMIT);
}

function mapDirectusItemToFeedRow(item: DirectusEquipmentItem): FeedRow | null {
  const id = String(item.id ?? "").trim();
  if (!id) return null;

  const slug = normalizeText(item.slug ?? id) || id;
  const title = normalizeText(item.title ?? slug) || slug;
  const urlPathRaw = String(item.url_path ?? "").trim();
  const url_path = urlPathRaw || `/arenda_spetstekhniki/${slug}/`;

  const hours = Number(item.hours_per_shift);

  return {
    id,
    title,
    slug,
    url_path,
    excerpt: item.excerpt ?? null,
    body: item.body ?? null,
    price_amount: item.price_amount === null || item.price_amount === undefined ? null : String(item.price_amount),
    price_raw: item.price_raw ?? null,
    price_alt: item.price_alt ?? null,
    hours_per_shift: Number.isFinite(hours) && hours > 0 ? Math.trunc(hours) : null,
    image_id: item.featured_file_id ?? null,
    equipment_types: [],
    work_types: [],
  };
}

async function loadRowsFromDirectus() {
  const url = new URL(`${directusUrl()}/items/equipment_items`);
  url.searchParams.set("limit", "-1");
  url.searchParams.set(
    "fields",
    "id,title,slug,url_path,excerpt,body,price_amount,price_raw,price_alt,hours_per_shift,featured_file_id",
  );
  url.searchParams.set("filter[status][_eq]", "publish");
  url.searchParams.set("sort", "title");

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
      next: { revalidate: 900 },
    });

    if (!response.ok) {
      return [] as FeedRow[];
    }

    const payload = await response.json() as { data?: DirectusEquipmentItem[] };
    const items = Array.isArray(payload?.data) ? payload.data : [];
    return items
      .map(mapDirectusItemToFeedRow)
      .filter((row): row is FeedRow => Boolean(row));
  } catch {
    return [] as FeedRow[];
  }
}

function loadRowsFromFallbackPaths() {
  const rows: FeedRow[] = [];
  const seenSlugs = new Set<string>();

  for (const rawPath of fallbackOfferPaths as string[]) {
    const normalizedPath = normalizeOfferPath(rawPath);
    if (!normalizedPath || normalizedPath === DEFAULT_SET_PATH) continue;
    if (!normalizedPath.startsWith("/arenda_spetstekhniki/")) continue;

    const segments = normalizedPath.split("/").filter(Boolean);
    const slug = segments[segments.length - 1];
    if (!slug || seenSlugs.has(slug)) continue;

    seenSlugs.add(slug);
    rows.push({
      id: `fallback-${slug}`,
      title: slugToTitle(slug),
      slug,
      url_path: normalizedPath,
      excerpt: null,
      body: null,
      price_amount: null,
      price_raw: null,
      price_alt: null,
      hours_per_shift: null,
      image_id: null,
      equipment_types: [],
      work_types: [],
    });
  }

  return rows;
}

function buildOfferXml(row: FeedRow, categoryId: string, options: { includeSets: boolean; currencyId: string }) {
  const { value: price, isFallback } = resolveOfferPrice(row);

  const lines = [
    `      <offer id="${xmlEscape(row.id)}">`,
    `        <name>${xmlEscape(normalizeText(row.title))}</name>`,
    `        <url>${xmlEscape(toAbsoluteUrl(resolveOfferPath(row)))}</url>`,
    `        <price>${price}</price>`,
    `        <currencyId>${options.currencyId}</currencyId>`,
    "        <sales_notes>за смену</sales_notes>",
    `        <categoryId>${xmlEscape(categoryId)}</categoryId>`,
  ];

  if (options.includeSets) {
    lines.push(`        <set-ids>${DEFAULT_SET_ID}</set-ids>`);
    lines.push("        <param name=\"Рейтинг\">5.0</param>");
    lines.push("        <param name=\"Число отзывов\">1</param>");
    lines.push("        <param name=\"Годы опыта\">10</param>");
    lines.push(`        <param name="Регион">${xmlEscape(DEFAULT_SERVICE_REGION)}</param>`);
    lines.push("        <param name=\"Конверсия\">1.0</param>");
  }

  if (isFallback) {
    lines.push("        <param name=\"price_note\">Цена по запросу</param>");
  }

  const pictureUrl = resolvePictureUrl(row.image_id);
  if (pictureUrl) {
    lines.push(`        <picture>${xmlEscape(pictureUrl)}</picture>`);
  }

  const description = buildDescription(row);
  if (description) {
    lines.push(`        <description>${xmlEscape(description)}</description>`);
  }

  if (row.hours_per_shift && Number.isFinite(row.hours_per_shift) && row.hours_per_shift > 0) {
    lines.push(`        <param name="hours_per_shift">${Math.trunc(row.hours_per_shift)}</param>`);
  }

  for (const workType of row.work_types ?? []) {
    const normalizedWorkType = normalizeText(workType.name);
    if (!normalizedWorkType) continue;
    lines.push(`        <param name="work_type">${xmlEscape(normalizedWorkType)}</param>`);
  }

  lines.push("      </offer>");
  return lines.join("\n");
}

export async function buildYandexEquipmentYml() {
  const feedType = getFeedType();
  const includeSets = feedType === SERVICES_FEED_TYPE;
  const currencyId = includeSets ? "RUR" : "RUB";

  let rows = await query<FeedRow>(
    `
      SELECT
        e.id::text,
        e.slug,
        e.title,
        COALESCE(NULLIF(e.url_path, ''), '/arenda_spetstekhniki/' || e.slug || '/') AS url_path,
        e.excerpt,
        e.body,
        e.price_amount::text,
        e.price_raw,
        e.price_alt,
        e.hours_per_shift,
        e.featured_file_id::text AS image_id,
        COALESCE((
          SELECT json_agg(json_build_object('id', t.id::text, 'name', t.name) ORDER BY t.name)
          FROM equipment_items_equipment_types rel
          INNER JOIN equipment_types t ON t.id = rel.equipment_type_id
          WHERE rel.equipment_item_id = e.id
        ), '[]'::json) AS equipment_types,
        COALESCE((
          SELECT json_agg(json_build_object('name', w.name) ORDER BY w.name)
          FROM equipment_items_work_types rel
          INNER JOIN work_types w ON w.id = rel.work_type_id
          WHERE rel.equipment_item_id = e.id
        ), '[]'::json) AS work_types
      FROM equipment_items e
      WHERE e.status = 'publish'
      ORDER BY e.legacy_id NULLS LAST, e.title
    `,
  );

  if (rows.length === 0) {
    rows = await loadRowsFromDirectus();
  }

  if (rows.length === 0) {
    rows = loadRowsFromFallbackPaths();
  }

  const categoriesBySourceId = new Map<string, { id: string; name: string }>();
  const offers: string[] = [];

  const ensureCategory = (sourceId: string, name: string) => {
    const normalizedSourceId = normalizeCategoryId(sourceId);
    const existing = categoriesBySourceId.get(normalizedSourceId);
    if (existing) return existing.id;

    const id = String(categoriesBySourceId.size + 1);
    const normalizedName = normalizeText(name) || FALLBACK_CATEGORY_NAME;
    categoriesBySourceId.set(normalizedSourceId, { id, name: normalizedName });
    return id;
  };

  for (const row of rows) {
    const rowCategories = Array.isArray(row.equipment_types) ? row.equipment_types : [];

    if (rowCategories.length > 0) {
      for (const category of rowCategories) {
        ensureCategory(category.id, category.name);
      }
    }

    const primaryCategoryId = rowCategories.length > 0
      ? ensureCategory(rowCategories[0].id, rowCategories[0].name)
      : ensureCategory(FALLBACK_CATEGORY_ID, FALLBACK_CATEGORY_NAME);

    const offerXml = buildOfferXml(row, primaryCategoryId, { includeSets, currencyId });
    offers.push(offerXml);
  }

  if (categoriesBySourceId.size === 0) {
    ensureCategory(FALLBACK_CATEGORY_ID, FALLBACK_CATEGORY_NAME);
  }

  const categoriesXml = [...categoriesBySourceId.values()]
    .sort((left, right) => Number.parseInt(left.id, 10) - Number.parseInt(right.id, 10))
    .map((category) => `      <category id="${xmlEscape(category.id)}">${xmlEscape(category.name)}</category>`)
    .join("\n");

  const setsXml = includeSets
    ? [
        "    <sets>",
        `      <set id="${DEFAULT_SET_ID}">`,
        `        <name>${xmlEscape(DEFAULT_SET_NAME)}</name>`,
        `        <url>${xmlEscape(toAbsoluteUrl(DEFAULT_SET_PATH))}</url>`,
        "      </set>",
        "    </sets>",
      ].join("\n")
    : "";

  const date = toYmlDate(new Date());

  return [
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
    `<yml_catalog date="${date}">`,
    "  <shop>",
    "    <name>Katet</name>",
    "    <company>Katet</company>",
    `    <url>${xmlEscape(siteUrl())}</url>`,
    "    <currencies>",
    `      <currency id="${currencyId}" rate="1"/>`,
    "    </currencies>",
    "    <categories>",
    categoriesXml,
    "    </categories>",
    setsXml,
    "    <offers>",
    offers.join("\n"),
    "    </offers>",
    "  </shop>",
    "</yml_catalog>",
    "",
  ].join("\n");
}
