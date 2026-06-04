import Link from "next/link";
import { getSemanticsClustersList, getSiteIndexStats } from "@/lib/seo/queries";
import { CONTENT_STATUS } from "../_status";
import type { ContentStatus } from "@/lib/seo/queries";
import { ClusterKeywordsPanel } from "./ClusterKeywordsPanel";
import styles from "../seo-admin.module.css";

export const dynamic = "force-dynamic";

function clusterStatus(planStatus: string | null, hasArticle: boolean): ContentStatus {
  if (hasArticle || planStatus === "content_generated" || planStatus === "published") return "created";
  if (!planStatus || planStatus === "rejected" || planStatus === "needs_more_data") {
    return planStatus === "rejected" || planStatus === "needs_more_data" ? "not_recommended" : "awaiting";
  }
  return "awaiting";
}

function coverageMeta(cluster: Awaited<ReturnType<typeof getSemanticsClustersList>>[number]) {
  if (cluster.has_article) {
    return { label: "Закрыт статьёй", badge: "badgeGreen" as const };
  }
  if ((cluster.coverage_score ?? 0) >= 0.5 && cluster.target_existing_url) {
    return { label: "Покрыт страницей", badge: "badgeBlue" as const };
  }
  if ((cluster.coverage_score ?? 0) >= 0.3 || cluster.related_pages.length > 0) {
    return { label: "Частично покрыт", badge: "badgeAmber" as const };
  }
  return { label: "Новая тема", badge: "badgeGray" as const };
}

function sourceLabel(source: string): string {
  switch (source) {
    case "page":
      return "Страница";
    case "post":
      return "Статья";
    case "equipment_type":
      return "Услуга";
    case "work_type":
      return "Тип работ";
    case "brand":
      return "Категория";
    default:
      return source;
  }
}

export default async function ClustersPage() {
  const clusters = await getSemanticsClustersList(300);
  const indexStats = await getSiteIndexStats();

  return (
    <div>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.h1}>Кластеры</h1>
          <p className={styles.muted}>Группы запросов, объединённые по смыслу. На их основе создаются статьи.</p>
        </div>
        <Link className={`${styles.btn} ${styles.btnPrimary}`} href="/admin/seo/generate">
          Сгенерировать статьи
        </Link>
      </div>

      <div className={styles.indexInfoCard}>
        <div className={styles.indexInfoTitle}>Индекс SEO-материалов сайта</div>
        <div className={styles.indexInfoGrid}>
          <div><span className={styles.indexInfoLabel}>Всего</span><span className={styles.indexInfoValue}>{indexStats.total}</span></div>
          <div><span className={styles.indexInfoLabel}>Страницы</span><span className={styles.indexInfoValue}>{indexStats.pages}</span></div>
          <div><span className={styles.indexInfoLabel}>Статьи</span><span className={styles.indexInfoValue}>{indexStats.posts}</span></div>
          <div><span className={styles.indexInfoLabel}>Услуги</span><span className={styles.indexInfoValue}>{indexStats.equipmentTypes}</span></div>
          <div><span className={styles.indexInfoLabel}>Типы работ</span><span className={styles.indexInfoValue}>{indexStats.workTypes}</span></div>
          <div><span className={styles.indexInfoLabel}>Категории</span><span className={styles.indexInfoValue}>{indexStats.brands}</span></div>
        </div>
      </div>

      {clusters.length === 0 ? (
        <div className={styles.tableCard}>
          <div className={styles.emptyState}>
            <p className={styles.emptyTitle}>Кластеров пока нет</p>
            <p>Импортируйте запросы и запустите кластеризацию во вкладке «Запросы».</p>
          </div>
        </div>
      ) : (
        <div className={styles.tableCard}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Кластер</th>
                <th>Запросов</th>
                <th>Частотность</th>
                <th>Статус</th>
                <th>Покрытие</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {clusters.map((c) => {
                const status = clusterStatus(c.plan_status, c.has_article);
                const meta = CONTENT_STATUS[status];
                const coverage = coverageMeta(c);
                return (
                  <tr key={c.id} id={`cluster-${c.id}`}>
                    <td>
                      <div className={styles.cellMain}>{c.cluster_name || c.primary_keyword || `Кластер #${c.id}`}</div>
                      {c.primary_keyword && c.cluster_name && c.primary_keyword !== c.cluster_name && (
                        <div className={styles.cellSub}>{c.primary_keyword}</div>
                      )}
                      {c.related_pages.length > 0 && (
                        <div className={styles.relatedList}>
                          {c.related_pages.slice(0, 3).map((page) => (
                            <div key={`${c.id}-${page.url}`} className={styles.relatedItem}>
                              <span className={`${styles.badge} ${styles.badgeGray}`}>{sourceLabel(page.source)}</span>
                              <a className={styles.iconLink} href={page.url} target="_blank" rel="noreferrer">
                                {page.title || page.url}
                              </a>
                              <span className={styles.relatedScore}>релевантность {Math.round(page.score * 100)}%</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <ClusterKeywordsPanel clusterId={c.id} />
                    </td>
                    <td className={styles.num}>{c.keyword_count}</td>
                    <td className={styles.num}>{Number(c.total_frequency).toLocaleString("ru-RU")}</td>
                    <td>
                      <span className={`${styles.badge} ${styles[meta.badge]}`}>{meta.label}</span>
                    </td>
                    <td>
                      <span className={`${styles.badge} ${styles[coverage.badge]}`}>{coverage.label}</span>
                      {c.target_existing_url && (
                        <div className={styles.cellSub}>
                          <a className={styles.iconLink} href={c.target_existing_url} target="_blank" rel="noreferrer">
                            Основная страница
                          </a>
                        </div>
                      )}
                    </td>
                    <td>
                      <div className={styles.rowActions}>
                        {c.has_article && c.article_id ? (
                          <Link className={styles.iconLink} href={`/admin/seo/articles/${c.article_id}`}>
                            Статья
                          </Link>
                        ) : (
                          <Link className={styles.iconLink} href="/admin/seo/generate">
                            Создать статью
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
