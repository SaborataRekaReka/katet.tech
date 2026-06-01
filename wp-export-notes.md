# WordPress Export Notes

Дата: 25.05.2026

## Сервер

- SSH host: `infokaxz@infokaxz.beget.tech`
- WordPress root: `/home/i/infokaxz/katet.tech/public_html`
- Database name/user: `infokaxz_katet`
- Table prefix: `wp_`

## Размеры на сервере

- `public_html`: около 13 GB
- `wp-content`: около 12 GB
- `wp-content/uploads`: около 9.7 GB
- `wp-content/uploads/2023`: около 3.7 GB
- `wp-content/uploads/2024`: около 217 MB
- `wp-content/uploads/2025`: около 5.7 GB
- `wp-content/uploads/2026`: около 4.9 MB
- `wp-content/uploads-webpc`: около 1.4 GB, производные WebP-копии
- `wp-content/cache`: около 215 MB, кэш
- `wp-content/backups-dup-pro`: около 395 MB, старые бэкапы Duplicator

## Важные плагины

Активная тема: `hello-elementor`.

Permalink structure: `/%postname%/`.

Активные плагины по `wp_options.active_plugins`: 19.

- Elementor / Elementor Pro
- JetEngine, JetSmartFilters, JetThemeCore
- Advanced Custom Fields Pro
- Yoast SEO (`wordpress-seo`)
- Contact Form 7
- WP Rocket
- WP All Export Pro / WP All Import Pro
- Interlinks Manager
- WebP Converter for Media
- WP Yandex Metrika

В архиве кода есть серверный symlink `wp-content/1db.php -> /var/www/fastuser/data/www/katet.tech/wp-content/plugins/query-monitor/wp-content/db.php`. На Windows он не распаковывается через `tar`; для локальной копии он исключен в `local/prepare-local-wordpress.ps1`.

## DB counts

Опубликованные основные сущности:

- `spetstekhnika`: 124 published, 3 pending
- `reviews`: 27 published
- `page`: 23 published, 1 pending
- `post`: 39 published
- `attachment`: 10273 inherited
- `nav_menu_item`: 45 published

Конструктор и служебные сущности:

- `elementor_library`: 32 published, 7 draft
- `elementor_snippet`: 4 published, 6 draft
- `jet-smart-filters`: 34 published
- `jet-engine`: 5 published
- `jet-form-builder`: 2 published
- `acf-field-group`: 3 published
- `acf-field`: 6 published

SEO/Elementor meta counts:

- `_yoast_wpseo_metadesc`: 183
- `_yoast_wpseo_title`: 59
- `_yoast_wpseo_canonical`: 1
- `_elementor_data`: 2037
- `_elementor_page_settings`: 1938
- `_wp_page_template`: 2258

Вывод: `spetstekhnika` является custom post type, а `brand`, `vid-techniki`, `tipy-rabot` с большой вероятностью являются taxonomy/term сущностями, потому что они есть в sitemap, но не видны как `post_type`.

Taxonomy counts:

- `brand`: 49 terms, 93 object refs
- `vid-techniki`: 65 terms, 252 object refs
- `tipy-rabot`: 24 terms, 237 object refs
- `zapros`: 2 terms, 115 object refs
- `category`: 7 terms, 39 object refs

Вывод уточнен: `brand`, `vid-techniki`, `tipy-rabot`, `zapros` точно лежат в WordPress как таксономии. Для headless CMS `brand`, `vid-techniki` и `tipy-rabot` переносятся как отдельные коллекции; `zapros` признан служебным костылем WordPress и удаляется из новой модели без удаления самих `equipment_items`.

## Экспорт

Текущий серверный экспорт собирается в папку вида:

`/home/i/infokaxz/katet-tech-export-YYYYMMDD-HHMMSS`

Состав экспорта:

- `infokaxz_katet.sql.gz`: дамп БД.
- `katet-wp-code-no-uploads.tar.gz`: WordPress-код, темы, плагины, настройки без больших медиа/кэшей.
- `katet-uploads-2023.tar.gz`, `katet-uploads-2024.tar.gz`, `katet-uploads-2025.tar.gz`, `katet-uploads-2026.tar.gz`: медиа по годам.
- `katet-uploads-elementor.tar.gz`, `katet-uploads-wpallexport.tar.gz`, `katet-uploads-wpallimport.tar.gz`, `katet-uploads-misc.tar.gz`: служебные медиа/экспорты.
- `manifest.txt` и `export.log`.

Из архива кода исключены кэши, Duplicator-бэкапы, `uploads-webpc`, временные папки и старый `dup-installer`, чтобы не тащить производные и потенциально лишние файлы в локальную копию.

## Локальный запуск

Подготовлены:

- `local/docker-compose.yml`
- `local/prepare-local-wordpress.ps1`
- `local/import-db.ps1`

Локальный URL: `http://localhost:8081`

Статус локальной копии:

- WordPress и MariaDB запущены через Docker Compose: `katet-wp`, `katet-wp-db`.
- БД импортирована, URL переписаны на `http://localhost:8081`.
- Для локального запуска отключены плагины, которые мешали проверке или тянули внешние сервисы: Really Simple SSL, Yandex Metrika, WebP Converter, Media Cleaner, Interlinks Manager, Code Snippets, Bitrix form integration.
- `wp-rocket` оставлен активным локально, чтобы ускорить повторные просмотры тяжелых Elementor-страниц.
- Добавлен локальный индекс `local_meta_key_value` на `wp_postmeta(meta_key(191), meta_value(191))`; без него Elementor медленно ищет вложения по `_wp_attached_file`.
- Сгенерированные CSS Elementor и `.htaccess` переписаны с `katet.tech` на локальный URL, чтобы не было CORS-ошибок шрифтов и редиректов на продакшен.

Проверенные URL:

- `/`: 200, тяжелая главная, после кэша около 29 секунд на локальном Docker.
- `/arenda/arenda-avtokrana/`: 200, визуально открывается, H1 `Аренда автокрана`.
- `/arenda_spetstekhniki/avtokran-ivanovecz-vezdehod-25-tonn/`: 200.
- `/tipy-rabot/demontaj-zdaniy/`: 200.
- `/brand/arenda-ehkskavatora-volvo/`: 200.
- `/blog/`: 200.