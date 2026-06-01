import { execFileSync } from 'node:child_process';
import process from 'node:process';
import pg from 'pg';
import { getDatabaseUrl, getWpConfig, loadMigrationEnv } from './env.mjs';

loadMigrationEnv();

const { Client } = pg;

const wp = {
  ...getWpConfig(),
};

const databaseUrl = getDatabaseUrl();

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
    { encoding: 'utf8', maxBuffer: 1024 * 1024 * 20 },
  );

  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function parseFilterKeys(value) {
  if (!value) return [];
  return [...String(value).matchAll(/s:\d+:"([^"]+)"/g)].map((match) => match[1]);
}

function filterRows() {
  return wpJsonRows(`
    SELECT JSON_OBJECT(
      'legacy_term_id', t.term_id,
      'slug', t.slug,
      'filter_keys', tm.meta_value
    ) AS doc
    FROM wp_terms t
    INNER JOIN wp_term_taxonomy tt ON tt.term_id = t.term_id
    INNER JOIN wp_termmeta tm ON tm.term_id = t.term_id AND tm.meta_key = 'allowfilters'
    WHERE tt.taxonomy = 'vid-techniki'
      AND tm.meta_value IS NOT NULL
      AND tm.meta_value <> ''
    ORDER BY t.term_id
  `);
}

async function main() {
  const rows = filterRows().map((row) => ({ ...row, filter_keys: parseFilterKeys(row.filter_keys) }));
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await client.query("ALTER TABLE equipment_types ADD COLUMN IF NOT EXISTS filter_keys JSONB NOT NULL DEFAULT '[]'::JSONB");
    await client.query("UPDATE equipment_types SET filter_keys = '[]'::JSONB, allow_filters = NULL");

    let updated = 0;
    for (const row of rows) {
      const result = await client.query(
        `
          UPDATE equipment_types
          SET filter_keys = $2::jsonb,
              allow_filters = CASE WHEN jsonb_array_length($2::jsonb) > 0 THEN TRUE ELSE NULL END
          WHERE legacy_term_id = $1
        `,
        [row.legacy_term_id, JSON.stringify(row.filter_keys)],
      );
      updated += result.rowCount;
    }

    console.log(`WP filter rows: ${rows.length}`);
    console.log(`Updated equipment_types: ${updated}`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
