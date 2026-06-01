import { execFileSync } from 'node:child_process';
import process from 'node:process';
import pg from 'pg';
import { getDatabaseUrl, getWpConfig, loadMigrationEnv } from './env.mjs';

loadMigrationEnv();

const { Client } = pg;

const dryRun = process.argv.includes('--dry-run');
const limitArgument = process.argv.find((argument) => argument.startsWith('--limit='));
const rowLimit = limitArgument ? Number.parseInt(limitArgument.split('=')[1], 10) : 0;

const wp = {
  ...getWpConfig(),
};

const databaseUrl = getDatabaseUrl();

const specDefinitions = [
  ['vmestimost-tsisterny', 'Вместимость цистерны'],
  ['vysota-borta', 'Высота борта'],
  ['vysota-vygruzki-pogruzchika', 'Высота выгрузки погрузчика'],
  ['vysota-otvala', 'Высота отвала'],
  ['vysota-podema', 'Высота подъема'],
  ['gabarity', 'Габариты'],
  ['glubina-kopaniia', 'Глубина копания'],
  ['glubina-ochishchaemoi-iamy', 'Глубина очищаемой ямы'],
  ['gruzovoi-moment', 'Грузовой момент'],
  ['gruzopodemnost', 'Грузоподъемность'],
  ['gruzopodemnost-strely', 'Грузоподъемность стрелы'],
  ['dlina-borta', 'Длина борта'],
  ['dlina-guska', 'Длина гуська'],
  ['dlina-kuzova', 'Длина кузова'],
  ['dlina-strely', 'Длина стрелы'],
  ['kolesnaia-baza', 'Колесная база'],
  ['kolesnaia-formula', 'Колесная формула'],
  ['maksimalnaia-vysota-podema', 'Максимальная высота подъема'],
  ['maksimalnyi-vylet-strely', 'Максимальный вылет стрелы'],
  ['massa', 'Масса'],
  ['moshchnost-dvigatelia', 'Мощность двигателя'],
  ['oborudovanie', 'Оборудование'],
  ['obiom-kovsha', 'Объем ковша'],
  ['obem-kovsha', 'Объем ковша'],
  ['obem-kuzova', 'Объем кузова'],
  ['obiom-tsisterny', 'Объем цистерны'],
  ['rabochaia-vysota', 'Рабочая высота'],
  ['rabochaia-shirina', 'Рабочая ширина'],
  ['razmer-platformyliulki', 'Размер платформы/люльки'],
  ['toplivo', 'Топливо'],
  ['shirina-borta', 'Ширина борта'],
  ['shirina-zony-moiki', 'Ширина зоны мойки'],
  ['shirina-kuzova', 'Ширина кузова'],
  ['shirina-otvala', 'Ширина отвала'],
];

const specLabels = new Map(specDefinitions);
const specKeyAliases = new Map([
  ['vysota', 'vysota-podema'],
]);
const specSort = new Map(specDefinitions.map(([key], index) => [key, index * 10 + 10]));

function limitClause() {
  return rowLimit > 0 ? ` LIMIT ${rowLimit}` : '';
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function wpJsonRows(sql) {
  const output = execFileSync(
    'docker',
    [
      'exec',
      wp.container,
      'mariadb',
      `-u${wp.user}`,
      `-p${wp.password}`,
      '--default-character-set=utf8mb4',
      '--batch',
      '--raw',
      '--skip-column-names',
      wp.database,
      '-e',
      sql,
    ],
    { encoding: 'utf8', maxBuffer: 1024 * 1024 * 200 },
  );

  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
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

function ensureTrailingSlash(value) {
  if (!value || value === '/') return '/';
  const normalized = value.startsWith('/') ? value : `/${value}`;
  return normalized.endsWith('/') ? normalized : `${normalized}/`;
}

function parsePrice(value) {
  if (!value) return null;
  const normalized = String(value).replace(/[^0-9,.]/g, '').replace(',', '.');
  if (!normalized) return null;
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseInteger(value) {
  if (!value) return null;
  const parsed = Number.parseInt(String(value).replace(/[^0-9-]/g, ''), 10);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < -2147483648 || parsed > 2147483647) return null;
  return parsed;
}

function parseNullableBoolean(value) {
  if (value === null || value === undefined || value === '') return null;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'да', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'нет', 'off'].includes(normalized)) return false;
  return null;
}

