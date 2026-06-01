# Katet Directus Migration

Локальный headless-контур для миграции `katet.tech` с WordPress на Directus.

## Что поднимается

- Directus: `http://localhost:8055`
- PostgreSQL: `127.0.0.1:55432`
- Админ по умолчанию: `admin@example.com`
- Пароль по умолчанию: `katet_directus_admin`

Пароли выше предназначены только для локального окружения. Для staging/production нужно создать `directus/.env` на основе `.env.example` и заменить значения.

## Быстрый старт

Из корня проекта:

```powershell
docker compose --project-directory .\directus up -d
docker compose --project-directory .\directus exec -T postgres psql -U katet_directus -d katet_directus -f /schema/001_content_schema.sql
docker compose --project-directory .\directus exec -T postgres psql -U katet_directus -d katet_directus -f /schema/002_directus_pivot_ids.sql
docker compose --project-directory .\directus exec -T postgres psql -U katet_directus -d katet_directus -f /schema/003_media_assets.sql
docker compose --project-directory .\directus exec -T postgres psql -U katet_directus -d katet_directus -f /schema/004_directus_admin_metadata.sql
docker compose --project-directory .\directus exec -T postgres psql -U katet_directus -d katet_directus -f /schema/005_public_read_permissions.sql
```

Импорт из уже поднятой локальной WordPress-базы:

```powershell
Push-Location .\directus\migration
npm install
npm run check:env
npm run import:wp
npm run check:env:media
npm run import:media
npm run import:media:inline
Pop-Location
```

Для миграционных скриптов можно использовать отдельный шаблон переменных окружения:

```powershell
Copy-Item .\directus\migration\.env.example .\directus\migration\.env
```

Проверка без записи:

```powershell
Push-Location .\directus\migration
npm run import:wp:dry
npm run import:media:dry
npm run import:media:inline:dry
Pop-Location
```

Экспорт city SEO-блоков из WordPress в структурированный JSON (для валидации и детерминированного импорта):

```powershell
Push-Location .\directus\migration
npm run export:city-seo
Pop-Location
```

Результат сохраняется в `directus/migration/output/city-seo-export.json` с полями `intro_html` и `details_html` для каждой страницы `arenda-specztehniki-v-*`.

## Источник данных

Скрипт импорта читает WordPress из контейнера `katet-wp-db`, который поднимается существующим окружением `local/`.

Ожидаемые параметры WordPress DB:

- контейнер: `katet-wp-db`
- база: `katet_local`
- пользователь: `katet_local`
- пароль: `katet_local_password`

## Первый охват импорта

- `pages`
- `posts`
- `reviews`
- `equipment_items`
- `equipment_types`
- `brands`
- `work_types`
- связи техники с типами, брендами и типами работ
- характеристики техники как `equipment_spec_definitions` + `equipment_specs`
- ключевые медиа в Directus Files: featured images техники/статей/отзывов/страниц и hero images видов техники
- inline-медиа из `post_content` и taxonomy meta, которые ссылаются на `/wp-content/uploads/`

## Текущее локальное состояние

Проверенный импорт из локальной WordPress-копии:

- контент: 127 карточек техники, 65 видов техники, 49 брендов, 24 типа работ, 24 страницы, 39 статей, 27 отзывов;
- связи и характеристики: 704 связи техники с таксономиями, 463 характеристики;
- медиа: 433 файла в `directus_files` и 433 записи в `media_assets` после критического и inline-импорта;
- связанные изображения: 127/127 карточек техники, 65/65 видов техники, 39/39 статей, 27/27 отзывов, 11 отдельных ACF `photo` у отзывов;
- страницы сейчас имеют 0 linked featured images, потому что в текущем критическом слое у WP pages не нашлось `_thumbnail_id`;
- админка Directus настроена через `004_directus_admin_metadata.sql`: коллекции получили порядок/иконки/русские названия, ключевые image-поля открываются как file image, технические legacy-поля скрыты.
- публичное чтение медиа и контента для сайта настроено через `005_public_read_permissions.sql`, чтобы Next.js мог отдавать изображения из `/assets/{id}` и при необходимости читать Directus API без авторизации.

Media importer умеет находить локальные файлы, если архив с uploads был распакован с CP866-mojibake именами для кириллических файлов, но в Directus сохраняет нормальный UTF-8 `source_path`. Режим `--inline` дополнительно переносит найденные изображения и PDF из HTML-контента и taxonomy meta; в текущем архиве 10 старых inline JPG-ссылок из WordPress не имеют физического файла в uploads.

Медиа-импорт по умолчанию не переносит все 10k+ attachments, а берет только файлы, необходимые для текущих шаблонов и SEO-страниц. Полный перенос всех image attachments можно запустить отдельно:

```powershell
Push-Location .\directus\migration
node .\src\import-media.mjs --all
Pop-Location
```