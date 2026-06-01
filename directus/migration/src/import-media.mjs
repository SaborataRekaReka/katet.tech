import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import pg from 'pg';
import {
  getDatabaseUrl,
  getDirectusConfig,
  getUploadsDir,
  getWpConfig,
  loadMigrationEnv,
} from './env.mjs';

loadMigrationEnv();

const { Client } = pg;

const dryRun = process.argv.includes('--dry-run');
const importAll = process.argv.includes('--all');
const importInline = process.argv.includes('--inline');
const limitArgument = process.argv.find((argument) => argument.startsWith('--limit='));
const rowLimit = limitArgument ? Number.parseInt(limitArgument.split('=')[1], 10) : 0;

const wp = {
  ...getWpConfig(),
};

const databaseUrl = getDatabaseUrl();
const directus = getDirectusConfig();
const directusUrl = (directus.url || '').replace(/\/$/, '');
const directusEmail = directus.email;
const directusPassword = directus.password;
const uploadsDir = getUploadsDir();

const cp866BoxChars = [
  0x2591, 0x2592, 0x2593, 0x2502, 0x2524, 0x2561, 0x2562, 0x2556,
  0x2555, 0x2563, 0x2551, 0x2557, 0x255d, 0x255c, 0x255b, 0x2510,
  0x2514, 0x2534, 0x252c, 0x251c, 0x2500, 0x253c, 0x255e, 0x255f,
  0x255a, 0x2554, 0x2569, 0x2566, 0x2560, 0x2550, 0x256c, 0x2567,
  0x2568, 0x2564, 0x2565, 0x2559, 0x2558, 0x2552, 0x2553, 0x256b,
  0x256a, 0x2518, 0x250c, 0x2588, 0x2584, 0x258c, 0x2590, 0x2580,
];

function cp866CharFromByte(byte) {
  if (byte < 0x80) return String.fromCharCode(byte);
  if (byte >= 0x80 && byte <= 0x9f) return String.fromCharCode(0x0410 + byte - 0x80);
  if (byte >= 0xa0 && byte <= 0xaf) return String.fromCharCode(0x0430 + byte - 0xa0);
  if (byte >= 0xb0 && byte <= 0xdf) return String.fromCharCode(cp866BoxChars[byte - 0xb0]);
  if (byte >= 0xe0 && byte <= 0xef) return String.fromCharCode(0x0440 + byte - 0xe0);
  const special = {
    0xf0: 0x0401,
    0xf1: 0x0451,
    0xf2: 0x0404,
    0xf3: 0x0454,
    0xf4: 0x0407,
    0xf5: 0x0457,
    0xf6: 0x040e,
    0xf7: 0x045e,
    0xf8: 0x00b0,
    0xf9: 0x2219,
    0xfa: 0x00b7,
    0xfb: 0x221a,
    0xfc: 0x2116,
    0xfd: 0x00a4,
    0xfe: 0x25a0,
    0xff: 0x00a0,
  };
  return String.fromCharCode(special[byte] || byte);
}

function cp866MojibakeFromUtf8(value) {
  return [...Buffer.from(value, 'utf8')].map(cp866CharFromByte).join('');
}

function resolveUploadPath(relativePath) {
  const absolutePath = path.join(uploadsDir, relativePath);
  if (existsSync(absolutePath)) return absolutePath;

  const directory = path.dirname(relativePath);
  const basename = path.basename(relativePath);
  const mojibakeBasename = cp866MojibakeFromUtf8(basename);
  if (mojibakeBasename === basename) return null;

  const mojibakePath = path.join(uploadsDir, directory, mojibakeBasename);
  return existsSync(mojibakePath) ? mojibakePath : null;
}

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

function normalizeUploadPath(value) {
  if (!value) return null;
  let normalized = String(value).trim().replaceAll('\\', '/');
  const uploadsMarker = '/wp-content/uploads/';
  if (/^https?:\/\//i.test(normalized)) {
    try {
      const url = new URL(normalized);
      normalized = decodeURIComponent(url.pathname);
    } catch {
      normalized = decodeURIComponent(normalized);
    }
  }
  const markerIndex = normalized.indexOf(uploadsMarker);
  if (markerIndex !== -1) normalized = normalized.slice(markerIndex + uploadsMarker.length);
  normalized = normalized.replace(/^\/+/, '');
  try {
    normalized = decodeURIComponent(normalized);
  } catch {
    // Keep the original path if a legacy URL contains malformed escaping.
  }
  return normalized || null;
}

