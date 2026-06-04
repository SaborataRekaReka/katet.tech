# SEO-конвейер — реализация (MVP)

Автоматический конвейер SEO-материалов для katet.tech. Полностью на TypeScript внутри
Next.js-приложения (`frontend/`). Один деплой, без отдельного Python/Celery/Redis стека.

## Что делает

1. **Контекст компании** — услуги, техника, задачи, регионы, преимущества, запретные темы.
2. **Сид-запросы** — генерируются из контекста.
3. **Сбор частотности** — Wordstat (official API / CSV-импорт).
4. **Очистка и нормализация** — лемматизация, классификация интента, фильтр релевантности.
5. **Кластеризация** — группировка по интенту/сущности/региону + (опц.) LLM-нейминг.
6. **Site-gap анализ** — сверка с существующими страницами (новая / обновить / каннибализация).
7. **Скоринг и контент-план** — business_fit / seo_opportunity / readiness / risk → priority.
8. **Бриф + черновик статьи** — строго на фактах брифа, без выдумок.
9. **Публикация** — ручная, вставка в `public.posts` (status=published).

Черновики **никогда** не публикуются автоматически — публикация всегда вручную.

## Где что лежит

- SQL-схема: `directus/schema/010_seo_pipeline.sql` (схема `seo`).
- Логика: `frontend/src/lib/seo/*`.
- API: `frontend/src/app/api/seo/*`.
- Админка: `frontend/src/app/admin/seo` (роут `/admin/seo`).

## Переменные окружения (`frontend/.env.local`)

```
OPENAI_API_KEY=sk-...            # без него конвейер работает на правилах/заглушках
OPENAI_MODEL_CHEAP=gpt-4o-mini   # опц.
OPENAI_MODEL_STRONG=gpt-4o       # опц.
OPENAI_MODEL_EMBEDDING=text-embedding-3-small  # опц.
SEO_ADMIN_TOKEN=...              # токен доступа к /admin/seo (без него доступ только в dev)
WORDSTAT_API_PROVIDER=legacy     # legacy | cloud

# Legacy Wordstat endpoint (passport OAuth)
WORDSTAT_API_TOKEN=...           # опц.
WORDSTAT_CLIENT_ID=...           # опц., если используете refresh_token поток
WORDSTAT_CLIENT_SECRET=...       # опц.
WORDSTAT_REFRESH_TOKEN=...       # опц.
WORDSTAT_API_URL=...             # опц.

# Yandex Search API Cloud (рекомендуемый путь)
WORDSTAT_CLOUD_API_KEY=...       # предпочтительно
WORDSTAT_CLOUD_IAM_TOKEN=...     # альтернатива
WORDSTAT_CLOUD_FOLDER_ID=...     # обязателен для cloud-провайдера
WORDSTAT_CLOUD_ENDPOINT=https://searchapi.api.cloud.yandex.net/v2/wordstat/topRequests
WORDSTAT_CLOUD_REGION_IDS=213,1  # опц.
```

## Запуск

1. Поднять Postgres (Directus):
   ```powershell
   cd directus
   docker compose up -d postgres
   ```
2. Применить схему:
   ```powershell
   docker exec -i katet-directus-postgres psql -U katet_directus -d katet_directus -f /schema/010_seo_pipeline.sql
   ```
3. Запустить фронт:
   ```powershell
   cd frontend
   npm run dev
   ```
4. Открыть `http://localhost:3000/admin/seo`, заполнить контекст (есть пресет «Катет»),
   нажать «Начать генерацию», проверить план, сгенерировать и опубликовать статьи.

## CSV-first workflow без платного Wordstat API

1. Открыть `/admin/seo/semantics`.
2. Загрузить CSV/TSV/TXT выгрузку Wordstat или вставить строки вида `фраза;частотность`.
3. Нажать «Импортировать».
4. Нажать «Обработать семантику» — система выполнит очистку, кластеризацию и сформирует контент-план без внешнего API.
5. Проверить блок «Кластеры и покрытие».
6. Указать количество статей и нажать «Сгенерировать статьи».

Система сама выбирает лучшие незакрытые темы по приоритету. После создания черновика план получает
статус `content_generated`, а в интерфейсе кластер помечается как «контент закрыт».

## Отклонения от ТЗ (согласованы)

- **Стек**: ТЗ §31 предлагает Python/FastAPI/Celery/Redis/Qdrant. Реализовано на TypeScript
  внутри Next.js. Эмбеддинги — JSONB, кластеризация — косинус в Node, фоновые задачи —
  промисы на долгоживущем `next start` с прогрессом в таблице `seo.jobs`. Причина: один
  деплой, нет инфраструктуры под Python; для текущих объёмов запросов достаточно.
- **Авто-черновики**: ТЗ §17.1 предполагает черновик только после ручного одобрения. Здесь
  полный прогон может авто-создать черновики для топ-N кластеров (по умолчанию 5), чтобы
  оператор сразу видел готовые статьи. Публикация остаётся ручной.
- **pgvector не требуется**: эмбеддинги хранятся в JSONB, сравнение — в приложении.
