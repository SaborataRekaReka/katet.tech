import { getGeneratableClusters } from "@/lib/seo/queries";
import { GeneratePanel } from "./GeneratePanel";
import styles from "../seo-admin.module.css";

export const dynamic = "force-dynamic";

export default async function GeneratePage() {
  const clusters = await getGeneratableClusters();

  return (
    <div>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.h1}>Генерация</h1>
          <p className={styles.muted}>Выберите кластеры или укажите количество — система создаст черновики статей.</p>
        </div>
      </div>
      <GeneratePanel clusters={clusters} />
    </div>
  );
}