function extractUploadPaths(value) {
  if (!value) return [];
  const text = String(value)
    .replaceAll('\\/', '/')
    .replaceAll('&quot;', '"')
    .replaceAll('&#039;', "'")
    .replaceAll('&amp;', '&');
  const paths = new Set();
  const regex = /(?:https?:\/\/[^\s"'()<>]+)?\/wp-content\/uploads\/([^\s"'()<>]+?)(?=[?#\s"'()<>]|$)/gi;
  let match;
  while ((match = regex.exec(text))) {
    const withoutQuery = match[1].split('?')[0].split('#')[0].replace(/[.,;]+$/, '');
    const normalized = normalizeUploadPath(withoutQuery);
    if (normalized && /\.(?:jpe?g|png|webp|gif|svg|pdf)$/i.test(normalized)) {
      paths.add(normalized);
    }
  }
  return [...paths];
}

function sourceUrlFromPath(relativePath) {
  return relativePath ? `http://localhost:8081/wp-content/uploads/${relativePath}` : null;
}

function guessMime(relativePath, fallback) {
  if (fallback) return fallback;
  const extension = path.extname(relativePath).toLowerCase();
  const types = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
  };
  return types[extension] || 'application/octet-stream';
}

function truncate(value, length = 255) {
  if (!value) return null;
  const stringValue = String(value);
  return stringValue.length > length ? stringValue.slice(0, length) : stringValue;
}

function targetAttachmentIdsSelect() {
  if (importAll) {
    return `
      SELECT JSON_OBJECT('legacy_id', p.ID) AS doc
      FROM wp_posts p
      LEFT JOIN wp_postmeta file ON file.post_id = p.ID AND file.meta_key = '_wp_attached_file'
      WHERE p.post_type = 'attachment'
        AND p.post_mime_type LIKE 'image/%'
        AND file.meta_value IS NOT NULL
      ORDER BY p.ID
      ${limitClause()}
    `;
  }

  return `
    SELECT JSON_OBJECT('legacy_id', legacy_id) AS doc
    FROM (
      SELECT DISTINCT CAST(pm.meta_value AS UNSIGNED) AS legacy_id
      FROM wp_postmeta pm
      INNER JOIN wp_posts owner ON owner.ID = pm.post_id
      WHERE pm.meta_key = '_thumbnail_id'
        AND pm.meta_value REGEXP '^[0-9]+$'
        AND owner.post_type IN ('spetstekhnika', 'post', 'page', 'reviews')
        AND owner.post_status IN ('publish', 'pending')

      UNION

      SELECT DISTINCT CAST(tm.meta_value AS UNSIGNED) AS legacy_id
      FROM wp_termmeta tm
      INNER JOIN wp_term_taxonomy tt ON tt.term_id = tm.term_id
      WHERE tm.meta_key = 'thumbnail_id'
        AND tm.meta_value REGEXP '^[0-9]+$'
        AND tt.taxonomy = 'vid-techniki'

      UNION

      SELECT DISTINCT CAST(pm.meta_value AS UNSIGNED) AS legacy_id
      FROM wp_postmeta pm
      INNER JOIN wp_posts owner ON owner.ID = pm.post_id
      WHERE pm.meta_key = 'photo'
        AND pm.meta_value REGEXP '^[0-9]+$'
        AND owner.post_type = 'reviews'
        AND owner.post_status IN ('publish', 'pending')
    ) target_ids
    WHERE legacy_id IS NOT NULL AND legacy_id > 0
    ORDER BY legacy_id
    ${limitClause()}
  `;
}

