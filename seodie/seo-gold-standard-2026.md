# SEO Article Gold Standard 2026 (Google + Yandex + Industry)

Этот документ фиксирует практический стандарт для генерации SEO-статей в проекте.

## 1) Источники для стандарта

- Google Search Central (официальные):
  - AI optimization guide
  - Helpful content / people-first
  - Spam policies (включая scaled-content abuse)
  - Search docs updates (май 2026: FAQ rich results discontinued)
- Yandex Webmaster (официальные):
  - Принципы качества поиска
  - Рекомендации по представлению информации, юзабилити, ссылкам, типовым ошибкам
  - Schema.org / микроразметка
- Экспертные индустриальные публикации 2026:
  - Search Engine Land / Search Engine Journal / Semrush и др. (next-question intent, answer-ready blocks, semantic clarity, anti-thin content)

## 2) Что обязательно должно быть в SEO-статье 2026

1. Intent-fit: статья отвечает не только на стартовый запрос, но и на следующий шаг принятия решения.
2. Answer-ready структура: каждый H2 самодостаточный, с прямым ответом в начале блока.
3. Information gain: не пересказ SERP, а добавление практических критериев, ограничений, сравнения и применимых шагов.
4. Decision support: явные блоки "как выбрать", "когда не подходит", "ошибки/риски", "что делать дальше".
5. Доказательность: конкретные формулировки вместо broad claims; разделение фактов компании и внешних общерыночных тезисов.
6. Trust/EEAT signals: прозрачные условия, ограничения, корректная атрибуция источников.
7. Natural keyword usage: без KPI по плотности; primary/secondary keys распределяются по смыслу, не по формуле.
8. Readability: короткие абзацы, списки, логическая иерархия заголовков, минимум воды.
9. Anti-spam: никакого scaled template-контента, keyword stuffing, клоакинга, скрытых блоков и манипулятивных вставок.
10. CTA relevance: следующий шаг (форма/контакт/действие) соответствует интенту и стадии пользователя.

## 3) Schema policy (2026)

- Для обычных сервисных/инфо-страниц базовый стек: Service + BreadcrumbList (по применимости).
- Для FAQ rich result в Google: с 2026-05-07 больше не показывается, не использовать FAQPage как "must-have" ради ранжирования.
- QAPage/FAQ-like schema использовать только если формат страницы реально соответствует типу.

## 4) Минимальные требования к body_html

- >= length_requirements.min_chars из brief (обычно 4200 для informational и 5500 для commercial).
- >= 5 H2.
- >= 5 содержательных абзацев.
- Нет запрещенных тегов: form/script/style/iframe/button.
- Есть признаки:
  - comparison/criteria section,
  - constraints/risks section,
  - decision CTA section,
  - evidence/practical section.
- Низкий уровень повторов: дубли абзацев <= 25%.

## 5) Контракт brief для модели

Обязательные поля:

- base fields: page_goal, page_type, search_intent, primary_keyword, secondary_keywords, required_blocks, quality_requirements
- strategy fields:
  - next_question_intents[]
  - differentiation_points[]
  - evidence_requirements[]
  - trust_signals[]
  - serp_features[]
  - external_source_policy
  - keyword_usage_policy
  - length_requirements{min_chars,target_chars,max_chars}

## 6) Правило использования внешнего ресерча

- research_summary/research_sources применяются для общерыночных рекомендаций.
- Внешние тезисы не приписываются компании, если их нет в source_facts.
- При конфликте источников приоритет у подтвержденных company facts и явной маркировки missing_data.

## 7) Антишаблонный чек-лист перед сохранением

- Есть ли в тексте "ограничения" и "когда не подходит"?
- Есть ли сравнение вариантов и критерии выбора?
- Есть ли ответы на follow-up (next-question intent)?
- Есть ли практическая ценность (чек-лист/пошаговые рекомендации)?
- Нет ли повторов и перефразированного шума?
- Нет ли признаков переоптимизации ключами?
