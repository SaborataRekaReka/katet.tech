# Design And Template Inventory

Дата: 25.05.2026

Источники: визуальный обход `katet.tech`, локальный DB-аудит `source/db-analysis/builder-objects.tsv`, активные WordPress options.

## 1. Общий вывод

Текущий дизайн не живет в кастомной теме. Активная тема — `hello-elementor`, а основные шаблоны собраны в Elementor Pro + JetEngine:

- Header/Footer: Elementor Library.
- Archive/listing страниц техники и услуг: Elementor Archive + JetEngine listings.
- Single карточки транспорта: Elementor Single template `Страница транспорта`.
- Фильтры характеристик: JetSmartFilters.
- Формы: Elementor/Contact Form 7/Jet Form Builder.

Для headless frontend это означает: переносить нужно не тему WordPress, а визуальную систему и шаблоны Elementor в компонентную структуру Next.js.

## 2. Ключевые Elementor templates

Из `source/db-analysis/builder-objects.tsv`:

| ID | Title | Slug | Роль при переносе |
| ---: | --- | --- | --- |
| 9 | Header | `elementor-header-9` | Основной header |
| 5883 | Elementor Header #5883 | `elementor-header-5883` | Альтернативный/новый header |
| 6644 | Elementor Header Transparent | `elementor-header-transparent` | Header для hero/прозрачного режима |
| 188 | Footer | `elementor-footer-188` | Footer |
| 1148 | Аренда | `elementor-archive-1148` | Архив/лендинг аренды техники |
| 1670 | Услуги | `elementor-archive-1148-2` | Архив/лендинг типов работ |
| 1189 | Страница транспорта | `elementor-single-post-1189` | Single template карточки `spetstekhnika` |
| 6082 | Reviews | `reviews` | Блок/шаблон отзывов |
| 6081 | Отзывы | encoded slug | Страница/секция отзывов |
| 14553 | FAQ — katet.tech | `faq-katet-tech` | FAQ block |
| 14556 | FAQ — katet.tech | `faq-katet-tech-2` | Альтернативный FAQ block |
| 13818 | Все виды техники | encoded slug | Секция каталога видов техники |
| 13881 | Search | `elementor-loop-item-3` | Search/list item |
| 13917 | Результаты поиска | `elementor-search-results-13917` | Search results template |
| 1504 | Elementor Popup #1504 | `elementor-popup-1504` | Popup/lead modal |
| 1570 | Contact Form | `contact-form` | Форма контакта |
| 4620 | form-n | `form-n` | Форма заявки |
| 14115 | Промо | encoded slug | Promo/CTA block |
| 14448 | Врезка #2 | encoded slug | Article/content insert |
| 14425 | Elementor Single Post #14425 | `elementor-single-post-14425` | Single post template |

## 3. JetEngine listings

| ID | Title | Slug | Роль |
| ---: | --- | --- | --- |
| 1153 | Спецтехника | `specztehnika` | Listing карточек техники |
| 235 | Все виды техники | `vse-vidy-tehniki` | Listing видов техники |
| 3085 | Сменная техника | `smennaya-tehnika` | Related/available equipment block |
| 1446 | Для меню | `dlya-menyu` | Menu data/listing |
| 1462 | Для меню | `dlya-menyu-2` | Menu data/listing |

## 4. JetSmartFilters -> будущие фильтры

Текущие фильтры соответствуют meta-полям техники. В новой CMS их лучше хранить в `equipment_spec_definitions`:

