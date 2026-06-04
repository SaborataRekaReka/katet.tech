import { getAdminArticles, getAdminCategories } from "@/lib/seo/blog";
import { ArticlesManager } from "./ArticlesManager";
import styles from "../seo-admin.module.css";

export const dynamic = "force-dynamic";

export default async function ArticlesPage() {
  const [articles, categories] = await Promise.all([getAdminArticles(), getAdminCategories()]);

  return (
    <div>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.h1}>Статьи</h1>
          <p className={styles.muted}>Все материалы сайта: черновики, публикации и архив. Редактируйте, публикуйте и меняйте рубрики.</p>
        </div>
      </div>
      <ArticlesManager articles={articles} categories={categories} />
    </div>
  );
}
