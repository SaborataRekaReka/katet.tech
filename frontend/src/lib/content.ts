import "server-only";

import { cache } from "react";
import { query } from "./db";
import type { ImageFile } from "./format";
import { directusUrl, ensureTrailingSlash } from "./format";

export type NavLink = {
  name: string;
  url_path: string;
  item_count?: number;
  image?: ImageFile | null;
};

export type RichPage = {
  id: string;
  title: string;
  slug: string;
  url_path: string;
  body: string | null;
  excerpt: string | null;
  seo_title: string | null;
  meta_description: string | null;
  canonical_url: string | null;
  robots: string | null;
  wp_updated_at?: string | null;
  image?: ImageFile | null;
  categories?: NavLink[];
};

export type BlogCategoryRecord = {
  id: string;
  name: string;
  slug: string;
  url_path: string;
  description: string | null;
  seo_title: string | null;
  meta_description: string | null;
  canonical_url: string | null;
  robots: string | null;
  item_count?: number;
};

export type EquipmentCardRecord = {
  id: string;
  title: string;
  slug: string;
  url_path: string;
  excerpt: string | null;
  price_raw: string | null;
  price_amount: string | null;
  hours_per_shift: number | null;
  image: ImageFile | null;
  equipment_types?: NavLink[];
  work_types?: NavLink[];
  specs?: Array<{ key: string; label: string; value: string; unit: string | null }>;
};

export type TaxonomyPageRecord = {
  id: string;
  name: string;
  slug: string;
  url_path: string;
  description: string | null;
  body: string | null;
  discount_value?: string | null;
  filter_keys?: string[] | null;
  seo_title: string | null;
  meta_description: string | null;
  canonical_url: string | null;
  robots: string | null;
  image: ImageFile | null;
};

export type EquipmentItemRecord = EquipmentCardRecord & {
  body: string | null;
  seo_title: string | null;
  meta_description: string | null;
  canonical_url: string | null;
  robots: string | null;
  specs: Array<{ key: string; label: string; value: string; unit: string | null }>;
  equipment_types: NavLink[];
  brands: NavLink[];
  work_types: NavLink[];
  related: EquipmentCardRecord[];
};

export type ReviewRecord = {
  id: string;
  title: string;
  slug: string;
  url_path: string;
  body: string | null;
  reviewer_name: string | null;
  rating: string | null;
  source_url: string | null;
  seo_title: string | null;
  meta_description: string | null;
  canonical_url: string | null;
  robots: string | null;
  image: ImageFile | null;
  photo: ImageFile | null;
};

const FALLBACK_BLOG_CATEGORIES = [
  {
    id: "fallback:ekskavatory",
    name: "Экскаваторы",
    slug: "ekskavatory",
    url_path: "/category/ekskavatory/",
    description: "Статьи об экскаваторах, выборе техники, аренде и работах на строительных объектах.",
    seo_title: "Экскаваторы — статьи Катет",
    meta_description: "Статьи об экскаваторах: выбор техники, аренда, виды работ и практические советы от Катет.",
    canonical_url: null,
    robots: "index,follow",
    item_count: 8,
  },
  {
    id: "fallback:buldozery",
    name: "Бульдозеры",
    slug: "buldozery",
    url_path: "/category/buldozery/",
    description: "Материалы о бульдозерах, земляных работах и подборе техники под объект.",
    seo_title: "Бульдозеры — статьи Катет",
    meta_description: "Статьи о бульдозерах: назначение, выбор техники для земляных работ и аренда спецтехники.",
    canonical_url: null,
    robots: "index,follow",
    item_count: 4,
  },
  {
    id: "fallback:manipulyatory",
    name: "Манипуляторы",
    slug: "manipulyatory",
    url_path: "/category/manipulyatory/",
    description: "Статьи о кранах-манипуляторах, перевозках, погрузке и выборе техники.",
    seo_title: "Манипуляторы — статьи Катет",
    meta_description: "Статьи о манипуляторах: виды, выбор, аренда и задачи для перевозки и погрузки грузов.",
    canonical_url: null,
    robots: "index,follow",
    item_count: 3,
  },
  {
    id: "fallback:podemniki",
    name: "Подъемники",
    slug: "podemniki",
    url_path: "/category/podemniki/",
    description: "Материалы о подъемниках, автовышках и работах на высоте.",
    seo_title: "Подъемники — статьи Катет",
    meta_description: "Статьи о подъемниках и автовышках: виды техники, выбор под задачу и аренда для высотных работ.",
    canonical_url: null,
    robots: "index,follow",
    item_count: 2,
  },
  {
    id: "fallback:traly",
    name: "Тралы",
    slug: "traly",
    url_path: "/category/traly/",
    description: "Статьи о тралах, перевозке спецтехники и выборе транспорта.",
    seo_title: "Тралы — статьи Катет",
    meta_description: "Статьи о тралах: виды платформ, перевозка спецтехники и выбор транспорта под задачу.",
    canonical_url: null,
    robots: "index,follow",
    item_count: 2,
  },
  {
    id: "fallback:raznoe",
    name: "Разное",
    slug: "raznoe",
    url_path: "/category/raznoe/",
    description: "Полезные статьи об аренде спецтехники, строительных работах и выборе машин.",
    seo_title: "Полезные статьи об аренде спецтехники — Катет",
    meta_description: "Полезные материалы Катет об аренде спецтехники, строительных работах, выборе машин и организации смены.",
    canonical_url: null,
    robots: "index,follow",
    item_count: 20,
  },
] satisfies ReadonlyArray<BlogCategoryRecord>;

