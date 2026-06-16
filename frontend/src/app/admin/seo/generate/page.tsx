import { getGeneratableClusters } from "@/lib/seo/queries";
import { GeneratePanel } from "./GeneratePanel";
import styles from "../seo-admin.module.css";

export const dynamic = "force-dynamic";

export default async function GeneratePage({
  searchParams,
}: {
  searchParams: Promise<{ clusterId?: string | string[] }>;
}) {
  const clusters = await getGeneratableClusters();
  const params = await searchParams;
  const initialSelected = Array.isArray(params.clusterId)
    ? params.clusterId.map((value) => Number(value)).filter((value) => Number.isFinite(value))
    : Number.isFinite(Number(params.clusterId))
      ? [Number(params.clusterId)]
      : [];

  return (
    <div>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.h1}>Генерация</h1>
          <p className={styles.muted}>Выберите кластеры или укажите количество — система создаст черновики статей.</p>
        </div>
      </div>
      <GeneratePanel clusters={clusters} initialSelected={initialSelected} />
    </div>
  );
}
