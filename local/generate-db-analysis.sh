#!/bin/sh
set -eu

OUT=/tmp/katet-db-analysis
MYSQL="mariadb -uroot -pkatet_root_password --default-character-set=utf8mb4 --batch --raw katet_local"

rm -rf "$OUT"
mkdir -p "$OUT"

$MYSQL > "$OUT/post-type-counts.tsv" <<'SQL'
SELECT post_type, post_status, COUNT(*) AS count
FROM wp_posts
GROUP BY post_type, post_status
ORDER BY post_type, post_status;
SQL

$MYSQL > "$OUT/taxonomy-counts.tsv" <<'SQL'
SELECT tt.taxonomy, COUNT(*) AS terms, SUM(tt.count) AS object_refs
FROM wp_term_taxonomy tt
GROUP BY tt.taxonomy
ORDER BY tt.taxonomy;
SQL

$MYSQL > "$OUT/key-taxonomy-terms.tsv" <<'SQL'
SELECT tt.taxonomy, t.term_id, t.slug, t.name, tt.count
FROM wp_terms t
JOIN wp_term_taxonomy tt ON tt.term_id = t.term_id
WHERE tt.taxonomy IN ('brand', 'vid-techniki', 'tipy-rabot', 'category', 'zapros')
ORDER BY tt.taxonomy, t.slug;
SQL

$MYSQL > "$OUT/yoast-tables.tsv" <<'SQL'
SELECT TABLE_NAME
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'katet_local'
  AND TABLE_NAME LIKE 'wp_yoast%'
ORDER BY TABLE_NAME;
SQL

$MYSQL > "$OUT/postmeta-key-counts.tsv" <<'SQL'
SELECT p.post_type, pm.meta_key, COUNT(*) AS count
FROM wp_postmeta pm
JOIN wp_posts p ON p.ID = pm.post_id
WHERE p.post_type IN ('spetstekhnika', 'page', 'post', 'reviews', 'elementor_library')
GROUP BY p.post_type, pm.meta_key
HAVING count >= 5
ORDER BY p.post_type, count DESC, pm.meta_key
LIMIT 500;
SQL

$MYSQL > "$OUT/builder-objects.tsv" <<'SQL'
SELECT ID, post_type, post_title, post_name, post_status, post_parent
FROM wp_posts
WHERE post_type IN ('acf-field-group', 'acf-field', 'jet-engine', 'jet-form-builder', 'jet-smart-filters', 'elementor_library')
ORDER BY post_type, post_title;
SQL

$MYSQL > "$OUT/wp-options-core.tsv" <<'SQL'
SELECT option_name, option_value
FROM wp_options
WHERE option_name IN ('siteurl', 'home', 'blogname', 'blogdescription', 'permalink_structure', 'template', 'stylesheet', 'active_plugins')
ORDER BY option_name;
SQL

$MYSQL > "$OUT/yoast-indexable-summary.tsv" <<'SQL'
SELECT object_type,
       object_sub_type,
       COUNT(*) AS count,
       SUM(CASE WHEN title IS NULL OR title = '' THEN 1 ELSE 0 END) AS empty_title,
       SUM(CASE WHEN description IS NULL OR description = '' THEN 1 ELSE 0 END) AS empty_description
FROM wp_yoast_indexable
GROUP BY object_type, object_sub_type
ORDER BY object_type, object_sub_type;
SQL

$MYSQL > "$OUT/yoast-indexable-columns.tsv" <<'SQL'
DESCRIBE wp_yoast_indexable;
SQL

$MYSQL > "$OUT/termmeta-key-counts.tsv" <<'SQL'
SELECT tt.taxonomy, tm.meta_key, COUNT(*) AS count
FROM wp_termmeta tm
JOIN wp_term_taxonomy tt ON tt.term_id = tm.term_id
WHERE tt.taxonomy IN ('brand', 'vid-techniki', 'tipy-rabot', 'category', 'zapros')
GROUP BY tt.taxonomy, tm.meta_key
ORDER BY tt.taxonomy, count DESC, tm.meta_key;
SQL

$MYSQL > "$OUT/equipment-samples.tsv" <<'SQL'
SELECT p.ID,
       p.post_title,
       p.post_name,
       p.post_status,
       MAX(CASE WHEN pm.meta_key = 'tsena' THEN pm.meta_value END) AS tsena,
       MAX(CASE WHEN pm.meta_key = 'tsena_copy' THEN pm.meta_value END) AS tsena_copy,
       MAX(CASE WHEN pm.meta_key = 'chasov_v_smene' THEN pm.meta_value END) AS chasov_v_smene,
       MAX(CASE WHEN pm.meta_key = 'gruzopodemnost' THEN pm.meta_value END) AS gruzopodemnost,
       MAX(CASE WHEN pm.meta_key = 'dlina-strely' THEN pm.meta_value END) AS dlina_strely,
       MAX(CASE WHEN pm.meta_key = 'rabochaia-vysota' THEN pm.meta_value END) AS rabochaia_vysota,
       MAX(CASE WHEN pm.meta_key = '_yoast_wpseo_metadesc' THEN pm.meta_value END) AS meta_description
FROM wp_posts p
LEFT JOIN wp_postmeta pm ON pm.post_id = p.ID
WHERE p.post_type = 'spetstekhnika'
GROUP BY p.ID, p.post_title, p.post_name, p.post_status
ORDER BY p.ID
LIMIT 40;
SQL

$MYSQL > "$OUT/equipment-terms.tsv" <<'SQL'
SELECT p.ID,
       p.post_title,
       tt.taxonomy,
       GROUP_CONCAT(t.slug ORDER BY t.slug SEPARATOR ',') AS term_slugs,
       GROUP_CONCAT(t.name ORDER BY t.slug SEPARATOR ' | ') AS term_names
FROM wp_posts p
JOIN wp_term_relationships tr ON tr.object_id = p.ID
JOIN wp_term_taxonomy tt ON tt.term_taxonomy_id = tr.term_taxonomy_id
JOIN wp_terms t ON t.term_id = tt.term_id
WHERE p.post_type = 'spetstekhnika'
  AND tt.taxonomy IN ('brand', 'vid-techniki', 'tipy-rabot', 'zapros')
GROUP BY p.ID, p.post_title, tt.taxonomy
ORDER BY p.ID, tt.taxonomy;
SQL

$MYSQL > "$OUT/yoast-term-seo.tsv" <<'SQL'
SELECT object_sub_type,
       permalink,
       title,
       description,
       breadcrumb_title
FROM wp_yoast_indexable
WHERE object_type = 'term'
  AND object_sub_type IN ('brand', 'vid-techniki', 'tipy-rabot', 'category', 'zapros')
ORDER BY object_sub_type, permalink;
SQL

$MYSQL > "$OUT/yoast-url-map.tsv" <<'SQL'
SELECT object_type,
     COALESCE(object_sub_type, '') AS object_sub_type,
     COALESCE(object_id, '') AS object_id,
     REPLACE(REPLACE(REPLACE(REPLACE(permalink, 'https://katet.tech', ''), 'http://katet.tech', ''), 'http://localhost:8081', ''), 'https://localhost:8081', '') AS path,
     title,
     description
FROM wp_yoast_indexable
WHERE permalink IS NOT NULL
  AND permalink <> ''
ORDER BY object_type, object_sub_type, path;
SQL

find "$OUT" -maxdepth 1 -type f -printf '%f\t%s bytes\n' | sort