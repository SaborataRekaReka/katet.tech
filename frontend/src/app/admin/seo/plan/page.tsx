import { getPlanItems, type PlanListItem } from "@/lib/seo/queries";
import { PlanTable } from "./PlanTable";
import styles from "../seo-admin.module.css";

export const dynamic = "force-dynamic";

const FILTERS: { key: string; label: string }[] = [
  { key: "pending_review", label: "На проверке" },
  { key: "ready_for_brief", label: "Одобрено" },
  { key: "rejected", label: "Отклонено" },
  { key: "all", label: "Все" },
];

export default async function PlanPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status = "pending_review" } = await searchParams;
  const items: PlanListItem[] = await getPlanItems(status);

  return (
    <div>
      <h1 className={styles.h1}>Контент-план</h1>
      <p className={styles.muted}>
        Предложения конвейера по кластерам запросов. Проверьте, одобрите и сгенерируйте статьи.
      </p>

      <div className={styles.row} style={{ marginBottom: 16 }}>
        {FILTERS.map((f) => (
          <a
            key={f.key}
            href={`/admin/seo/plan?status=${f.key}`}
            className={`${styles.btn} ${status === f.key ? styles.btnPrimary : ""}`}
          >
            {f.label}
          </a>
        ))}
      </div>

      {items.length === 0 ? (
        <div className={styles.card}>Пока нет предложений. Запустите генерацию на дашборде.</div>
      ) : (
        <PlanTable items={items} />
      )}
    </div>
  );
}
