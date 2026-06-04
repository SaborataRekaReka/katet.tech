import { getSemanticsCleaningConfig, getWordstatConfig } from "@/lib/seo/settings";
import {
  getSemanticsClustersList,
  getNormalizedKeywordsList,
  getRawKeywordsList,
  getSemanticsStats,
  type NormalizedKeywordListItem,
  type RawKeywordListItem,
  type SemanticsClusterListItem,
} from "@/lib/seo/queries";
import styles from "../seo-admin.module.css";
import { PurgeMockButton } from "./PurgeMockButton";
import { CsvImportPanel } from "./CsvImportPanel";
import { WorkflowPanel } from "./WorkflowPanel";
import { SemanticsCleaningPanel } from "./SemanticsCleaningPanel";

export const dynamic = "force-dynamic";

type SearchParams = {
  q?: string;
  source?: string;
  relevance?: string;
  limit?: string;
};

function badgeForSource(source: string): string {
  if (source === "wordstat_api") return styles.badgeBlue;
  if (source === "csv") return styles.badgeGreen;
  if (source === "mock") return styles.badgeRed;
  return styles.badgeGray;
}

function badgeForRelevance(row: NormalizedKeywordListItem): string {
  if (row.is_relevant === true) return styles.badgeGreen;
  if (row.is_relevant === false) return styles.badgeRed;
  return styles.badgeGray;
}

function badgeForPlanStatus(status: string | null, hasArticle: boolean): string {
  if (hasArticle || status === "content_generated" || status === "published") return styles.badgeGreen;
  if (status === "pending_review") return styles.badgeAmber;
  if (status === "ready_for_brief" || status === "brief_created") return styles.badgeBlue;
  if (status === "rejected") return styles.badgeRed;
  return styles.badgeGray;
}

function labelForPlanStatus(status: string | null, hasArticle: boolean): string {
  if (hasArticle || status === "content_generated") return "контент закрыт";
  if (status === "published") return "опубликовано";
  if (status === "pending_review") return "на проверке";
  if (status === "ready_for_brief") return "одобрено";
  if (status === "brief_created") return "ТЗ создано";
  if (status === "rejected") return "отклонено";
  return status ?? "нет плана";
}