type FallbackBlogCategorySlug = (typeof FALLBACK_BLOG_CATEGORIES)[number]["slug"];

const FALLBACK_BLOG_CATEGORY_RULES: Array<{
  slug: Exclude<FallbackBlogCategorySlug, "raznoe">;
  includes: string[];
  excludes?: string[];
}> = [
  {
    slug: "buldozery",
    includes: ["buldozer", "бульдозер"],
  },
  {
    slug: "ekskavatory",
    includes: ["ekskavator", "ehkskavator", "экскаватор"],
  },
  {
    slug: "manipulyatory",
    includes: ["manipulyator", "манипулятор"],
    excludes: ["kran", "кран"],
  },
  {
    slug: "podemniki",
    includes: ["podiemnik", "podyomnik", "подъемник", "подъёмник"],
  },
  {
    slug: "traly",
    includes: ["tral", "трал"],
  },
];

function fallbackBlogCategorySlugForPost(post: Pick<RichPage, "slug" | "title">): FallbackBlogCategorySlug {
  const source = `${post.slug} ${post.title}`.toLocaleLowerCase("ru-RU").replaceAll("ё", "е");

  for (const rule of FALLBACK_BLOG_CATEGORY_RULES) {
    const isIncluded = rule.includes.some((token) => source.includes(token));
    if (!isIncluded) continue;

    const isExcluded = rule.excludes?.some((token) => source.includes(token));
    if (isExcluded) continue;

    return rule.slug;
  }

  return "raznoe";
}

function buildFallbackBlogCategoryCounts(posts: RichPage[]) {
  const counts = new Map<FallbackBlogCategorySlug, number>();

  for (const category of FALLBACK_BLOG_CATEGORIES) {
    counts.set(category.slug, 0);
  }

  for (const post of posts) {
    const categorySlug = fallbackBlogCategorySlugForPost(post);
    counts.set(categorySlug, (counts.get(categorySlug) ?? 0) + 1);
  }

  return counts;
}

const hasBlogCategoryTables = cache(async () => {
  const [row] = await query<{ has_categories: boolean; has_post_categories: boolean }>(
    `
      SELECT
        to_regclass('public.categories') IS NOT NULL AS has_categories,
        to_regclass('public.posts_categories') IS NOT NULL AS has_post_categories
    `,
  );

  return Boolean(row?.has_categories && row?.has_post_categories);
});

const imageSql = (alias: string) => `
  CASE WHEN ${alias}.id IS NULL THEN NULL ELSE json_build_object(
    'id', ${alias}.id,
    'filename_download', ${alias}.filename_download,
    'title', ${alias}.title,
    'type', ${alias}.type
  ) END
`;

const equipmentTypesSql = `
  COALESCE((
    SELECT json_agg(
      json_build_object('name', t.name, 'url_path', t.url_path)
      ORDER BY t.name
    )
    FROM equipment_items_equipment_types rel
    INNER JOIN equipment_types t ON t.id = rel.equipment_type_id
    WHERE rel.equipment_item_id = e.id
  ), '[]'::json) AS equipment_types
`;

const equipmentWorkTypesSql = `
  COALESCE((
    SELECT json_agg(
      json_build_object('name', w.name, 'url_path', w.url_path)
      ORDER BY w.name
    )
    FROM equipment_items_work_types rel
    INNER JOIN work_types w ON w.id = rel.work_type_id
    WHERE rel.equipment_item_id = e.id
  ), '[]'::json) AS work_types
`;

const equipmentSpecsSql = `
  COALESCE((
    SELECT json_agg(
      json_build_object('key', s.key, 'label', s.label, 'value', s.value, 'unit', s.unit)
      ORDER BY s.sort, s.label
    )
    FROM equipment_specs s
    WHERE s.equipment_item_id = e.id
  ), '[]'::json) AS specs
`;

