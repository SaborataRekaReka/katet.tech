# Headless CMS Model For katet.tech

Дата: 25.05.2026

Основано на локально импортированном дампе WordPress `infokaxz_katet.sql.gz` и TSV-аудите в `source/db-analysis/`.

Текущий WordPress использует тему `hello-elementor`, permalink structure `/%postname%/` и 19 активных плагинов. Дизайн и листинги завязаны в основном на Elementor Pro, JetEngine и JetSmartFilters, а не на кастомную WordPress-тему.

## 1. Фактические источники в WordPress

Основные сущности:

| WordPress source | Count | Назначение в новой CMS |
| --- | ---: | --- |
| `wp_posts.post_type = spetstekhnika` | 124 published, 3 pending | `equipment_items` |
| `wp_term_taxonomy.taxonomy = vid-techniki` | 65 terms | `equipment_types` / SEO-лендинги `/arenda/...` |
| `wp_term_taxonomy.taxonomy = brand` | 49 terms | `brands` / SEO-лендинги `/brand/...` |
| `wp_term_taxonomy.taxonomy = tipy-rabot` | 24 terms | `work_types` / SEO-лендинги `/tipy-rabot/...` |
| `wp_posts.post_type = reviews` | 27 published | `reviews` |
| `wp_posts.post_type = post` | 39 published | `posts` |
| `wp_posts.post_type = page` | 23 published, 1 pending | `pages` |
| `wp_posts.post_type = attachment` | 10273 | `media_assets` |

Служебные/конструкторские сущности:

| WordPress source | Count | Использование |
| --- | ---: | --- |
| `elementor_library` | 32 published, 7 draft | Источник для повторяемых блоков/шаблонов дизайна |
| `jet-smart-filters` | 34 published | Источник списка характеристик и фильтров техники |
| `jet-engine` | 5 published | Источник listing/grid настроек |
| `jet-form-builder` | 2 published | Источник форм заявок |
| `acf-field-group` | 3 published | Источник дополнительных полей блога/отзывов |

## 2. Коллекции новой CMS

### `equipment_items`

Источник: `wp_posts` + `wp_postmeta`, где `post_type = 'spetstekhnika'`.

Основные поля:

| CMS field | WP source | Notes |
| --- | --- | --- |
| `legacy_id` | `wp_posts.ID` | Для повторного импорта и трассировки |
| `title` | `wp_posts.post_title` | H1 карточки |
| `slug` | `wp_posts.post_name` | URL: `/arenda_spetstekhniki/{slug}/` |
| `status` | `wp_posts.post_status` | publish/pending |
| `body` | `wp_posts.post_content` | Контент карточки, если есть |
| `excerpt` | `wp_posts.post_excerpt` | Краткое описание, если используется |
| `featured_image` | `_thumbnail_id` | Связь с attachment/media |
| `price` | `tsena` | Сейчас строковое/числовое поле; нормализовать после аудита значений |
| `price_alt` | `tsena_copy` | Есть у 85 карточек |
| `hours_per_shift` | `chasov_v_smene` | Есть у 82 карточек |
| `meta_description` | `_yoast_wpseo_metadesc` или `wp_yoast_indexable.description` | 124 заполненных meta description |
| `seo_title` | `wp_yoast_indexable.title` или шаблон | У карточек Yoast indexable часто хранит пустой title, значит title генерируется шаблоном |

Характеристики техники из `wp_postmeta` и JetSmartFilters:

- `gruzopodemnost`
- `gruzopodemnost-strely`
- `gruzovoi-moment`
- `dlina-borta`
- `dlina-guska`
- `dlina-kuzova`
- `dlina-strely`
- `gabarity`
- `glubina-kopaniia`
- `glubina-ochishchaemoi-iamy`
- `kolesnaia-baza`
- `kolesnaia-formula`
- `maksimalnaia-vysota-podema`
- `maksimalnyi-vylet-strely`
- `massa`
- `moshchnost-dvigatelia`
- `obem-kovsha`
- `obiom-kovsha`
- `obem-kuzova`
- `obiom-tsisterny`
- `oborudovanie`
- `rabochaia-shirina`
- `rabochaia-vysota`
- `razmer-platformyliulki`
- `shirina-borta`
- `shirina-kuzova`
- `shirina-otvala`
- `shirina-zony-moiki`
- `toplivo`
- `vmestimost-tsisterny`
- `vysota-borta`
- `vysota-otvala`
- `vysota-podema`
- `vysota-vygruzki-pogruzchika`