export default async function SemanticsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const source = (params.source ?? "all").trim().toLowerCase();
  const relevance = (params.relevance ?? "all").trim().toLowerCase();
  const limitRaw = Number.parseInt(params.limit ?? "200", 10);
  const limit = Number.isFinite(limitRaw) ? Math.max(20, Math.min(1000, limitRaw)) : 200;

  const [config, cleaningConfig, stats, rawRows, normRows] = await Promise.all([
    getWordstatConfig(),
    getSemanticsCleaningConfig(),
    getSemanticsStats(),
    getRawKeywordsList({ q, source, limit }),
    getNormalizedKeywordsList({ q, source, relevance, limit }),
  ]);
  const clusterRows = await getSemanticsClustersList(Math.min(limit, 200));

  return (
    <div>
      <h1 className={styles.h1}>Семантика</h1>
      <p className={styles.muted}>
        Просмотр сырой и нормализованной семантики, фильтрация по источнику и релевантности.
      </p>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Сводка</h2>
        <div className={styles.row} style={{ marginBottom: 10 }}>
          <span className={`${styles.badge} ${styles.badgeBlue}`}>mode: {config.mode}</span>
          <span className={`${styles.badge} ${styles.badgeGray}`}>raw: {stats.rawTotal}</span>
          <span className={`${styles.badge} ${styles.badgeBlue}`}>wordstat_api: {stats.rawWordstatApi}</span>
          <span className={`${styles.badge} ${styles.badgeGreen}`}>csv: {stats.rawCsv}</span>
          <span className={`${styles.badge} ${styles.badgeRed}`}>mock: {stats.rawMock}</span>
          <span className={`${styles.badge} ${styles.badgeGray}`}>normalized: {stats.normalizedTotal}</span>
          <span className={`${styles.badge} ${styles.badgeGreen}`}>relevant: {stats.normalizedRelevant}</span>
          <span className={`${styles.badge} ${styles.badgeRed}`}>irrelevant: {stats.normalizedIrrelevant}</span>
          <span className={`${styles.badge} ${styles.badgeGray}`}>clusters: {stats.clustersTotal}</span>
          <span className={`${styles.badge} ${styles.badgeBlue}`}>plan: {stats.planItems}</span>
          <span className={`${styles.badge} ${styles.badgeGreen}`}>closed: {stats.contentClosed}</span>
        </div>
        <div className={styles.row}>
          <PurgeMockButton hasMock={stats.rawMock > 0} />
          <span className={styles.smallMuted}>
            Кнопка удаляет mock raw-запросы и сбрасывает производные артефакты, чтобы пересобрать их из реальных данных.
          </span>
        </div>
      </div>

      <form className={styles.card} method="get">
        <h2 className={styles.cardTitle}>Фильтры</h2>
        <div className={styles.row}>
          <input
            className={styles.input}
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Поиск по фразе / seed"
          />

          <select className={styles.select} name="source" defaultValue={source}>
            <option value="all">Источник: все</option>
            <option value="wordstat_api">Источник: Wordstat API</option>
            <option value="csv">Источник: CSV</option>
            <option value="mock">Источник: mock</option>
          </select>

          <select className={styles.select} name="relevance" defaultValue={relevance}>
            <option value="all">Релевантность: все</option>
            <option value="relevant">Релевантные</option>
            <option value="irrelevant">Нерелевантные</option>
          </select>

          <input
            className={styles.input}
            type="number"
            min={20}
            max={1000}
            step={20}
            name="limit"
            defaultValue={String(limit)}
            placeholder="Лимит"
          />

          <button className={`${styles.btn} ${styles.btnPrimary}`} type="submit">
            Применить
          </button>
          <a className={styles.btn} href="/admin/seo/semantics">
            Сбросить
          </a>
        </div>
      </form>

      <CsvImportPanel />

      <SemanticsCleaningPanel initial={cleaningConfig} />

      <WorkflowPanel />

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Кластеры и покрытие</h2>
        {clusterRows.length === 0 ? (
          <div className={styles.smallMuted}>Пока нет кластеров. Импортируйте выгрузку и нажмите «Обработать семантику».</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Кластер</th>
                <th>Главный запрос</th>
                <th>Интент</th>
                <th>Фраз</th>
                <th>Частотность</th>
                <th>Приоритет</th>
                <th>Покрытие</th>
              </tr>
            </thead>
            <tbody>
              {clusterRows.map((row: SemanticsClusterListItem) => (
                <tr key={row.id}>
                  <td style={{ fontWeight: 600 }}>{row.cluster_name ?? `#${row.id}`}</td>
                  <td>{row.primary_keyword ?? "—"}</td>
                  <td>{row.main_intent ?? "—"}</td>
                  <td>{row.keyword_count}</td>
                  <td>{row.total_frequency}</td>
                  <td>{row.priority ?? "—"}</td>
                  <td>
                    <span className={`${styles.badge} ${badgeForPlanStatus(row.plan_status, row.has_article)}`}>
                      {labelForPlanStatus(row.plan_status, row.has_article)}
                    </span>
                    {row.article_id && (
                      <div style={{ marginTop: 6 }}>
                        <a className={styles.link} href={`/admin/seo/articles/${row.article_id}`}>
                          Открыть статью
                        </a>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Сырые запросы (raw_keywords)</h2>
        {rawRows.length === 0 ? (
          <div className={styles.smallMuted}>Нет данных по текущему фильтру.</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>ID</th>
                <th>Источник</th>
                <th>Seed</th>
                <th>Фраза</th>
                <th>Частотность</th>
                <th>Регион</th>
              </tr>
            </thead>
            <tbody>
              {rawRows.map((row: RawKeywordListItem) => (
                <tr key={row.id}>
                  <td>{row.id}</td>
                  <td>
                    <span className={`${styles.badge} ${badgeForSource(row.source)}`}>{row.source}</span>
                  </td>
                  <td>{row.seed_term ?? "—"}</td>
                  <td style={{ fontWeight: 600 }}>{row.keyword}</td>
                  <td>{row.frequency ?? "—"}</td>
                  <td>{row.region ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Нормализованные запросы (normalized_keywords)</h2>
        {normRows.length === 0 ? (
          <div className={styles.smallMuted}>Нет данных по текущему фильтру.</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>ID</th>
                <th>Источник</th>
                <th>Фраза</th>
                <th>normalized</th>
                <th>Интент</th>
                <th>Релевантность</th>
                <th>Причина</th>
                <th>Частотность</th>
              </tr>
            </thead>
            <tbody>
              {normRows.map((row: NormalizedKeywordListItem) => (
                <tr key={row.id}>
                  <td>{row.id}</td>
                  <td>
                    <span className={`${styles.badge} ${badgeForSource(row.raw_source ?? "")}`}>
                      {row.raw_source ?? "—"}
                    </span>
                  </td>
                  <td style={{ fontWeight: 600 }}>{row.keyword}</td>
                  <td>{row.normalized_keyword}</td>
                  <td>{row.detected_intent ?? "—"}</td>
                  <td>
                    <span className={`${styles.badge} ${badgeForRelevance(row)}`}>
                      {row.is_relevant === true ? "relevant" : row.is_relevant === false ? "irrelevant" : "unknown"}
                    </span>
                  </td>
                  <td>{row.irrelevance_reason ?? "—"}</td>
                  <td>{row.frequency}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
