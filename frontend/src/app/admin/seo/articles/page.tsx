import Link from "next/link";
import { getArticles, type ArticleListItem } from "@/lib/seo/queries";
import styles from "../seo-admin.module.css";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, string> = {
  draft: styles.badgeGray,
  needs_review: styles.badgeAmber,
  approved: styles.badgeBlue,
  published: styles.badgeGreen,
  rejected: styles.badgeRed,
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Черновик",
  needs_review: "На проверке",
  approved: "Одобрено",
  published: "Опубликовано",
  rejected: "Отклонено",
};

export default async function ArticlesPage() {
  const items: ArticleListItem[] = await getArticles();
  return (
    <div>
      <h1 className={styles.h1}>Статьи</h1>
      <p className={styles.muted}>Черновики, сгенерированные конвейером. Отредактируйте и опубликуйте на сайт.</p>

      {items.length === 0 ? (
        <div className={styles.card}>Пока нет статей. Сгенерируйте их из контент-плана.</div>
      ) : (
        <div className={styles.card}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Заголовок</th>
                <th>URL</th>
                <th>Статус</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => (
                <tr key={a.id}>
                  <td style={{ fontWeight: 600 }}>{a.title ?? `#${a.id}`}</td>
                  <td className={styles.smallMuted}>{a.url_path ?? a.slug ?? "—"}</td>
                  <td>
                    <span className={`${styles.badge} ${STATUS_BADGE[a.status] ?? styles.badgeGray}`}>
                      {STATUS_LABEL[a.status] ?? a.status}
                    </span>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <Link className={styles.link} href={`/admin/seo/articles/${a.id}`}>
                      Открыть
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
