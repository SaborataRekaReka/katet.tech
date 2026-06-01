# Migration Acceptance Criteria

Дата: 26.05.2026

## Что значит "закрыть миграцию"

Миграцию нельзя закрывать фразой "выглядит похоже". Закрытие должно быть отчетом, который можно повторить на staging и после выкладки.

## Уровень 1. URL preservation

Источник истины: `katet-url-inventory.csv`.

Критерий готовности:

- каждый `path` из инвентаря отдает `200` на новом сайте;
- путь сохранен полностью, включая trailing slash;
- нет незапланированных `301/302/308` для URL из инвентаря;
- HTML не содержит старые runtime-маркеры WordPress/Elementor/jQuery.

Команда:

```powershell
Push-Location frontend
npm run verify:migration
Pop-Location
```

Ожидаемый результат для текущего инвентаря:

```text
TOTAL=351 ... FAIL=0
```

## Уровень 2. SEO fields preservation

Критерий готовности для индексируемых страниц:

- ровно один H1;
- сохранены `title`, `meta description`, canonical path, robots;
- canonical указывает на тот же path из инвентаря;
- sitemap генерирует HTTPS URL с теми же paths.

Команда для строгой проверки нового сайта:

```powershell
Push-Location frontend
$env:STRICT_SEO='1'; npm run verify:migration; Remove-Item Env:STRICT_SEO
Pop-Location
```

## Уровень 3. "Слово в слово" для контента

Корректное определение: сохраняем не старый Elementor HTML, а нормализованный контент из WordPress export.

Строгая проверка идет напрямую по данным: источник — локальная WordPress DB, цель — Directus/Postgres. Это не зависит от тяжелого рендера старого WordPress и доказывает, что перенесенные записи совпадают по URL.

Сравниваем по каждой переносимой сущности:

- `legacy_id` / `legacy_term_id`;
- `url_path`;
- заголовок/H1;
- SEO title и meta description;
- `body`, `excerpt`/description;
- canonical и robots из Yoast;
- цены и основные технические поля карточек техники;
- контентные изображения по legacy id, где поле хранится в модели.

Важно: byte-for-byte HTML не является целью, потому что старые `<div class="elementor...">`, inline styles, WordPress scripts и plugin markup намеренно удаляются. Гарантия "слово в слово" должна относиться к тексту и SEO-полям, а не к старой технической обвязке.

Команда строгой проверки source -> Directus/Postgres:

```powershell
Push-Location frontend
npm run verify:source
Pop-Location
```

Ожидаемый результат для текущего инвентаря:

```text
TOTAL=343 OK=343 FAIL=0 SKIPPED_GENERATED=8
```

`SKIPPED_GENERATED=8` — это страницы без собственной WP-записи: author archive, 5 category archives, `/blog/` и `/arenda_spetstekhniki/`. Они закрываются уровнем URL/SEO и визуальным аудитом шаблонов.

Для дополнительного сравнения рендера с локальным WordPress можно запустить:

```powershell
Push-Location frontend
$env:LEGACY_BASE_URL='http://localhost:8081'; npm run verify:migration; Remove-Item Env:LEGACY_BASE_URL
Pop-Location
```

Строгий режим по SEO-полям против WordPress:

```powershell
Push-Location frontend
$env:LEGACY_BASE_URL='http://localhost:8081'; $env:STRICT_LEGACY='1'; npm run verify:migration; Remove-Item Env:LEGACY_BASE_URL; Remove-Item Env:STRICT_LEGACY
Pop-Location
```

## Уровень 4. Template visual parity

Визуальное "пиксель в пиксель" закрывается не всеми 351 страницами вручную, а по representative templates:

- home;
- equipment type landing `/arenda/...`;
- work type landing `/tipy-rabot/...`;
- brand landing `/brand/...`;
- equipment item `/arenda_spetstekhniki/...`;
- article;
- static page;
- contacts/about;
- review;
- directory/archive pages.

Критерий готовности: для каждого шаблона есть пара старый/новый screenshot на desktop и mobile, а отличия либо исправлены, либо явно приняты как часть переноса на новый стек.

## Финальный definition of done

Миграция закрыта только когда есть:

- checksum/manifest финального WordPress export;
- `katet-url-inventory.csv` без пропусков;
- отчет `verify:migration` с `FAIL=0`;
- отчет strict SEO с `FAIL=0` или список явно принятых исключений;
- отчет контентного diff по `legacy_id`/`legacy_term_id`;
- screenshot-аудит representative templates;
- финальный post-launch crawl после переключения домена.