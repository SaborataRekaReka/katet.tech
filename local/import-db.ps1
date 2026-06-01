param(
    [string]$ExportDir,
    [string]$LocalUrl = 'http://localhost:8081'
)

$ErrorActionPreference = 'Stop'

$LocalUrl = $LocalUrl.TrimEnd('/')

$workspace = Split-Path -Parent $PSScriptRoot
$sourceDir = Join-Path $workspace 'source'

if (-not $ExportDir) {
    $latest = Get-ChildItem -Path $sourceDir -Directory -Filter 'katet-tech-export-*' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $latest) {
        throw 'ExportDir was not provided and no source\katet-tech-export-* directory was found.'
    }
    $ExportDir = $latest.FullName
}

if (-not (Test-Path $ExportDir)) {
    throw "Export directory not found: $ExportDir"
}

$dump = Get-ChildItem -Path $ExportDir -Filter '*.sql.gz' | Sort-Object Length -Descending | Select-Object -First 1
if (-not $dump) {
    throw "No .sql.gz dump found in $ExportDir"
}

docker compose --project-directory $PSScriptRoot up -d db
docker compose --project-directory $PSScriptRoot cp $dump.FullName db:/tmp/katet.sql.gz

@'
DROP DATABASE IF EXISTS katet_local;
CREATE DATABASE katet_local CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
'@ | docker compose --project-directory $PSScriptRoot exec -T db mariadb -uroot -pkatet_root_password

docker compose --project-directory $PSScriptRoot exec -T db sh -lc 'gzip -dc /tmp/katet.sql.gz | mariadb -uroot -pkatet_root_password katet_local && rm -f /tmp/katet.sql.gz'

docker compose --project-directory $PSScriptRoot run --rm wpcli search-replace 'https://katet.tech' $LocalUrl --all-tables --skip-columns=guid --skip-plugins --skip-themes --allow-root
docker compose --project-directory $PSScriptRoot run --rm wpcli search-replace 'http://katet.tech' $LocalUrl --all-tables --skip-columns=guid --skip-plugins --skip-themes --allow-root

@'
SET @index_exists := (
    SELECT COUNT(1)
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'wp_postmeta'
      AND index_name = 'local_meta_key_value'
);
SET @sql := IF(
    @index_exists = 0,
    'ALTER TABLE wp_postmeta ADD INDEX local_meta_key_value (meta_key(191), meta_value(191))',
    'SELECT ''local_meta_key_value already exists'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
'@ | docker compose --project-directory $PSScriptRoot exec -T db mariadb -uroot -pkatet_root_password katet_local

docker compose --project-directory $PSScriptRoot run --rm wpcli plugin deactivate really-simple-ssl wp-yandex-metrika webp-converter-for-media media-cleaner interlinks-manager code-snippets elementor-pro-form-widget-bitrix24-integration --skip-plugins --skip-themes --allow-root
docker compose --project-directory $PSScriptRoot run --rm wpcli plugin activate wp-rocket --skip-plugins --skip-themes --allow-root
docker compose --project-directory $PSScriptRoot run --rm wpcli rewrite flush --hard --allow-root

Write-Host "Database imported and URLs were rewritten to $LocalUrl"