function termImageSourcesSelect() {
  return `
    SELECT JSON_OBJECT(
      'legacy_term_id', t.term_id,
      'image_url', tm.meta_value,
      'source_path', tm.meta_value
    ) AS doc
    FROM wp_terms t
    INNER JOIN wp_term_taxonomy tt ON tt.term_id = t.term_id
    INNER JOIN wp_termmeta tm ON tm.term_id = t.term_id AND tm.meta_key = 'izobrazhenie'
    WHERE tt.taxonomy = 'vid-techniki'
      AND tm.meta_value LIKE '%/wp-content/uploads/%'
    ORDER BY t.term_id
  `;
}

function inlineMediaSourcesSelect() {
  return `
    SELECT JSON_OBJECT(
      'source', 'post_content',
      'owner_id', p.ID,
      'content', p.post_content
    ) AS doc
    FROM wp_posts p
    WHERE p.post_status IN ('publish', 'pending')
      AND p.post_type IN ('page', 'post', 'spetstekhnika', 'reviews', 'elementor_library')
      AND p.post_content LIKE '%/wp-content/uploads/%'

    UNION ALL

    SELECT JSON_OBJECT(
      'source', 'term_description',
      'owner_id', tt.term_taxonomy_id,
      'content', tt.description
    ) AS doc
    FROM wp_term_taxonomy tt
    WHERE tt.taxonomy IN ('vid-techniki', 'brand', 'tipy-rabot')
      AND tt.description LIKE '%/wp-content/uploads/%'

    UNION ALL

    SELECT JSON_OBJECT(
      'source', 'termmeta',
      'owner_id', tm.term_id,
      'content', tm.meta_value
    ) AS doc
    FROM wp_termmeta tm
    INNER JOIN wp_term_taxonomy tt ON tt.term_id = tm.term_id
    WHERE tt.taxonomy IN ('vid-techniki', 'brand', 'tipy-rabot')
      AND tm.meta_value LIKE '%/wp-content/uploads/%'
  `;
}

function postThumbnailSelect() {
  return `
    SELECT JSON_OBJECT(
      'legacy_id', p.ID,
      'post_type', p.post_type,
      'thumbnail_id', CAST(pm.meta_value AS UNSIGNED)
    ) AS doc
    FROM wp_posts p
    INNER JOIN wp_postmeta pm ON pm.post_id = p.ID AND pm.meta_key = '_thumbnail_id'
    WHERE p.post_type IN ('page', 'post', 'reviews')
      AND p.post_status IN ('publish', 'pending')
      AND pm.meta_value REGEXP '^[0-9]+$'
    ORDER BY p.ID
  `;
}

function reviewPhotoSelect() {
  return `
    SELECT JSON_OBJECT(
      'legacy_id', p.ID,
      'photo_id', CAST(pm.meta_value AS UNSIGNED)
    ) AS doc
    FROM wp_posts p
    INNER JOIN wp_postmeta pm ON pm.post_id = p.ID AND pm.meta_key = 'photo'
    WHERE p.post_type = 'reviews'
      AND p.post_status IN ('publish', 'pending')
      AND pm.meta_value REGEXP '^[0-9]+$'
    ORDER BY p.ID
  `;
}

function termThumbnailSelect() {
  return `
    SELECT JSON_OBJECT(
      'legacy_term_id', t.term_id,
      'thumbnail_id', CAST(tm.meta_value AS UNSIGNED)
    ) AS doc
    FROM wp_terms t
    INNER JOIN wp_term_taxonomy tt ON tt.term_id = t.term_id
    INNER JOIN wp_termmeta tm ON tm.term_id = t.term_id AND tm.meta_key = 'thumbnail_id'
    WHERE tt.taxonomy = 'vid-techniki'
      AND tm.meta_value REGEXP '^[0-9]+$'
    ORDER BY t.term_id
  `;
}

