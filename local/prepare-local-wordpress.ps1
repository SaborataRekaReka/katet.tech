param(
    [string]$ExportDir,
    [string]$LocalUrl = 'http://localhost:8081'
)

$ErrorActionPreference = 'Stop'

$LocalUrl = $LocalUrl.TrimEnd('/')

$workspace = Split-Path -Parent $PSScriptRoot
$sourceDir = Join-Path $workspace 'source'
$wpLocal = Join-Path $sourceDir 'wp-local'

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

$manifestPath = Join-Path $ExportDir 'manifest.txt'
if (Test-Path $manifestPath) {
    Get-Content $manifestPath | ForEach-Object {
        if ($_ -match '^(.+?)\s+(\d+) bytes$') {
            $fileName = $matches[1]
            if ($fileName -in @('export.log', 'manifest.txt')) {
                return
            }
            $filePath = Join-Path $ExportDir $fileName
            $expectedSize = [int64]$matches[2]
            if (-not (Test-Path $filePath)) {
                throw "Missing export file: $fileName"
            }
            $actualSize = (Get-Item $filePath).Length
            if ($actualSize -ne $expectedSize) {
                throw "Incomplete export file: $fileName expected $expectedSize bytes, got $actualSize bytes"
            }
        }
    }
}

New-Item -ItemType Directory -Force -Path $wpLocal | Out-Null

Get-ChildItem -Path $ExportDir -Filter '*.tar.gz' | ForEach-Object {
    if ($_.Name -eq 'katet-wp-code-no-uploads.tar.gz') {
        tar -xzf $_.FullName -C $wpLocal --exclude='./wp-content/1db.php'
    }
}

$uploadsDir = Join-Path $wpLocal 'wp-content\uploads'
New-Item -ItemType Directory -Force -Path $uploadsDir | Out-Null
Get-ChildItem -Path $ExportDir -Filter 'katet-uploads-*.tar.gz' | Sort-Object Name | ForEach-Object {
    tar -xzf $_.FullName -C $uploadsDir
}

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$elementorCssDir = Join-Path $uploadsDir 'elementor\css'
if (Test-Path $elementorCssDir) {
    Get-ChildItem -Path $elementorCssDir -Filter '*.css' -File | ForEach-Object {
        $css = [System.IO.File]::ReadAllText($_.FullName, [System.Text.Encoding]::UTF8)
        $updatedCss = $css.Replace('https://katet.tech', $LocalUrl).Replace('http://katet.tech', $LocalUrl)
        if ($updatedCss -ne $css) {
            [System.IO.File]::WriteAllText($_.FullName, $updatedCss, $utf8NoBom)
        }
    }
}

$htaccess = Join-Path $wpLocal '.htaccess'
if (Test-Path $htaccess) {
    $rules = [System.IO.File]::ReadAllText($htaccess, [System.Text.Encoding]::UTF8)
    $updatedRules = $rules.Replace('https://katet.tech', $LocalUrl).Replace('http://katet.tech', $LocalUrl)
    if ($updatedRules -ne $rules) {
        [System.IO.File]::WriteAllText($htaccess, $updatedRules, $utf8NoBom)
    }
}

$wpConfig = Join-Path $wpLocal 'wp-config.php'
$prodConfig = Join-Path $wpLocal 'wp-config.production.php'
if ((Test-Path $wpConfig) -and -not (Test-Path $prodConfig)) {
    Move-Item -Force -Path $wpConfig -Destination $prodConfig
}

$config = @'
<?php
define('DB_NAME', getenv('WORDPRESS_DB_NAME') ?: 'katet_local');
define('DB_USER', getenv('WORDPRESS_DB_USER') ?: 'katet_local');
define('DB_PASSWORD', getenv('WORDPRESS_DB_PASSWORD') ?: 'katet_local_password');
define('DB_HOST', getenv('WORDPRESS_DB_HOST') ?: 'db:3306');
define('DB_CHARSET', 'utf8mb4');
define('DB_COLLATE', '');

define('WP_HOME', '__LOCAL_URL__');
define('WP_SITEURL', '__LOCAL_URL__');
define('WP_ENVIRONMENT_TYPE', 'local');
define('WP_DEBUG', false);
define('DISALLOW_FILE_EDIT', true);
define('DISABLE_WP_CRON', true);
define('WP_HTTP_BLOCK_EXTERNAL', true);
define('WP_ACCESSIBLE_HOSTS', 'localhost,127.0.0.1');

$table_prefix = 'wp_';

if (!defined('ABSPATH')) {
    define('ABSPATH', __DIR__ . '/');
}

require_once ABSPATH . 'wp-settings.php';
'@

$config = $config.Replace('__LOCAL_URL__', $LocalUrl)

[System.IO.File]::WriteAllText($wpConfig, $config, $utf8NoBom)

Write-Host "Prepared local WordPress files at $wpLocal"
Write-Host 'Next: docker compose --project-directory local up -d db wordpress'
