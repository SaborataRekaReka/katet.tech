import type { ReactNode } from "react";
import Link from "next/link";
import { directusAdminUrl } from "@/lib/admin/directusLinks";
import { AdminNav } from "./AdminNav";
import styles from "./seo-admin.module.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "SEO-конвейер — Катет",
  robots: { index: false, follow: false },
};

export default async function SeoAdminLayout({ children }: { children: ReactNode }) {
  return (
    <section className={styles.moduleRoot}>
      <header className={styles.moduleHeader}>
        <div>
          <h2 className={styles.moduleTitle}>SEO Studio</h2>
          <p className={styles.moduleLead}>Создание контента, работа с семантикой и публикациями в связке с Directus.</p>
        </div>

        <div className={styles.moduleActions}>
          <Link className={styles.moduleAction} href="/admin">К обзору админки</Link>
          <a className={styles.moduleAction} href={directusAdminUrl("/content/posts")} target="_blank" rel="noreferrer">Статьи в Directus</a>
          <a className={styles.moduleAction} href={directusAdminUrl("/content/leads")} target="_blank" rel="noreferrer">Лиды в Directus</a>
        </div>
      </header>

      <div className={styles.moduleTabsWrap}>
        <AdminNav />
      </div>

      <main className={styles.container}>{children}</main>
    </section>
  );
}