function buildEquipmentCardSql(includeWorkTypes: boolean) {
  return `
    SELECT
      e.id::text,
      e.title,
      e.slug,
      e.url_path,
      e.excerpt,
      e.price_raw,
      e.price_amount::text,
      e.hours_per_shift,
      ${imageSql("f")} AS image,
      ${equipmentTypesSql},
      ${includeWorkTypes ? equipmentWorkTypesSql : "'[]'::json AS work_types"},
      ${equipmentSpecsSql}
    FROM equipment_items e
    LEFT JOIN directus_files f ON f.id = e.featured_file_id
  `;
}

const equipmentCardSql = buildEquipmentCardSql(true);
const equipmentCardSqlNoWorkTypes = buildEquipmentCardSql(false);

const getImportedMediaMap = cache(async () => {
  const rows = await query<{ source_path: string; directus_file_id: string }>(
    `
      SELECT source_path, directus_file_id::text
      FROM media_assets
      WHERE directus_file_id IS NOT NULL
    `,
  );

  return new Map(rows.map((row) => [normalizeUploadPath(row.source_path), row.directus_file_id]));
});

function normalizeUploadPath(value: string) {
  let normalized = value.trim().replaceAll("\\", "/");
  const marker = "/wp-content/uploads/";
  const markerIndex = normalized.indexOf(marker);
  if (markerIndex !== -1) normalized = normalized.slice(markerIndex + marker.length);
  normalized = normalized.replace(/^\/+/, "").split("?")[0].split("#")[0];
  try {
    normalized = decodeURIComponent(normalized);
  } catch {
    // Keep the legacy value when escaping is malformed.
  }
  return normalized;
}

