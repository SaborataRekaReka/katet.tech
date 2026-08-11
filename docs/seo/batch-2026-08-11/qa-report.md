# QA-отчёт SEO-партии 2026-08-11

## Автоматические проверки

| Проверка | Команда / метод | Результат |
|---|---|---|
| TypeScript | `npx.cmd tsc --noEmit` | пройдено |
| ESLint новых и затронутых файлов | `npx.cmd eslint <batch files>` | пройдено без ошибок и предупреждений |
| Общий ESLint | `npm.cmd run lint` | не пройден из-за двух существующих ошибок в `GeneratePanel.tsx:52` и `semantics/page.tsx:146`; новые файлы чистые |
| Production build | `npm.cmd run build` | пройдено, Next.js 16.2.6, все 6 маршрутов в route manifest |
| Diff whitespace | `git diff --check` | пройдено; только уведомления о будущем CRLF |
| Ровно шесть маршрутов | проверка route manifest и списка каталогов | пройдено |
| Уникальные Title, H1, canonical | HTTP-проверка серверного HTML | пройдено, 6 из 6 уникальны |
| Изображения | существование и размер 12 локальных файлов | пройдено; WebP 125–187 КБ, SVG 2,2–2,4 КБ |
| Sitemap и каталог | проверка `/sitemap.xml` и `/tipy-rabot/` | пройдено; все 6 URL присутствуют, по 3 входящих ссылки из каталога/шаблонной навигации |

## Локальная production-сборка

Сервер: `next start`, локальный QA-порт 3012. Для всех новых страниц подтверждены HTTP 200, один H1, self-canonical, уникальные Title и Description, FAQPage/Service/BreadcrumbList JSON-LD, hero WebP и SVG-схема. Серверный HTML содержит основной текст без клиентского запроса; ориентировочно 1049–1083 слова на страницу с учетом шаблонной навигации.

| URL | HTTP | H1 | canonical | schema | hero | diagram |
|---|---:|---:|---:|---:|---:|---:|
| `/uplotnenie-grunta/` | 200 | 1 | да | да | да | да |
| `/korchevanie-pnej/` | 200 | 1 | да | да | да | да |
| `/obratnaya-zasypka-grunta/` | 200 | 1 | да | да | да | да |
| `/demontazh-asfalta/` | 200 | 1 | да | да | да | да |
| `/ukladka-dorozhnyh-plit/` | 200 | 1 | да | да | да | да |
| `/demontazh-metallokonstrukcij/` | 200 | 1 | да | да | да | да |

## Визуальная проверка

- Chrome desktop 1707×769: первый экран `/uplotnenie-grunta/` корректен, H1 и breadcrumbs читаются, hero загружен без искажения, горизонтального переполнения нет.
- Полный обзор раскрывается, оглавление и иерархия H2/H3 отображаются, SVG имеет натуральный размер 1200×420 и загружается после прокрутки.
- Каталожные иллюстрации используют тот же локальный WebP, что и hero, без внешних запросов.
- Mobile-проверка и повторная desktop-проверка production фиксируются ниже после деплоя.

## Регрессия

Локально HTTP 200 подтвержден для `/`, `/arenda/`, `/tipy-rabot/`, `/demontazh-fundamenta/`, `/blog/`, `/sitemap.xml`, `/robots.txt` и `/arenda_spetstekhniki/`. Категория `/arenda/arenda-avtokrana/` и DB-статья `/chto-delaet-buldozer-na-strojke/` локально возвращают 404 из-за штатного read-fallback при недоступной локальной БД; их состояние необходимо проверять на production с рабочей БД.

## Production

Заполняется после push и завершения workflow:

- Commit: pending
- Deployment: pending
- Проверено production URL: 0/6
- Desktop/mobile: pending
