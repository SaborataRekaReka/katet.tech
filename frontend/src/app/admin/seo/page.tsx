import Link from "next/link";
import { getDashboardStats } from "@/lib/seo/queries";
import { llmEnabled } from "@/lib/seo/openai";
import { RunPanel } from "./RunPanel";
import styles from "./seo-admin.module.css";

export const dynamic = "force-dynamic";

export default async function SeoDashboardPage() {
  const stats = await getDashboardStats();
  const aiOn = llmEnabled;

  const cards: { label: string; value: number }[] = [
    { label: "Контекст компании", value: stats.context },
    { label: "Сид-запросы", value: stats.seeds },
    { label: "Собрано фраз", value: stats.rawKeywords },
    { label: "После очистки", value: stats.normalized },
    { label: "Кластеры", value: stats.clusters },
    { label: "На проверке", value: stats.planPending },
    { label: "Черновики", value: stats.drafts },
    { label: "Опубликовано", value: stats.published },
  ];

  return (
    <div>
      <h1 className={styles.h1}>Дашборд</h1>
      <p className={styles.muted}>
        Автоматический конвейер SEO-материалов: сбор запросов → кластеризация → контент-план → черновики статей.
      </p>

      {!aiOn && (
        <div className={`${styles.card}`} style={{ borderColor: "#f3d99b", background: "#fffaf0" }}>
          <strong>OPENAI_API_KEY не задан.</strong> Конвейер работает на правилах и заглушках: кластеризация,
          скоринг и черновики формируются эвристически. Для качественной генерации добавьте ключ в окружение.
        </div>
      )}

      <div className={styles.grid}>
        {cards.map((c) => (
          <div key={c.label} className={styles.stat}>
            <div className={styles.statNum}>{c.value}</div>
            <div className={styles.statLabel}>{c.label}</div>
          </div>
        ))}
      </div>

      <RunPanel lastJob={stats.lastJob} hasContext={stats.context > 0} />

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Что дальше</h2>
        <div className={styles.formCol}>
          <span>
            1. Проверьте <Link className={styles.link} href="/admin/seo/context">контекст компании</Link> — на нём строятся все запросы.
          </span>
          <span>
            2. Нажмите «Начать генерацию» — конвейер соберёт фразы, разложит по кластерам и предложит план.
          </span>
          <span>
            3. Откройте <Link className={styles.link} href="/admin/seo/plan">контент-план</Link>, проверьте предложения и сгенерируйте статьи.
          </span>
          <span>
            4. В разделе <Link className={styles.link} href="/admin/seo/articles">статьи</Link> отредактируйте черновик и опубликуйте на сайт.
          </span>
        </div>
      </div>
    </div>
  );
}