function parseFilterKeys(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return [...String(value).matchAll(/s:\d+:"([^"]+)"/g)].map((match) => match[1]);
}

function parsePositiveInteger(value) {
  const parsed = parseInteger(value);
  if (!parsed || parsed <= 0) return null;
  return parsed;
}

function collectAncestorChain(termLegacyId, parentByTerm) {
  const ancestors = [];
  const visited = new Set();
  let current = termLegacyId;

  while (current && parentByTerm.has(current) && !visited.has(current)) {
    visited.add(current);
    const parent = parentByTerm.get(current);
    if (!parent || parent <= 0) break;
    ancestors.push(parent);
    current = parent;
  }

  return ancestors;
}

function isRelatedTermCandidate(candidateTermLegacyId, linkedTermLegacyIds, parentByTerm) {
  if (!candidateTermLegacyId) return false;
  if (!linkedTermLegacyIds || linkedTermLegacyIds.size === 0) return true;
  if (linkedTermLegacyIds.has(candidateTermLegacyId)) return true;

  const candidateAncestors = new Set(collectAncestorChain(candidateTermLegacyId, parentByTerm));

  for (const linkedTermLegacyId of linkedTermLegacyIds) {
    if (candidateAncestors.has(linkedTermLegacyId)) return true;

    const linkedAncestors = new Set(collectAncestorChain(linkedTermLegacyId, parentByTerm));
    if (linkedAncestors.has(candidateTermLegacyId)) return true;

    for (const ancestorLegacyId of candidateAncestors) {
      if (linkedAncestors.has(ancestorLegacyId)) return true;
    }
  }

  return false;
}

function normalizeDate(value) {
  if (!value || String(value).startsWith('0000-')) return null;
  return value;
}

function robotDirectives(row) {
  const values = [];
  if (row.is_robots_noindex) values.push('noindex');
  if (row.is_robots_nofollow) values.push('nofollow');
  if (row.is_robots_noarchive) values.push('noarchive');
  if (row.is_robots_noimageindex) values.push('noimageindex');
  if (row.is_robots_nosnippet) values.push('nosnippet');
  return values.length ? values.join(',') : null;
}

async function upsert(client, table, uniqueColumn, data) {
  const entries = Object.entries(data).filter(([, value]) => value !== undefined);
  const columns = entries.map(([key]) => key);
  const values = entries.map(([, value]) => value);
  const placeholders = values.map((_, index) => `$${index + 1}`);
  const updates = columns
    .filter((column) => column !== uniqueColumn && column !== 'id')
    .map((column) => `${column} = EXCLUDED.${column}`)
    .join(', ');

  const query = `
    INSERT INTO ${table} (${columns.join(', ')})
    VALUES (${placeholders.join(', ')})
    ON CONFLICT (${uniqueColumn}) DO UPDATE SET ${updates || `${uniqueColumn} = EXCLUDED.${uniqueColumn}`}
    RETURNING id
  `;

  const result = await client.query(query, values);
  return result.rows[0].id;
}

