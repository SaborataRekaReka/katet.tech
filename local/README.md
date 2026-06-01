# Local WordPress Copy

1. Download the server export directory into `source/`.
2. Run `./local/prepare-local-wordpress.ps1` from the workspace root. It checks `manifest.txt` first and stops if any archive is incomplete.
3. Import the database: `./local/import-db.ps1`.
4. Start WordPress: `docker compose --project-directory local up -d wordpress`.
5. Open `http://localhost:8081`.

The prepare script replaces production `wp-config.php` with a local Docker config and keeps the original as `wp-config.production.php` inside `source/wp-local`. It also rewrites generated Elementor CSS and `.htaccess` references from `katet.tech` to the local URL.

The import script rewrites database URLs, disables local-only risky plugins (`really-simple-ssl`, metrics, media/link maintenance plugins, Bitrix form integration, and snippets), keeps `wp-rocket` active for local cache, flushes rewrite rules with JetEngine loaded, and adds the `local_meta_key_value` index to `wp_postmeta` to speed up Elementor attachment lookups.

The local copy is intentionally on port `8081` because port `8080` may already be used by another local service.