Рекомендация: хранить характеристики как повторяемую структуру `specs: [{ key, label, value, unit, sort }]`, а не как 30+ жестких колонок. Для фильтров в UI сделать отдельный справочник `equipment_spec_definitions`, чтобы можно было управлять label, типом значения, единицами и видимостью.

Связи:

- `equipment_items -> equipment_types` через `wp_term_relationships` + `vid-techniki`.
- `equipment_items -> brands` через `brand`.
- `equipment_items -> work_types` через `tipy-rabot`.
- Legacy taxonomy `zapros` не переносится как публичная CMS-сущность: это служебный WP-костыль для цены/заявки, а техника остается в `equipment_items`.

### `equipment_types`

Источник: taxonomy `vid-techniki`.

URL: `/arenda/{slug}/`

Поля:

- `legacy_term_id`, `slug`, `name`, `description`.
- `hero_image`: `termmeta.izobrazhenie` или `thumbnail_id`.
- `seo_text`: `termmeta.seo-tekst`.
- `discount_value`: `termmeta.velichina-skiki`.
- `allow_filters`: `termmeta.allowfilters`.
- `seo_title`, `meta_description`, `breadcrumb_title`, `canonical`: из `wp_yoast_indexable`.
- `old_aioseo_*`: переносить как backup/reference, не использовать напрямую, если Yoast indexable заполнен.

### `brands`

Источник: taxonomy `brand`.

URL: `/brand/{slug}/`

Поля:

- `legacy_term_id`, `slug`, `name`, `description`.
- `body`: `termmeta.opisanie_brand`.
- `seo_title`, `meta_description`, `breadcrumb_title`, `canonical`: из `wp_yoast_indexable`.

SEO-риск: у brand-термов в `wp_yoast_indexable` 20 пустых title и 23 пустых description. Эти страницы переносим как есть на первом этапе, но отмечаем для SEO-доработки после запуска.

### `work_types`

Источник: taxonomy `tipy-rabot`.

URL: `/tipy-rabot/{slug}/`

Поля:

- `legacy_term_id`, `slug`, `name`, `description`.
- `body`: `termmeta.opisanie`.
- `seo_title`, `meta_description`, `breadcrumb_title`, `canonical`: из `wp_yoast_indexable`.

SEO-плюс: у `tipy-rabot` в Yoast indexable все 24 terms имеют заполненные title и description.

### `posts`

Источник: `wp_posts.post_type = 'post'`.

URL: `/{slug}/`, плюс `/blog/` как индекс.

Поля:

- `legacy_id`, `title`, `slug`, `body`, `excerpt`, `published_at`, `updated_at`.
- `featured_image`: `_thumbnail_id`.
- `gallery`: `_gallery`/`gallery`.
- `category`: `category`, primary category из `_yoast_wpseo_primary_category`.
- `seo_title`, `meta_description`: `_yoast_wpseo_title`, `_yoast_wpseo_metadesc`, `wp_yoast_indexable`.

### `reviews`

Источник: `wp_posts.post_type = 'reviews'`.

URL сейчас есть в sitemap как `/reviews/{slug}/`, но `robots.txt` закрывает `/reviews/*`.

Поля:

- `legacy_id`, `author_name`, `slug`, `body`, `published_at`.
- `photo`: `_photo`/`photo` + `_thumbnail_id`.
- `source_url`, если есть в content/meta.
- `robots`: по текущей политике скорее `noindex` или исключение из sitemap, если отдельные страницы отзывов не нужны в индексе.

SEO-риск: в Yoast indexable у 27 отзывов пустые title и description.

### `pages`

Источник: `wp_posts.post_type = 'page'`.

Поля:

- `legacy_id`, `title`, `slug`, `url_path`, `body`, `template`, `status`.
- `content_blocks`: реконструировать из Elementor/HTML для основных страниц.
- `seo_title`, `meta_description`, `canonical`, `robots`.

## 3. SEO-поля и приоритет источников

Для каждого URL импортировать SEO в таком порядке:

1. `wp_yoast_indexable.title/description/permalink/breadcrumb_title`.
2. `_yoast_wpseo_title` и `_yoast_wpseo_metadesc` из `wp_postmeta`.
3. Старые `_aioseo_*` meta как backup/reference, если Yoast пустой.
4. Сгенерированный fallback из текущих шаблонов WordPress/Yoast, если в indexable лежит `NULL` или шаблон вида `%%term_title%%`.

Важное наблюдение:

- У `spetstekhnika` в `wp_yoast_indexable` 127 пустых title, но только 3 пустых description. Значит title карточек, вероятно, генерируется глобальным SEO-шаблоном.
- У `vid-techniki` почти все title/description заполнены: 65 terms, 1 пустой title, 1 пустой description.
- У `tipy-rabot` все 24 terms заполнены.
- У `brand` есть заметные пробелы: 49 terms, 20 пустых title, 23 пустых description.
- У `category` и `reviews` SEO-поля в основном пустые; эти URL нужно отдельно решить: индексировать, noindex или редиректить.

## 4. Import Pipeline

### Шаг 1. Медиа

- Импортировать `wp_posts.attachment`.
- Сохранить `legacy_attachment_id`, original URL, local path, mime type, alt, caption.
- Не переносить `uploads-webpc` как источник истины; WebP/AVIF генерировать заново на новом стеке.

### Шаг 2. Terms

- Импортировать `vid-techniki`, `brand`, `tipy-rabot`, `category`; `zapros` удалить из новой модели как служебную taxonomy.
- Подтянуть `wp_termmeta` и `wp_yoast_indexable`.
- Сохранить `legacy_term_id` и `legacy_term_taxonomy_id`.

### Шаг 3. Equipment Items

- Импортировать `spetstekhnika`.
- Подтянуть meta-поля характеристик и цены.
- Подтянуть featured image.
- Подтянуть term relationships.
- Сгенерировать final URL `/arenda_spetstekhniki/{post_name}/` и сверить с sitemap.

### Шаг 4. Pages, Posts, Reviews

- Импортировать `page`, `post`, `reviews`.
- Для Elementor-страниц сохранить исходный Elementor JSON как `legacy_elementor_data` и отдельно собрать HTML/content_blocks для нового frontend.
- Для блога перенести галереи ACF.

### Шаг 5. URL Inventory Merge

- Объединить `katet-url-inventory.csv` с импортированными сущностями.
- Каждому URL присвоить: `200`, `301`, `410`, `noindex`.
- Любая строка из sitemap без новой сущности должна блокировать релиз.

## 5. Что проверять при локальном прототипе

- Открывается главная и ключевые шаблоны WordPress на `localhost:8081`.
- Сохраняются `wp_yoast_indexable` и termmeta после импорта.
- Корректно отображаются Elementor template IDs: Header, Footer, `Аренда`, `Услуги`, `Страница транспорта`, `Отзывы`, `FAQ`.
- Карточка техники показывает price, image, specs и связи с brand/type/work type.
- Посадочная `/arenda/...` подтягивает `seo-tekst`, изображение, скидку и allowfilters.

## 6. Сгенерированные DB-аудит файлы

- `source/db-analysis/post-type-counts.tsv`
- `source/db-analysis/taxonomy-counts.tsv`
- `source/db-analysis/key-taxonomy-terms.tsv`
- `source/db-analysis/postmeta-key-counts.tsv`
- `source/db-analysis/termmeta-key-counts.tsv`
- `source/db-analysis/equipment-samples.tsv`
- `source/db-analysis/equipment-terms.tsv`
- `source/db-analysis/yoast-indexable-summary.tsv`
- `source/db-analysis/yoast-term-seo.tsv`
- `source/db-analysis/builder-objects.tsv`