async function insertPivot(client, table, leftColumn, leftId, rightColumn, rightId) {
  await client.query(
    `INSERT INTO ${table} (${leftColumn}, ${rightColumn}) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [leftId, rightId],
  );
}

async function tableExists(client, tableName) {
  const result = await client.query('SELECT to_regclass($1) AS table_name', [`public.${tableName}`]);
  return Boolean(result.rows[0]?.table_name);
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
      'wp_created_at', DATE_FORMAT(p.post_date_gmt, '%Y-%m-%dT%H:%i:%sZ'),
      'wp_updated_at', DATE_FORMAT(p.post_modified_gmt, '%Y-%m-%dT%H:%i:%sZ'),
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
    ${limitClause()}
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
      'wp_created_at', DATE_FORMAT(p.post_date_gmt, '%Y-%m-%dT%H:%i:%sZ'),
      'wp_updated_at', DATE_FORMAT(p.post_modified_gmt, '%Y-%m-%dT%H:%i:%sZ'),
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
      'category_term_legacy_id', (SELECT NULLIF(meta_value, '') FROM wp_postmeta WHERE post_id = p.ID AND meta_key = 'category' LIMIT 1),
      'featured_image_legacy_id', (SELECT NULLIF(meta_value, '') FROM wp_postmeta WHERE post_id = p.ID AND meta_key = '_thumbnail_id' LIMIT 1)
    ) AS doc
    FROM wp_posts p
    LEFT JOIN wp_yoast_indexable yi ON yi.object_type = 'post' AND yi.object_id = p.ID
    WHERE p.post_type = 'spetstekhnika'
      AND p.post_status IN ('publish', 'pending')
    ORDER BY p.ID
    ${limitClause()}
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
      'filter_keys', (SELECT NULLIF(meta_value, '') FROM wp_termmeta WHERE term_id = t.term_id AND meta_key = 'allowfilters' LIMIT 1)
    ) AS doc
    FROM wp_terms t
    INNER JOIN wp_term_taxonomy tt ON tt.term_id = t.term_id
    LEFT JOIN wp_yoast_indexable yi ON yi.object_type = 'term' AND yi.object_id = t.term_id AND yi.object_sub_type = tt.taxonomy
    WHERE tt.taxonomy = ${sqlString(taxonomy)}
    ORDER BY t.term_id
    ${limitClause()}
  `;
}

function termHierarchySelect(taxonomy) {
  return `
    SELECT JSON_OBJECT(
      'legacy_term_id', t.term_id,
      'parent_legacy_term_id', tt.parent
    ) AS doc
    FROM wp_terms t
    INNER JOIN wp_term_taxonomy tt ON tt.term_id = t.term_id
    WHERE tt.taxonomy = ${sqlString(taxonomy)}
    ORDER BY t.term_id
  `;
}

function relationsSelect() {
  return `
    SELECT JSON_OBJECT(
      'equipment_legacy_id', p.ID,
      'taxonomy', tt.taxonomy,
      'term_legacy_id', t.term_id,
      'slug', t.slug
    ) AS doc
    FROM wp_posts p
    INNER JOIN wp_term_relationships tr ON tr.object_id = p.ID
    INNER JOIN wp_term_taxonomy tt ON tt.term_taxonomy_id = tr.term_taxonomy_id
    INNER JOIN wp_terms t ON t.term_id = tt.term_id
    WHERE p.post_type = 'spetstekhnika'
      AND p.post_status IN ('publish', 'pending')
      AND tt.taxonomy IN ('vid-techniki', 'brand', 'tipy-rabot')
    ORDER BY p.ID, tt.taxonomy, t.term_id
    ${limitClause()}
  `;
}

function postCategoryRelationsSelect() {
  return `
    SELECT JSON_OBJECT(
      'post_legacy_id', p.ID,
      'term_legacy_id', t.term_id
    ) AS doc
    FROM wp_posts p
    INNER JOIN wp_term_relationships tr ON tr.object_id = p.ID
    INNER JOIN wp_term_taxonomy tt ON tt.term_taxonomy_id = tr.term_taxonomy_id
    INNER JOIN wp_terms t ON t.term_id = tt.term_id
    WHERE p.post_type = 'post'
      AND p.post_status IN ('publish', 'pending')
      AND tt.taxonomy = 'category'
    ORDER BY p.ID, t.term_id
    ${limitClause()}
  `;
}

function specsSelect() {
  const keys = [...new Set([...specDefinitions.map(([key]) => key), ...specKeyAliases.keys()])]
    .map((key) => sqlString(key))
    .join(', ');
  return `
    SELECT JSON_OBJECT(
      'equipment_legacy_id', p.ID,
      'key', pm.meta_key,
      'value', pm.meta_value
    ) AS doc
    FROM wp_posts p
    INNER JOIN wp_postmeta pm ON pm.post_id = p.ID
    WHERE p.post_type = 'spetstekhnika'
      AND p.post_status IN ('publish', 'pending')
      AND pm.meta_key IN (${keys})
      AND pm.meta_value IS NOT NULL
      AND pm.meta_value <> ''
    ORDER BY p.ID, pm.meta_key
    ${limitClause()}
  `;
}

async function importCommonPosts(client, table, postType, fallbackPath) {
  const rows = wpJsonRows(commonPostSelect(postType));
  const idByLegacy = new Map();
  let count = 0;
  for (const row of rows) {
    const urlPath = normalizePath(row.permalink, fallbackPath(row));
    if (!dryRun) {
      const id = await upsert(client, table, 'legacy_id', {
        legacy_id: row.legacy_id,
        status: row.status,
        title: row.title || row.slug,
        slug: row.slug || String(row.legacy_id),
        url_path: urlPath,
        body: row.body || null,
        excerpt: row.excerpt || null,
        seo_title: row.seo_title || null,
        meta_description: row.meta_description || null,
        canonical_url: row.canonical_url || null,
        robots: robotDirectives(row),
        wp_created_at: normalizeDate(row.wp_created_at),
        wp_updated_at: normalizeDate(row.wp_updated_at),
      });
      idByLegacy.set(row.legacy_id, id);
    } else {
      idByLegacy.set(row.legacy_id, row.legacy_id);
    }
    count += 1;
  }
  return { count, idByLegacy };
}

async function importTerms(client, table, taxonomy, fallbackPrefix) {
  const rows = wpJsonRows(termSelect(taxonomy));
  const idByLegacy = new Map();
  let sort = 10;
  for (const row of rows) {
    const data = {
      legacy_term_id: row.legacy_term_id,
      legacy_taxonomy_id: row.legacy_taxonomy_id,
      name: row.name,
      slug: row.slug,
      url_path: fallbackPrefix ? normalizePath(row.permalink, `/${fallbackPrefix}/${row.slug}/`) : null,
      description: row.description || null,
      body: row.body || row.description || null,
      seo_title: row.seo_title || null,
      meta_description: row.meta_description || null,
      canonical_url: row.canonical_url || null,
      robots: robotDirectives(row),
      sort,
    };

    if (table === 'equipment_types') {
      const filterKeys = parseFilterKeys(row.filter_keys);
      data.hero_image_legacy_id = parseInteger(row.hero_image_legacy_id);
      data.discount_value = row.discount_value || null;
      data.allow_filters = filterKeys.length ? true : null;
      data.filter_keys = JSON.stringify(filterKeys);
    }

    if (!dryRun) {
      const id = await upsert(client, table, 'legacy_term_id', data);
      idByLegacy.set(row.legacy_term_id, id);
    } else {
      idByLegacy.set(row.legacy_term_id, row.legacy_term_id);
    }
    sort += 10;
  }
  return { count: rows.length, idByLegacy };
}

async function importEquipmentItems(client) {
  const rows = wpJsonRows(equipmentSelect());
  const idByLegacy = new Map();
  const primaryTypeLegacyByEquipmentLegacy = new Map();
  for (const row of rows) {
    const categoryTermLegacyId = parsePositiveInteger(row.category_term_legacy_id);
    if (categoryTermLegacyId) {
      primaryTypeLegacyByEquipmentLegacy.set(row.legacy_id, categoryTermLegacyId);
    }

    if (!dryRun) {
      const id = await upsert(client, 'equipment_items', 'legacy_id', {
        legacy_id: row.legacy_id,
        status: row.status,
        title: row.title || row.slug,
        slug: row.slug || String(row.legacy_id),
        url_path: normalizePath(row.permalink, `/arenda_spetstekhniki/${row.slug}/`),
        body: row.body || null,
        excerpt: row.excerpt || null,
        price_raw: row.price_raw || null,
        price_amount: parsePrice(row.price_raw),
        price_alt: row.price_alt || null,
        hours_per_shift: parseInteger(row.hours_per_shift),
        featured_image_legacy_id: parseInteger(row.featured_image_legacy_id),
        seo_title: row.seo_title || null,
        meta_description: row.meta_description || null,
        canonical_url: row.canonical_url || null,
        robots: robotDirectives(row),
        wp_created_at: normalizeDate(row.wp_created_at),
        wp_updated_at: normalizeDate(row.wp_updated_at),
      });
      idByLegacy.set(row.legacy_id, id);
    } else {
      idByLegacy.set(row.legacy_id, row.legacy_id);
    }
  }
  return { count: rows.length, idByLegacy, primaryTypeLegacyByEquipmentLegacy };
}

async function importSpecDefinitions(client) {
  const ids = new Map();
  let sort = 10;
  for (const [key, label] of specDefinitions) {
    if (!dryRun) {
      const id = await upsert(client, 'equipment_spec_definitions', 'key', {
        key,
        label,
        value_type: 'text',
        filter_enabled: true,
        sort,
      });
      ids.set(key, id);
    } else {
      ids.set(key, key);
    }
    sort += 10;
  }
  return ids;
}

async function importRelations(client, equipmentIds, termIds, options = {}) {
  const rows = wpJsonRows(relationsSelect());
  const equipmentTypeParentByLegacy = options.equipmentTypeParentByLegacy || new Map();
  const primaryTypeLegacyByEquipmentLegacy = options.primaryTypeLegacyByEquipmentLegacy || new Map();
  const linkedEquipmentTypeLegacyByEquipmentLegacy = new Map();

  let baseCount = 0;
  for (const row of rows) {
    const equipmentId = equipmentIds.get(row.equipment_legacy_id);
    if (!equipmentId) continue;

    const config = {
      'vid-techniki': ['equipment_items_equipment_types', 'equipment_item_id', 'equipment_type_id', termIds.equipmentTypes],
      brand: ['equipment_items_brands', 'equipment_item_id', 'brand_id', termIds.brands],
      'tipy-rabot': ['equipment_items_work_types', 'equipment_item_id', 'work_type_id', termIds.workTypes],
    }[row.taxonomy];

    if (!config) continue;
    const [table, leftColumn, rightColumn, idMap] = config;
    const relatedId = idMap.get(row.term_legacy_id);
    if (!relatedId) continue;

    if (row.taxonomy === 'vid-techniki') {
      if (!linkedEquipmentTypeLegacyByEquipmentLegacy.has(row.equipment_legacy_id)) {
        linkedEquipmentTypeLegacyByEquipmentLegacy.set(row.equipment_legacy_id, new Set());
      }
      linkedEquipmentTypeLegacyByEquipmentLegacy.get(row.equipment_legacy_id).add(row.term_legacy_id);
    }

    if (!dryRun) {
      await insertPivot(client, table, leftColumn, equipmentId, rightColumn, relatedId);
    }
    baseCount += 1;
  }

  let primaryAdded = 0;
  let ancestorAdded = 0;

  for (const [equipmentLegacyId, equipmentId] of equipmentIds.entries()) {
    if (!linkedEquipmentTypeLegacyByEquipmentLegacy.has(equipmentLegacyId)) {
      linkedEquipmentTypeLegacyByEquipmentLegacy.set(equipmentLegacyId, new Set());
    }

    const linkedTypes = linkedEquipmentTypeLegacyByEquipmentLegacy.get(equipmentLegacyId);
    const primaryTypeLegacyId = primaryTypeLegacyByEquipmentLegacy.get(equipmentLegacyId);

    if (
      primaryTypeLegacyId
      && termIds.equipmentTypes.has(primaryTypeLegacyId)
      && !linkedTypes.has(primaryTypeLegacyId)
      && isRelatedTermCandidate(primaryTypeLegacyId, linkedTypes, equipmentTypeParentByLegacy)
    ) {
      if (!dryRun) {
        await insertPivot(
          client,
          'equipment_items_equipment_types',
          'equipment_item_id',
          equipmentId,
          'equipment_type_id',
          termIds.equipmentTypes.get(primaryTypeLegacyId),
        );
      }
      linkedTypes.add(primaryTypeLegacyId);
      primaryAdded += 1;
    }

    for (const linkedTypeLegacyId of [...linkedTypes]) {
      for (const ancestorLegacyId of collectAncestorChain(linkedTypeLegacyId, equipmentTypeParentByLegacy)) {
        if (!termIds.equipmentTypes.has(ancestorLegacyId) || linkedTypes.has(ancestorLegacyId)) continue;

        if (!dryRun) {
          await insertPivot(
            client,
            'equipment_items_equipment_types',
            'equipment_item_id',
            equipmentId,
            'equipment_type_id',
            termIds.equipmentTypes.get(ancestorLegacyId),
          );
        }
        linkedTypes.add(ancestorLegacyId);
        ancestorAdded += 1;
      }
    }
  }

  return {
    baseCount,
    primaryAdded,
    ancestorAdded,
    count: baseCount + primaryAdded + ancestorAdded,
  };
}

async function importPostCategoryRelations(client, postIds, categoryIds) {
  const rows = wpJsonRows(postCategoryRelationsSelect());
  let count = 0;
  for (const row of rows) {
    const postId = postIds.get(row.post_legacy_id);
    const categoryId = categoryIds.get(row.term_legacy_id);
    if (!postId || !categoryId) continue;

    if (!dryRun) {
      await insertPivot(client, 'posts_categories', 'post_id', postId, 'category_id', categoryId);
    }
    count += 1;
  }
  return count;
}

async function importSpecs(client, equipmentIds, specDefinitionIds) {
  const rows = wpJsonRows(specsSelect());
  let count = 0;
  for (const row of rows) {
    const normalizedKey = specKeyAliases.get(row.key) || row.key;
    const equipmentId = equipmentIds.get(row.equipment_legacy_id);
    const definitionId = specDefinitionIds.get(normalizedKey);
    if (!equipmentId || !definitionId) continue;

    if (!dryRun) {
      await upsert(client, 'equipment_specs', 'equipment_item_id, key', {
        equipment_item_id: equipmentId,
        spec_definition_id: definitionId,
        key: normalizedKey,
        label: specLabels.get(normalizedKey) || normalizedKey,
        value: String(row.value),
        sort: specSort.get(normalizedKey) || 500,
      });
    }
    count += 1;
  }
  return count;
}

async function main() {
  console.log(`WordPress source: ${wp.container}/${wp.database}`);
  console.log(`Postgres target: ${databaseUrl.replace(/:[^:@/]+@/, ':***@')}`);
  if (dryRun) console.log('Dry run: no writes will be made.');
  if (rowLimit > 0) console.log(`Row limit per query: ${rowLimit}`);

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  const runResult = dryRun
    ? { rows: [{ id: null }] }
    : await client.query('INSERT INTO migration_runs (source, notes) VALUES ($1, $2) RETURNING id', [
        'wordpress',
        'Initial Directus/Postgres import from local WordPress DB',
      ]);
  const runId = runResult.rows[0].id;

  const summary = {};

  try {
    const equipmentTypeParentByLegacy = new Map(
      wpJsonRows(termHierarchySelect('vid-techniki'))
        .map((row) => [parsePositiveInteger(row.legacy_term_id), parsePositiveInteger(row.parent_legacy_term_id)])
        .filter(([termLegacyId]) => termLegacyId),
    );

    const termIds = {};
    const hasCategories = (await tableExists(client, 'categories')) && (await tableExists(client, 'posts_categories'));
    const equipmentTypeResult = await importTerms(client, 'equipment_types', 'vid-techniki', 'arenda');
    termIds.equipmentTypes = equipmentTypeResult.idByLegacy;
    summary.equipment_types = equipmentTypeResult.count;

    const brandResult = await importTerms(client, 'brands', 'brand', 'brand');
    termIds.brands = brandResult.idByLegacy;
    summary.brands = brandResult.count;

    const workTypeResult = await importTerms(client, 'work_types', 'tipy-rabot', 'tipy-rabot');
    termIds.workTypes = workTypeResult.idByLegacy;
    summary.work_types = workTypeResult.count;

    if (hasCategories) {
      const categoryResult = await importTerms(client, 'categories', 'category', 'category');
      termIds.categories = categoryResult.idByLegacy;
      summary.categories = categoryResult.count;
    } else {
      termIds.categories = new Map();
      summary.categories = 0;
    }

    const equipmentResult = await importEquipmentItems(client);
    summary.equipment_items = equipmentResult.count;

    const pagesResult = await importCommonPosts(client, 'pages', 'page', (row) => (row.legacy_id === 57 ? '/' : `/${row.slug}/`));
    summary.pages = pagesResult.count;

    const postsResult = await importCommonPosts(client, 'posts', 'post', (row) => `/${row.slug}/`);
    summary.posts = postsResult.count;

    const reviewsResult = await importCommonPosts(client, 'reviews', 'reviews', (row) => `/reviews/${row.slug}/`);
    summary.reviews = reviewsResult.count;

    const specDefinitionIds = await importSpecDefinitions(client);
    summary.equipment_spec_definitions = specDefinitions.length;
    const relationsResult = await importRelations(client, equipmentResult.idByLegacy, termIds, {
      equipmentTypeParentByLegacy,
      primaryTypeLegacyByEquipmentLegacy: equipmentResult.primaryTypeLegacyByEquipmentLegacy,
    });
    summary.equipment_relations = relationsResult.count;
    summary.equipment_relations_base = relationsResult.baseCount;
    summary.equipment_relations_primary_category = relationsResult.primaryAdded;
    summary.equipment_relations_hierarchy = relationsResult.ancestorAdded;
    summary.post_category_relations = hasCategories
      ? await importPostCategoryRelations(client, postsResult.idByLegacy, termIds.categories)
      : 0;
    summary.equipment_specs = await importSpecs(client, equipmentResult.idByLegacy, specDefinitionIds);

    if (!dryRun) {
      await client.query('UPDATE migration_runs SET finished_at = NOW(), summary = $1 WHERE id = $2', [summary, runId]);
    }

    console.log('Import summary:');
    for (const [key, value] of Object.entries(summary)) {
      console.log(`- ${key}: ${value}`);
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});