function rewriteImportedMediaUrls(value: string, mediaMap: Map<string, string>) {
  const urlPattern = /(?:https?:\/\/(?:www\.)?katet\.tech|http:\/\/localhost:8081)?\/wp-content\/uploads\/([^\s"'()<>?#]+)(?:[?#][^\s"'()<>]*)?/gi;

  return value.replace(urlPattern, (match, sourcePath: string) => {
    const fileId = mediaMap.get(normalizeUploadPath(sourcePath));
    return fileId ? `${directusUrl()}/assets/${fileId}` : match;
  });
}

async function rewriteContentRecords<T extends Record<string, unknown>>(records: T[]) {
  if (!records.length) return records;

  const contentFields = ["body", "description", "excerpt"] as const;
  const hasLegacyUploadUrls = records.some((record) =>
    contentFields.some((field) => {
      const value = record[field];
      return typeof value === "string" && value.includes("/wp-content/uploads/");
    }),
  );

  if (!hasLegacyUploadUrls) return records;

  const mediaMap = await getImportedMediaMap();
  if (!mediaMap.size) return records;

  return records.map((record) => {
    const next: Record<string, unknown> = { ...record };
    for (const field of contentFields) {
      if (typeof next[field] === "string") {
        next[field] = rewriteImportedMediaUrls(next[field], mediaMap);
      }
    }
    return next as T;
  });
}

async function rewriteContentRecord<T extends Record<string, unknown>>(record: T | null | undefined) {
  if (!record) return record;
  const [rewritten] = await rewriteContentRecords([record]);
  return rewritten;
}

export const getNavigationData = cache(async () => {
  const [equipmentTypes, workTypes, brands] = await Promise.all([
    query<NavLink>(
      `
        SELECT t.name, t.url_path, COUNT(e.id)::int AS item_count
        FROM equipment_types t
        LEFT JOIN equipment_items_equipment_types rel ON rel.equipment_type_id = t.id
        LEFT JOIN equipment_items e ON e.id = rel.equipment_item_id AND e.status = 'publish'
        WHERE t.url_path IS NOT NULL
        GROUP BY t.id, t.name, t.url_path, t.legacy_term_id
        ORDER BY COUNT(e.id) DESC, t.legacy_term_id NULLS LAST, t.name
        LIMIT 14
      `,
    ),
    query<NavLink>(
      `
        SELECT w.name, w.url_path, COUNT(e.id)::int AS item_count
        FROM work_types w
        LEFT JOIN equipment_items_work_types rel ON rel.work_type_id = w.id
        LEFT JOIN equipment_items e ON e.id = rel.equipment_item_id AND e.status = 'publish'
        WHERE w.url_path IS NOT NULL
        GROUP BY w.id, w.name, w.url_path
        ORDER BY COUNT(e.id) DESC, w.name
        LIMIT 80
      `,
    ),
    query<NavLink>(
      `
        SELECT b.name, b.url_path, COUNT(e.id)::int AS item_count
        FROM brands b
        LEFT JOIN equipment_items_brands rel ON rel.brand_id = b.id
        LEFT JOIN equipment_items e ON e.id = rel.equipment_item_id AND e.status = 'publish'
        WHERE b.url_path IS NOT NULL
        GROUP BY b.id, b.name, b.url_path
        ORDER BY COUNT(e.id) DESC, b.name
        LIMIT 8
      `,
    ),
  ]);

  return { equipmentTypes, workTypes, brands };
});

export const getHomeData = cache(async () => {
  const [page] = await getPageByPath("/");
  const [heroType] = await query<TaxonomyPageRecord>(
    `
      SELECT
        t.id::text,
        t.name,
        t.slug,
        t.url_path,
        t.description,
        t.body,
        t.discount_value,
        t.filter_keys,
        t.seo_title,
        t.meta_description,
        t.canonical_url,
        t.robots,
        ${imageSql("f")} AS image
      FROM equipment_types t
      LEFT JOIN directus_files f ON f.id = t.hero_file_id
      WHERE t.slug = 'arenda-avtokrana'
      LIMIT 1
    `,
  );

  const [equipmentTypes, reviews] = await Promise.all([
    getEquipmentTypesIndex(20),
    getReviews(6),
  ]);

  return { page, heroType, equipmentTypes, reviews };
});

export const getEquipmentTypesIndex = cache(async (limit = 80) => {
  const rows = await query<TaxonomyPageRecord>(
    `
      SELECT
        t.id::text,
        t.name,
        t.slug,
        t.url_path,
        NULL::text AS description,
        NULL::text AS body,
        NULL::text AS discount_value,
        t.filter_keys,
        NULL::text AS seo_title,
        NULL::text AS meta_description,
        NULL::text AS canonical_url,
        NULL::text AS robots,
        NULL::json AS image
      FROM equipment_types t
      INNER JOIN equipment_items_equipment_types rel ON rel.equipment_type_id = t.id
      INNER JOIN equipment_items e ON e.id = rel.equipment_item_id AND e.status = 'publish'
      WHERE t.url_path IS NOT NULL
      GROUP BY t.id, t.name, t.slug, t.url_path, t.filter_keys, t.legacy_term_id
      ORDER BY COUNT(e.id) DESC, t.legacy_term_id NULLS LAST, t.name
      LIMIT $1
    `,
    [limit],
  );

  return rewriteContentRecords(rows);
});

export const getWorkTypesIndex = cache(async (limit = 80) => {
  return query<NavLink>(
    `
      SELECT
        w.name,
        w.url_path,
        COUNT(e.id)::int AS item_count,
        (
          SELECT ${imageSql("f_preview")}
          FROM equipment_items_work_types rel_preview
          INNER JOIN equipment_items e_preview ON e_preview.id = rel_preview.equipment_item_id AND e_preview.status = 'publish'
          LEFT JOIN directus_files f_preview ON f_preview.id = e_preview.featured_file_id
          WHERE rel_preview.work_type_id = w.id AND e_preview.featured_file_id IS NOT NULL
          ORDER BY e_preview.legacy_id NULLS LAST, e_preview.title
          LIMIT 1
        ) AS image
      FROM work_types w
      LEFT JOIN equipment_items_work_types rel ON rel.work_type_id = w.id
      LEFT JOIN equipment_items e ON e.id = rel.equipment_item_id AND e.status = 'publish'
      WHERE w.url_path IS NOT NULL
      GROUP BY w.id, w.name, w.url_path
      ORDER BY w.name
      LIMIT $1
    `,
    [limit],
  );
});

export const getBrandsIndex = cache(async (limit = 80) => {
  return query<NavLink>(
    `
      SELECT b.name, b.url_path, COUNT(e.id)::int AS item_count
      FROM brands b
      LEFT JOIN equipment_items_brands rel ON rel.brand_id = b.id
      LEFT JOIN equipment_items e ON e.id = rel.equipment_item_id AND e.status = 'publish'
      WHERE b.url_path IS NOT NULL
      GROUP BY b.id, b.name, b.url_path
      ORDER BY b.name
      LIMIT $1
    `,
    [limit],
  );
});

export const getEquipmentIndex = cache(async (limit = 160) => {
  const rows = await query<EquipmentCardRecord>(
    `${equipmentCardSql}
      WHERE e.status = 'publish'
      ORDER BY e.legacy_id NULLS LAST, e.title
      LIMIT $1
    `,
    [limit],
  );

  return rewriteContentRecords(rows);
});

export const getEquipmentIndexForCategorySidebar = cache(async (limit = 160) => {
  const rows = await query<EquipmentCardRecord>(
    `${equipmentCardSqlNoWorkTypes}
      WHERE e.status = 'publish'
      ORDER BY e.legacy_id NULLS LAST, e.title
      LIMIT $1
    `,
    [limit],
  );

  return rewriteContentRecords(rows);
});

export async function getEquipmentTypePage(slug: string) {
  const [type] = await query<TaxonomyPageRecord>(
    `
      SELECT
        t.id::text,
        t.name,
        t.slug,
        t.url_path,
        t.description,
        t.body,
        t.discount_value,
        t.filter_keys,
        t.seo_title,
        t.meta_description,
        t.canonical_url,
        t.robots,
        ${imageSql("f")} AS image
      FROM equipment_types t
      LEFT JOIN directus_files f ON f.id = t.hero_file_id
      WHERE t.slug = $1
      LIMIT 1
    `,
    [slug],
  );

  const page = await rewriteContentRecord(type);
  if (!page) return null;

  const equipmentRows = await query<EquipmentCardRecord>(
    `${equipmentCardSql}
      INNER JOIN equipment_items_equipment_types rel ON rel.equipment_item_id = e.id
      WHERE e.status = 'publish' AND rel.equipment_type_id = $1
      ORDER BY e.price_amount NULLS LAST, e.legacy_id NULLS LAST, e.title
    `,
    [page.id],
  );
  const equipment = await rewriteContentRecords(equipmentRows);

  return { page, equipment };
}

export async function getEquipmentItemPage(slug: string) {
  const [item] = await query<EquipmentItemRecord>(
    `
      SELECT
        e.id::text,
        e.title,
        e.slug,
        e.url_path,
        e.body,
        e.excerpt,
        e.price_raw,
        e.price_amount::text,
        e.hours_per_shift,
        e.seo_title,
        e.meta_description,
        e.canonical_url,
        e.robots,
        ${imageSql("f")} AS image
      FROM equipment_items e
      LEFT JOIN directus_files f ON f.id = e.featured_file_id
      WHERE e.slug = $1 AND e.status = 'publish'
      LIMIT 1
    `,
    [slug],
  );

  const rewrittenItem = await rewriteContentRecord(item);
  if (!rewrittenItem) return null;

  const [specs, equipmentTypes, brands, workTypes] = await Promise.all([
    query<{ key: string; label: string; value: string; unit: string | null }>(
      `
        SELECT key, label, value, unit
        FROM equipment_specs
        WHERE equipment_item_id = $1
        ORDER BY sort, label
      `,
      [rewrittenItem.id],
    ),
    query<NavLink>(
      `
        SELECT t.name, t.url_path
        FROM equipment_types t
        INNER JOIN equipment_items_equipment_types rel ON rel.equipment_type_id = t.id
        WHERE rel.equipment_item_id = $1
        ORDER BY t.name
      `,
      [rewrittenItem.id],
    ),
    query<NavLink>(
      `
        SELECT b.name, b.url_path
        FROM brands b
        INNER JOIN equipment_items_brands rel ON rel.brand_id = b.id
        WHERE rel.equipment_item_id = $1
        ORDER BY b.name
      `,
      [rewrittenItem.id],
    ),
    query<NavLink>(
      `
        SELECT w.name, w.url_path
        FROM work_types w
        INNER JOIN equipment_items_work_types rel ON rel.work_type_id = w.id
        WHERE rel.equipment_item_id = $1
        ORDER BY w.name
      `,
      [rewrittenItem.id],
    ),
  ]);

  const relatedRows = equipmentTypes[0]
    ? await query<EquipmentCardRecord>(
        `${equipmentCardSql}
          INNER JOIN equipment_items_equipment_types rel ON rel.equipment_item_id = e.id
          INNER JOIN equipment_types t ON t.id = rel.equipment_type_id
          WHERE e.status = 'publish' AND t.url_path = $1 AND e.id <> $2
          ORDER BY e.legacy_id NULLS LAST, e.title
          LIMIT 6
        `,
        [equipmentTypes[0].url_path, rewrittenItem.id],
      )
    : [];
  const related = await rewriteContentRecords(relatedRows);

  return {
    ...rewrittenItem,
    specs,
    equipment_types: equipmentTypes,
    brands,
    work_types: workTypes,
    related,
  };
}

export async function getBrandPage(slug: string) {
  return getLinkedTaxonomyPage("brands", "equipment_items_brands", "brand_id", slug);
}

export async function getWorkTypePage(slug: string) {
  return getLinkedTaxonomyPage("work_types", "equipment_items_work_types", "work_type_id", slug);
}

async function getLinkedTaxonomyPage(
  table: "brands" | "work_types",
  pivotTable: "equipment_items_brands" | "equipment_items_work_types",
  pivotColumn: "brand_id" | "work_type_id",
  slug: string,
) {
  const [page] = await query<TaxonomyPageRecord>(
    `
      SELECT
        t.id::text,
        t.name,
        t.slug,
        t.url_path,
        t.description,
        t.body,
        '[]'::jsonb AS filter_keys,
        t.seo_title,
        t.meta_description,
        t.canonical_url,
        t.robots,
        NULL::json AS image
      FROM ${table} t
      WHERE t.slug = $1
      LIMIT 1
    `,
    [slug],
  );

  const rewrittenPage = await rewriteContentRecord(page);
  if (!rewrittenPage) return null;

  const equipmentRows = await query<EquipmentCardRecord>(
    `${equipmentCardSql}
      INNER JOIN ${pivotTable} rel ON rel.equipment_item_id = e.id
      WHERE e.status = 'publish' AND rel.${pivotColumn} = $1
      ORDER BY e.legacy_id NULLS LAST, e.title
    `,
    [rewrittenPage.id],
  );
  const equipment = await rewriteContentRecords(equipmentRows);

  return { page: rewrittenPage, equipment };
}

export async function getBlogPosts(limit = 100) {
  const withCategories = await hasBlogCategoryTables();

  const rows = withCategories
    ? await query<RichPage>(
        `
          SELECT
            p.id::text,
            p.title,
            p.slug,
            p.url_path,
            p.body,
            p.excerpt,
            p.seo_title,
            p.meta_description,
            p.canonical_url,
            p.robots,
            p.wp_updated_at::text,
            ${imageSql("f")} AS image,
            COALESCE((
              SELECT json_agg(
                json_build_object('name', c.name, 'url_path', c.url_path)
                ORDER BY c.sort NULLS LAST, c.name
              )
              FROM posts_categories rel
              INNER JOIN categories c ON c.id = rel.category_id
              WHERE rel.post_id = p.id AND c.url_path IS NOT NULL
            ), '[]'::json) AS categories
          FROM posts p
          LEFT JOIN directus_files f ON f.id = p.featured_file_id
          WHERE p.status = 'publish'
          ORDER BY p.wp_created_at DESC NULLS LAST, p.id DESC
          LIMIT $1
        `,
        [limit],
      )
    : await query<RichPage>(
        `
          SELECT
            p.id::text,
            p.title,
            p.slug,
            p.url_path,
            p.body,
            p.excerpt,
            p.seo_title,
            p.meta_description,
            p.canonical_url,
            p.robots,
            p.wp_updated_at::text,
            ${imageSql("f")} AS image,
            '[]'::json AS categories
          FROM posts p
          LEFT JOIN directus_files f ON f.id = p.featured_file_id
          WHERE p.status = 'publish'
          ORDER BY p.wp_created_at DESC NULLS LAST, p.id DESC
          LIMIT $1
        `,
        [limit],
      );

  return rewriteContentRecords(rows);
}

export async function getPostBySlug(slug: string) {
  const withCategories = await hasBlogCategoryTables();

  const rows = withCategories
    ? await query<RichPage>(
        `
          SELECT
            p.id::text,
            p.title,
            p.slug,
            p.url_path,
            p.body,
            p.excerpt,
            p.seo_title,
            p.meta_description,
            p.canonical_url,
            p.robots,
            p.wp_updated_at::text,
            ${imageSql("f")} AS image,
            COALESCE((
              SELECT json_agg(
                json_build_object('name', c.name, 'url_path', c.url_path)
                ORDER BY c.sort NULLS LAST, c.name
              )
              FROM posts_categories rel
              INNER JOIN categories c ON c.id = rel.category_id
              WHERE rel.post_id = p.id AND c.url_path IS NOT NULL
            ), '[]'::json) AS categories
          FROM posts p
          LEFT JOIN directus_files f ON f.id = p.featured_file_id
          WHERE p.slug = $1 AND p.status = 'publish'
          LIMIT 1
        `,
        [slug],
      )
    : await query<RichPage>(
        `
          SELECT
            p.id::text,
            p.title,
            p.slug,
            p.url_path,
            p.body,
            p.excerpt,
            p.seo_title,
            p.meta_description,
            p.canonical_url,
            p.robots,
            p.wp_updated_at::text,
            ${imageSql("f")} AS image,
            '[]'::json AS categories
          FROM posts p
          LEFT JOIN directus_files f ON f.id = p.featured_file_id
          WHERE p.slug = $1 AND p.status = 'publish'
          LIMIT 1
        `,
        [slug],
      );

  return rewriteContentRecord(rows[0] ?? null);
}

export const getPageByPath = cache(async (path: string) => {
  const rows = await query<RichPage>(
    `
      SELECT
        p.id::text,
        p.title,
        p.slug,
        p.url_path,
        p.body,
        p.excerpt,
        p.seo_title,
        p.meta_description,
        p.canonical_url,
        p.robots,
        p.wp_updated_at::text,
        ${imageSql("f")} AS image
      FROM pages p
      LEFT JOIN directus_files f ON f.id = p.featured_file_id
      WHERE p.url_path = $1 AND p.status = 'publish'
      LIMIT 1
    `,
    [ensureTrailingSlash(path)],
  );

  return rewriteContentRecords(rows);
});

export const getPageOrPostByRootSlug = cache(async (slug: string) => {
  const path = ensureTrailingSlash(`/${slug}`);
  const [page] = await getPageByPath(path);
  if (page) return { kind: "page" as const, record: page };

  const post = await getPostBySlug(slug);
  if (post) return { kind: "post" as const, record: post };

  return null;
});

export async function getReviews(limit = 30) {
  const rows = await query<ReviewRecord>(
    `
      SELECT
        r.id::text,
        r.title,
        r.slug,
        r.url_path,
        r.body,
        r.reviewer_name,
        r.rating::text,
        r.source_url,
        r.seo_title,
        r.meta_description,
        r.canonical_url,
        COALESCE(r.robots, 'noindex') AS robots,
        ${imageSql("featured")} AS image,
        ${imageSql("photo")} AS photo
      FROM reviews r
      LEFT JOIN directus_files featured ON featured.id = r.featured_file_id
      LEFT JOIN directus_files photo ON photo.id = r.photo_file_id
      WHERE r.status = 'publish'
      ORDER BY r.wp_created_at DESC NULLS LAST, r.id DESC
      LIMIT $1
    `,
    [limit],
  );

  return rewriteContentRecords(rows);
}

export async function getReviewBySlug(slug: string) {
  const decodedSlug = decodeURIComponent(slug);
  const encodedSlug = encodeURIComponent(decodedSlug).toLowerCase();
  const decodedUrlPath = ensureTrailingSlash(`/reviews/${decodedSlug}`);
  const encodedUrlPath = ensureTrailingSlash(`/reviews/${encodedSlug}`);
  const rows = await query<ReviewRecord>(
    `
      SELECT
        r.id::text,
        r.title,
        r.slug,
        r.url_path,
        r.body,
        r.reviewer_name,
        r.rating::text,
        r.source_url,
        r.seo_title,
        r.meta_description,
        r.canonical_url,
        COALESCE(r.robots, 'noindex') AS robots,
        ${imageSql("featured")} AS image,
        ${imageSql("photo")} AS photo
      FROM reviews r
      LEFT JOIN directus_files featured ON featured.id = r.featured_file_id
      LEFT JOIN directus_files photo ON photo.id = r.photo_file_id
      WHERE (r.slug = $1 OR r.slug = $2 OR r.url_path = $3 OR r.url_path = $4) AND r.status = 'publish'
      LIMIT 1
    `,
    [slug, encodedSlug, decodedUrlPath, encodedUrlPath],
  );

  return rewriteContentRecord(rows[0] ?? null);
}

export async function getCategoryPage(slug: string) {
  const withCategories = await hasBlogCategoryTables();

  if (!withCategories) {
    const fallback = FALLBACK_BLOG_CATEGORIES.find((item) => item.slug === slug);
    if (!fallback) return null;

    const posts = await getBlogPosts(100);
    const filteredPosts = posts.filter((post) => fallbackBlogCategorySlugForPost(post) === fallback.slug);

    return {
      ...fallback,
      item_count: filteredPosts.length,
      posts: filteredPosts,
    };
  }

  const [category] = await query<BlogCategoryRecord>(
    `
      SELECT
        c.id::text,
        c.name,
        c.slug,
        c.url_path,
        c.description,
        c.seo_title,
        c.meta_description,
        c.canonical_url,
        c.robots
      FROM categories c
      WHERE c.slug = $1 AND c.url_path IS NOT NULL
      LIMIT 1
    `,
    [slug],
  );

  if (!category) return null;

  const posts = await query<RichPage>(
    `
      SELECT
        p.id::text,
        p.title,
        p.slug,
        p.url_path,
        p.body,
        p.excerpt,
        p.seo_title,
        p.meta_description,
        p.canonical_url,
        p.robots,
        p.wp_updated_at::text,
        ${imageSql("f")} AS image,
        COALESCE((
          SELECT json_agg(
            json_build_object('name', c2.name, 'url_path', c2.url_path)
            ORDER BY c2.sort NULLS LAST, c2.name
          )
          FROM posts_categories rel2
          INNER JOIN categories c2 ON c2.id = rel2.category_id
          WHERE rel2.post_id = p.id AND c2.url_path IS NOT NULL
        ), '[]'::json) AS categories
      FROM posts p
      INNER JOIN posts_categories rel ON rel.post_id = p.id
      LEFT JOIN directus_files f ON f.id = p.featured_file_id
      WHERE p.status = 'publish' AND rel.category_id = $1::bigint
      ORDER BY p.wp_created_at DESC NULLS LAST, p.id DESC
    `,
    [category.id],
  );

  return {
    ...category,
    posts: await rewriteContentRecords(posts),
  };
}

export async function getBlogCategories(limit = 10) {
  const withCategories = await hasBlogCategoryTables();

  if (!withCategories) {
    const posts = await getBlogPosts(100);
    const countsByCategory = buildFallbackBlogCategoryCounts(posts);

    return FALLBACK_BLOG_CATEGORIES
      .map((category) => ({
        ...category,
        item_count: countsByCategory.get(category.slug) ?? 0,
      }))
      .filter((category) => (category.item_count ?? 0) > 0)
      .slice(0, limit);
  }

  return query<BlogCategoryRecord>(
    `
      SELECT
        c.id::text,
        c.name,
        c.slug,
        c.url_path,
        c.description,
        c.seo_title,
        c.meta_description,
        c.canonical_url,
        c.robots,
        COUNT(p.id)::int AS item_count
      FROM categories c
      LEFT JOIN posts_categories rel ON rel.category_id = c.id
      LEFT JOIN posts p ON p.id = rel.post_id AND p.status = 'publish'
      WHERE c.url_path IS NOT NULL
      GROUP BY c.id, c.name, c.slug, c.url_path, c.description, c.seo_title, c.meta_description, c.canonical_url, c.robots
      HAVING COUNT(p.id) > 0
      ORDER BY COUNT(p.id) DESC, c.sort NULLS LAST, c.name
      LIMIT $1
    `,
    [limit],
  );
}

export async function getSitemapPaths() {
  const withCategories = await hasBlogCategoryTables();

  const excludedPaths = new Set([
    "/arenda/arenda-avtovishek-v-moskve/",
    "/arenda/arenda-podemnikov-v-moskve/",
    "/arenda/arenda-tehniki-dlya-uborki-snega/",
    "/arenda/gusenichnye-ekskavatory/",
    "/arenda/nozhnichnye-podemniki-v-moskve/",
    "/arenda/uslugi-manipulyatora-7-tonn/",
    "/brand/avtovyshki-daewoo/",
    "/tipy-rabot/demontaj-zdaniy/",
    "/tipy-rabot/vykopat-kotlovan-pod-fundament/",
  ]);

  const staticPaths = [
    { url_path: "/arenda_spetstekhniki/", updated_at: null },
    { url_path: "/goroda/", updated_at: null },
    ...(!withCategories
      ? ["/category/buldozery/", "/category/ekskavatory/", "/category/manipulyatory/", "/category/podemniki/", "/category/raznoe/"].map((url_path) => ({
          url_path,
          updated_at: null,
        }))
      : []),
  ];

  const categoriesUnion = withCategories
    ? "UNION ALL SELECT url_path, updated_at::text FROM categories WHERE url_path IS NOT NULL"
    : "";

  const paths = await query<{ url_path: string; updated_at: string | null }>(
    `
      SELECT url_path, wp_updated_at::text AS updated_at FROM pages WHERE status = 'publish' AND url_path IS NOT NULL
      UNION ALL SELECT url_path, wp_updated_at::text FROM posts WHERE status = 'publish' AND url_path IS NOT NULL
      UNION ALL SELECT url_path, wp_updated_at::text FROM equipment_items WHERE status = 'publish' AND url_path IS NOT NULL
      UNION ALL SELECT url_path, migrated_at::text FROM equipment_types WHERE url_path IS NOT NULL
      UNION ALL SELECT url_path, migrated_at::text FROM brands WHERE url_path IS NOT NULL
      UNION ALL SELECT url_path, migrated_at::text FROM work_types WHERE url_path IS NOT NULL
      ${categoriesUnion}
      ORDER BY url_path
    `,
  );

  const uniquePaths = new Map<string, { url_path: string; updated_at: string | null }>();

  for (const item of [...paths, ...staticPaths]) {
    const normalizedPath = ensureTrailingSlash(item.url_path);
    if (excludedPaths.has(normalizedPath)) continue;
    uniquePaths.set(normalizedPath, { ...item, url_path: normalizedPath });
  }

  return [...uniquePaths.values()].sort((left, right) => left.url_path.localeCompare(right.url_path));
}