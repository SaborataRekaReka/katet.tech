import { getAdminQueriesPage, getClusterTargets } from "@/lib/seo/queries";
import { QueriesActions } from "./QueriesActions";
import styles from "./seo-admin.module.css";
import { QueriesTableManager } from "./QueriesTableManager";

export const dynamic = "force-dynamic";

type SearchParams = {
  q?: string;
  page?: string;
  pageSize?: string;
};

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.trunc(value));
}

export default async function QueriesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const page = parsePositiveInt(params.page, 1);
  const pageSize = Math.min(300, parsePositiveInt(params.pageSize, 100));

  const [queriesPage, clusterTargets] = await Promise.all([
    getAdminQueriesPage({ q, page, pageSize }),
    getClusterTargets(500),
  ]);

  return (
    <div>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.h1}>Запросы</h1>
          <p className={styles.muted}>Общий пул запросов (сначала последние импортированные). Импортируйте таблицу и запустите кластеризацию.</p>
        </div>
        <QueriesActions />
      </div>

      <QueriesTableManager
        rows={queriesPage.items}
        total={queriesPage.total}
        page={queriesPage.page}
        pageSize={queriesPage.pageSize}
        totalPages={queriesPage.totalPages}
        q={q}
        clusterTargets={clusterTargets}
      />
    </div>
  );
}