- Вместимость цистерны: `vmestimost-tsisterny`
- Высота борта: `vysota-borta`
- Высота выгрузки погрузчика: `vysota-vygruzki-pogruzchika`
- Высота отвала: `vysota-otvala`
- Высота подъема: `vysota`
- Габариты: `gabarity`
- Глубина копания: `glubina-kopaniia`
- Глубина очищаемой ямы: `glubina-ochishchaemoi-iamy`
- Грузовой момент: `gruzovoi-moment`
- Грузоподъемность: current filter slug is URL-encoded and should be normalized to `gruzopodemnost`
- Грузоподъёмность стрелы: `gruzopodemnost-strely`
- Длина борта: `dlina-borta`
- Длина гуська: `dlina-guska`
- Длина кузова: `dlina-kuzova`
- Длина стрелы: `dlina-strely`
- Колесная база: `kolesnaia-baza`
- Колесная формула: `kolesnaia-formula`
- Максимальная высота подъема: `maksimalnaia-vysota-podema`
- Максимальный вылет стрелы: `maksimalnyi-vylet-strely`
- Масса: `massa`
- Мощность двигателя: `moshchnost-dvigatelia`
- Оборудование: `oborudovanie`
- Объём/Объем ковша: `obiom-kovsha` and `obem-kovsha` need normalization
- Объем кузова: `obem-kuzova`
- Объём цистерны: `obiom-tsisterny`
- Рабочая высота: `rabochaia-vysota`
- Рабочая ширина: `rabochaia-shirina`
- Размер платформы/люльки: `razmer-platformyliulki`
- Топливо: `toplivo`
- Ширина борта: `shirina-borta`
- Ширина зоны мойки: `shirina-zony-moiki`
- Ширина кузова: `shirina-kuzova`
- Ширина отвала: `shirina-otvala`

## 5. Next.js component map

После рефактора 11 URL/SEO-template из `katet-url-inventory.csv` сведены к 6 базовым UI-шаблонам. Маршруты остаются раздельными ради URL, metadata и SEO-правил, но визуальная сборка живет в общих view-компонентах.

| Base UI template | Покрывает URL templates | Компонент |
| --- | --- | --- |
| Home | `home` | `HomePageView` |
| Archive/list | `blog_or_article` index `/blog/`, `blog_category`, `author_archive` | `ArchiveListView` |
| Directory | `/arenda/`, `/brand/`, `/tipy-rabot/` directories | `DirectoryPage` |
| Taxonomy landing | `equipment_type_landing`, `brand_landing`, `work_type_landing` | `LandingPageView` -> `TaxonomyLandingTemplate` |
| Equipment catalog/detail | `/arenda_spetstekhniki/`, `equipment_item` | `EquipmentCatalogView`, `EquipmentDetail` |
| Rich content/detail | `static_page`, root `blog_or_article`, `request_flow`, `review_item` | `ContentPageView`, `ReviewPageView` |

Так сохраняется URL-поверхность старого сайта, но исчезает разовая сборка страниц прямо в route-файлах.

| Component | Replaces | Notes |
| --- | --- | --- |
| `SiteHeader` | Elementor Header templates | Yellow contact bar, menu, search, messengers, callback CTA |
| `HeroLead` | Home/landing hero | Dark image hero, H1, quick order phone field, consent, Telegram/WhatsApp |
| `EquipmentCard` | JetEngine `Спецтехника` listing | Image, count/in-stock, discount, title, excerpt, CTA |
| `EquipmentTypePage` | Elementor Archive `Аренда` | Term SEO landing + equipment listing + filters |
| `EquipmentItemPage` | Elementor Single `Страница транспорта` | Image/gallery, price, specs, CTA, related equipment |
| `WorkTypePage` | Elementor Archive `Услуги` | Work landing, linked equipment, SEO text |
| `BrandPage` | Brand term archive | Brand landing, linked equipment, SEO text |
| `ReviewsBlock` | Elementor `Reviews`/`Отзывы` | Review cards, external Yandex links |
| `FaqBlock` | FAQ templates | Reusable FAQ schema-capable block |
| `LeadModal` | Elementor Popup #1504 | Callback/order modal |
| `SearchResults` | Search templates | Search UI; likely `noindex` unless explicitly needed |
| `SiteFooter` | Elementor Footer | Menu, реквизиты, договор, contacts, messengers |

## 6. Visual notes from public pages

- Desktop header: bright yellow top band, black/dark text, contact links, search, messenger icons, callback button, discount note.
- Homepage hero: dark/full-width equipment image, white H1, compact quick-order form, purple CTA, messenger alternatives.
- Landing pages `/arenda/...`: similar brand system, SEO landing composition, equipment cards/listing below.
- Equipment cards `/arenda_spetstekhniki/...`: more product-like layout with image, price/availability/specs and CTA.
- Footer: dense service/contact navigation, requisites PDF, contract PDF, phone/email/address, Telegram/WhatsApp.

## 7. Design migration rule

First implementation should reproduce the current visual hierarchy and URLs before any redesign. Improvements should be limited to performance, responsive stability, accessibility and SEO/schema quality until launch has stabilized.