function attachmentsSelect(legacyIds, sourcePaths) {
  const idList = legacyIds.length ? legacyIds.map((id) => Number(id)).filter(Number.isFinite).join(', ') : '0';
  const pathList = sourcePaths.length ? sourcePaths.map(sqlString).join(', ') : "''";
  return `
    SELECT JSON_OBJECT(
      'legacy_id', p.ID,
      'title', p.post_title,
      'caption', p.post_excerpt,
      'description', p.post_content,
      'mime_type', p.post_mime_type,
      'guid', p.guid,
      'source_path', file.meta_value,
      'alt_text', alt.meta_value
    ) AS doc
    FROM wp_posts p
    INNER JOIN wp_postmeta file ON file.post_id = p.ID AND file.meta_key = '_wp_attached_file'
    LEFT JOIN wp_postmeta alt ON alt.post_id = p.ID AND alt.meta_key = '_wp_attachment_image_alt'
    WHERE p.post_type = 'attachment'
      AND (p.ID IN (${idList}) OR file.meta_value IN (${pathList}))
    ORDER BY p.ID
  `;
}

async function directusLogin() {
  const response = await fetch(`${directusUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: directusEmail, password: directusPassword }),
  });
  if (!response.ok) {
    throw new Error(`Directus login failed: ${response.status} ${await response.text()}`);
  }
  const payload = await response.json();
  return payload.data.access_token;
}

async function uploadToDirectus(token, asset, absolutePath) {
  const fileBuffer = await readFile(absolutePath);
  const mimeType = guessMime(asset.source_path, asset.mime_type);
  const blob = new Blob([fileBuffer], { type: mimeType });
  const form = new FormData();
  form.append('file', blob, path.basename(asset.source_path));
  form.append('title', truncate(asset.title || path.basename(asset.source_path, path.extname(asset.source_path))) || path.basename(asset.source_path));
  if (asset.alt_text) form.append('description', truncate(asset.alt_text, 1000));

  const response = await fetch(`${directusUrl}/files`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  if (!response.ok) {
    throw new Error(`Directus upload failed for ${asset.source_path}: ${response.status} ${await response.text()}`);
  }

  const payload = await response.json();
  return payload.data.id;
}

async function existingMedia(client) {
  const result = await client.query('SELECT legacy_id, source_path, directus_file_id FROM media_assets');
  const byLegacyId = new Map();
  const bySourcePath = new Map();
  for (const row of result.rows) {
    if (row.legacy_id !== null) byLegacyId.set(Number(row.legacy_id), row);
    bySourcePath.set(row.source_path, row);
  }
  return { byLegacyId, bySourcePath };
}

async function upsertMediaAsset(client, asset, directusFileId, filesize) {
  await client.query(
    `
      INSERT INTO media_assets (
        legacy_id, directus_file_id, source_path, source_url, title, alt_text, caption, description, mime_type, filesize, imported_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      ON CONFLICT (source_path) DO UPDATE SET
        legacy_id = COALESCE(EXCLUDED.legacy_id, media_assets.legacy_id),
        directus_file_id = EXCLUDED.directus_file_id,
        source_url = EXCLUDED.source_url,
        title = EXCLUDED.title,
        alt_text = EXCLUDED.alt_text,
        caption = EXCLUDED.caption,
        description = EXCLUDED.description,
        mime_type = EXCLUDED.mime_type,
        filesize = EXCLUDED.filesize,
        imported_at = NOW()
    `,
    [
      asset.legacy_id || null,
      directusFileId,
      asset.source_path,
      asset.source_url || sourceUrlFromPath(asset.source_path),
      truncate(asset.title),
      asset.alt_text || null,
      asset.caption || null,
      asset.description || null,
      guessMime(asset.source_path, asset.mime_type),
      filesize,
    ],
  );
}

async function backfillFeaturedIds(client, postThumbnails, reviewPhotos, termThumbnails, termImages) {
  const tableByType = { page: 'pages', post: 'posts', reviews: 'reviews' };
  for (const item of postThumbnails) {
    const table = tableByType[item.post_type];
    if (!table) continue;
    await client.query(`UPDATE ${table} SET featured_image_legacy_id = $1 WHERE legacy_id = $2`, [item.thumbnail_id, item.legacy_id]);
  }

  for (const item of reviewPhotos) {
    await client.query('UPDATE reviews SET photo_image_legacy_id = $1 WHERE legacy_id = $2', [item.photo_id, item.legacy_id]);
  }

  for (const item of termThumbnails) {
    await client.query('UPDATE equipment_types SET hero_image_legacy_id = $1 WHERE legacy_term_id = $2', [item.thumbnail_id, item.legacy_term_id]);
  }

  for (const item of termImages) {
    await client.query(
      'UPDATE equipment_types SET hero_image_source_url = $1, hero_image_source_path = $2 WHERE legacy_term_id = $3',
      [item.image_url, normalizeUploadPath(item.source_path), item.legacy_term_id],
    );
  }
}

async function linkImportedMedia(client) {
  await client.query(`
    UPDATE equipment_items target
    SET featured_file_id = media.directus_file_id
    FROM media_assets media
    WHERE target.featured_image_legacy_id = media.legacy_id
      AND media.directus_file_id IS NOT NULL
  `);

  for (const table of ['pages', 'posts', 'reviews']) {
    await client.query(`
      UPDATE ${table} target
      SET featured_file_id = media.directus_file_id
      FROM media_assets media
      WHERE target.featured_image_legacy_id = media.legacy_id
        AND media.directus_file_id IS NOT NULL
    `);
  }

  await client.query(`
    UPDATE equipment_types target
    SET hero_file_id = media.directus_file_id
    FROM media_assets media
    WHERE target.hero_image_legacy_id = media.legacy_id
      AND media.directus_file_id IS NOT NULL
  `);

  await client.query(`
    UPDATE equipment_types target
    SET hero_file_id = media.directus_file_id
    FROM media_assets media
    WHERE target.hero_image_source_path = media.source_path
      AND media.directus_file_id IS NOT NULL
  `);

  await client.query(`
    UPDATE reviews target
    SET photo_file_id = media.directus_file_id
    FROM media_assets media
    WHERE target.photo_image_legacy_id = media.legacy_id
      AND media.directus_file_id IS NOT NULL
  `);
}

async function countLinkedMedia(client) {
  const result = await client.query(`
    SELECT 'equipment_items.featured_file_id' AS target, COUNT(*)::int AS count FROM equipment_items WHERE featured_file_id IS NOT NULL
    UNION ALL SELECT 'equipment_types.hero_file_id', COUNT(*)::int FROM equipment_types WHERE hero_file_id IS NOT NULL
    UNION ALL SELECT 'posts.featured_file_id', COUNT(*)::int FROM posts WHERE featured_file_id IS NOT NULL
    UNION ALL SELECT 'reviews.featured_file_id', COUNT(*)::int FROM reviews WHERE featured_file_id IS NOT NULL
    UNION ALL SELECT 'reviews.photo_file_id', COUNT(*)::int FROM reviews WHERE photo_file_id IS NOT NULL
    UNION ALL SELECT 'pages.featured_file_id', COUNT(*)::int FROM pages WHERE featured_file_id IS NOT NULL
    ORDER BY target
  `);
  return result.rows;
}

async function main() {
  console.log(`WordPress source: ${wp.container}/${wp.database}`);
  console.log(`Directus target: ${directusUrl}`);
  console.log(`Uploads directory: ${uploadsDir}`);
  if (dryRun) console.log('Dry run: no uploads or database writes will be made.');
  if (importAll) console.log('Mode: all image attachments.');
  if (importInline) console.log('Mode: include inline uploads referenced from post content and taxonomy meta.');
  if (rowLimit > 0) console.log(`Row limit: ${rowLimit}`);

  const targetIds = wpJsonRows(targetAttachmentIdsSelect()).map((row) => Number(row.legacy_id)).filter(Number.isFinite);
  const termImages = wpJsonRows(termImageSourcesSelect()).map((row) => ({
    ...row,
    source_path: normalizeUploadPath(row.source_path || row.image_url),
  })).filter((row) => row.source_path);
  const termSourcePaths = [...new Set(termImages.map((row) => row.source_path))];
  const inlineSourceRows = importInline ? wpJsonRows(inlineMediaSourcesSelect()) : [];
  const inlineSourcePaths = [...new Set(inlineSourceRows.flatMap((row) => extractUploadPaths(row.content)))];
  const explicitSourcePaths = [...new Set([...termSourcePaths, ...inlineSourcePaths])];
  const attachments = wpJsonRows(attachmentsSelect(targetIds, explicitSourcePaths)).map((row) => ({
    ...row,
    source_path: normalizeUploadPath(row.source_path),
    source_url: row.guid || sourceUrlFromPath(normalizeUploadPath(row.source_path)),
  })).filter((row) => row.source_path);

  const assetsByPath = new Map();
  for (const attachment of attachments) assetsByPath.set(attachment.source_path, attachment);
  for (const termImage of termImages) {
    if (!assetsByPath.has(termImage.source_path)) {
      assetsByPath.set(termImage.source_path, {
        legacy_id: null,
        title: path.basename(termImage.source_path, path.extname(termImage.source_path)),
        caption: null,
        description: null,
        mime_type: null,
        source_path: termImage.source_path,
        source_url: termImage.image_url,
        alt_text: null,
      });
    }
  }
  for (const sourcePath of inlineSourcePaths) {
    if (!assetsByPath.has(sourcePath)) {
      assetsByPath.set(sourcePath, {
        legacy_id: null,
        title: path.basename(sourcePath, path.extname(sourcePath)),
        caption: null,
        description: null,
        mime_type: null,
        source_path: sourcePath,
        source_url: sourceUrlFromPath(sourcePath),
        alt_text: null,
      });
    }
  }

  const assets = [...assetsByPath.values()];
  const postThumbnails = wpJsonRows(postThumbnailSelect());
  const reviewPhotos = wpJsonRows(reviewPhotoSelect());
  const termThumbnails = wpJsonRows(termThumbnailSelect());

  console.log(`Target attachment ids: ${targetIds.length}`);
  console.log(`Term image paths: ${termSourcePaths.length}`);
  if (importInline) console.log(`Inline media paths: ${inlineSourcePaths.length}`);
  console.log(`Resolved files to import: ${assets.length}`);

  if (dryRun) {
    let found = 0;
    let missing = 0;
    const missingPaths = [];
    for (const asset of assets) {
      if (resolveUploadPath(asset.source_path)) found += 1;
      else {
        missing += 1;
        missingPaths.push(asset.source_path);
      }
    }
    console.log(`Local files found: ${found}`);
    console.log(`Local files missing: ${missing}`);
    for (const missingPath of missingPaths.slice(0, 20)) console.log(`Missing file: ${missingPath}`);
    return;
  }

  const token = await directusLogin();
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  const summary = {
    uploaded: 0,
    skipped_existing: 0,
    missing: 0,
    failed: 0,
  };

  try {
    await backfillFeaturedIds(client, postThumbnails, reviewPhotos, termThumbnails, termImages);
    const existing = await existingMedia(client);
    for (const asset of assets) {
      const absolutePath = resolveUploadPath(asset.source_path);
      if (!absolutePath) {
        console.warn(`Missing file: ${asset.source_path}`);
        summary.missing += 1;
        continue;
      }

      const existingRow = (asset.legacy_id ? existing.byLegacyId.get(Number(asset.legacy_id)) : null) || existing.bySourcePath.get(asset.source_path);
      if (existingRow?.directus_file_id) {
        summary.skipped_existing += 1;
        continue;
      }

      try {
        const fileStat = await stat(absolutePath);
        const directusFileId = await uploadToDirectus(token, asset, absolutePath);
        await upsertMediaAsset(client, asset, directusFileId, fileStat.size);
        existing.bySourcePath.set(asset.source_path, { ...asset, directus_file_id: directusFileId });
        if (asset.legacy_id) existing.byLegacyId.set(Number(asset.legacy_id), { ...asset, directus_file_id: directusFileId });
        summary.uploaded += 1;
      } catch (error) {
        summary.failed += 1;
        console.error(error.message);
      }
    }

    await linkImportedMedia(client);
    const linked = await countLinkedMedia(client);
    console.log('Media import summary:');
    for (const [key, value] of Object.entries(summary)) console.log(`- ${key}: ${value}`);
    console.log('Linked media:');
    for (const row of linked) console.log(`- ${row.target}: ${row.count}`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});