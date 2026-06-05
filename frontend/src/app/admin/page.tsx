import Link from "next/link";
import { query } from "@/lib/db";
import { directusAdminUrl, getDirectusAdminLinks } from "@/lib/admin/directusLinks";
import { getDashboardStats } from "@/lib/seo/queries";
import styles from "./admin-shell.module.css";

export const dynamic = "force-dynamic";

type LeadStats = {
  total: number;
  newCount: number;
  recentCount: number;
};

type ContentStats = {
  pages: number;
  posts: number;
  equipment: number;
  reviews: number;
};

function asNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

async function getLeadStats(): Promise<LeadStats> {
  const rows = await query<{ total: string; new_count: string; recent_count: string }>(
    `
      SELECT
        COUNT(*)::text AS total,
        COUNT(*) FILTER (WHERE status = 'new')::text AS new_count,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours')::text AS recent_count
      FROM leads
    `,
  );

  const row = rows[0];
  return {
    total: asNumber(row?.total),
    newCount: asNumber(row?.new_count),
    recentCount: asNumber(row?.recent_count),
  };
}

async function getContentStats(): Promise<ContentStats> {
  const rows = await query<{ pages: string; posts: string; equipment: string; reviews: string }>(
    `
      SELECT
        (SELECT COUNT(*)::text FROM pages) AS pages,
        (SELECT COUNT(*)::text FROM posts) AS posts,
        (SELECT COUNT(*)::text FROM equipment_items) AS equipment,
        (SELECT COUNT(*)::text FROM reviews) AS reviews
    `,
  );

  const row = rows[0];
  return {
    pages: asNumber(row?.pages),
    posts: asNumber(row?.posts),
    equipment: asNumber(row?.equipment),
    reviews: asNumber(row?.reviews),
  };
}

export default async function AdminHomePage() {
  const [leadStats, contentStats, seoStats] = await Promise.all([
    getLeadStats(),
    getContentStats(),
    getDashboardStats().catch(() => null),
  ]);

  const directusLinks = getDirectusAdminLinks();

  return (
    <div>
      <section className={styles.pageHead}>
        <div>
          <h2 className={styles.pageTitle}>Рабочее пространство</h2>
          <p className={styles.pageLead}>
            SEO-модуль теперь встроен в общую админку: планируйте контент, генерируйте материалы и сразу переходите в Directus для публикации и операционной работы с заявками.
          </p>
        </div>
        <div className={styles.quickActions}>
          <Link className={styles.quickAction} href="/admin/seo">Открыть SEO Studio</Link>
          <Link className={styles.quickAction} href="/admin/seo/generate">Запустить генерацию</Link>
          <a className={styles.quickAction} href={directusAdminUrl()} target="_blank" rel="noreferrer">Открыть Directus</a>
        </div>
      </section>

      <section className={styles.grid}>
        <article className={styles.statCard}>
          <div className={styles.statValue}>{leadStats.total}</div>
          <div className={styles.statLabel}>Всего лидов</div>
        </article>
        <article className={styles.statCard}>
          <div className={styles.statValue}>{leadStats.newCount}</div>
          <div className={styles.statLabel}>Новые лиды</div>
        </article>
        <article className={styles.statCard}>
          <div className={styles.statValue}>{leadStats.recentCount}</div>
          <div className={styles.statLabel}>Лидов за 24 часа</div>
        </article>
        <article className={styles.statCard}>
          <div className={styles.statValue}>{contentStats.posts}</div>
          <div className={styles.statLabel}>Постов в базе</div>
        </article>
        <article className={styles.statCard}>
          <div className={styles.statValue}>{contentStats.pages}</div>
          <div className={styles.statLabel}>Страниц в базе</div>
        </article>
        <article className={styles.statCard}>
          <div className={styles.statValue}>{seoStats?.planPending ?? 0}</div>
          <div className={styles.statLabel}>SEO задач на ревью</div>
        </article>
      </section>

      <section className={styles.cards}>
        <article className={styles.card}>
          <h3 className={styles.cardTitle}>SEO Studio</h3>
          <p className={styles.cardText}>Семантика, кластеры, генерация и редактура статей в одном потоке.</p>
          <div className={styles.linkList}>
            <Link className={styles.linkItem} href="/admin/seo">
              <span>Запросы и кластеризация</span>
              <span className={styles.linkItemDesc}>{seoStats?.clusters ?? 0} кластеров</span>
            </Link>
            <Link className={styles.linkItem} href="/admin/seo/semantics">
              <span>Семантика и очистка</span>
              <span className={styles.linkItemDesc}>{seoStats?.rawKeywords ?? 0} raw запросов</span>
            </Link>
            <Link className={styles.linkItem} href="/admin/seo/articles">
              <span>Черновики и публикации</span>
              <span className={styles.linkItemDesc}>{seoStats?.drafts ?? 0} черновиков</span>
            </Link>
          </div>
        </article>

        <article className={styles.card}>
          <h3 className={styles.cardTitle}>Directus контент</h3>
          <p className={styles.cardText}>Операционные коллекции и медиа-управление открываются в отдельной вкладке Directus.</p>
          <div className={styles.linkList}>
            {directusLinks.map((link) => (
              <a key={link.id} className={styles.linkItem} href={link.href} target="_blank" rel="noreferrer">
                <span>{link.label}</span>
                <span className={styles.linkItemDesc}>{link.description}</span>
              </a>
            ))}
          </div>
        </article>

        <article className={styles.card}>
          <h3 className={styles.cardTitle}>Сводка контента</h3>
          <p className={styles.cardText}>Быстрый контроль покрытия контентных сущностей в мигрированной базе.</p>
          <div className={styles.linkList}>
            <a className={styles.linkItem} href={directusAdminUrl("/content/pages")} target="_blank" rel="noreferrer">
              <span>Страницы</span>
              <span className={styles.linkItemDesc}>{contentStats.pages}</span>
            </a>
            <a className={styles.linkItem} href={directusAdminUrl("/content/posts")} target="_blank" rel="noreferrer">
              <span>Статьи</span>
              <span className={styles.linkItemDesc}>{contentStats.posts}</span>
            </a>
            <a className={styles.linkItem} href={directusAdminUrl("/content/equipment_items")} target="_blank" rel="noreferrer">
              <span>Техника</span>
              <span className={styles.linkItemDesc}>{contentStats.equipment}</span>
            </a>
            <a className={styles.linkItem} href={directusAdminUrl("/content/reviews")} target="_blank" rel="noreferrer">
              <span>Отзывы</span>
              <span className={styles.linkItemDesc}>{contentStats.reviews}</span>
            </a>
          </div>
        </article>
      </section>
    </div>
  );
}
