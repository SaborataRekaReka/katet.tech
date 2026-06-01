import type { ReactNode } from "react";
import Link from "next/link";
import { isAdmin } from "@/lib/seo/auth";
import { LoginForm } from "./LoginForm";
import styles from "./seo-admin.module.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "SEO-конвейер — Катет",
  robots: { index: false, follow: false },
};

export default async function SeoAdminLayout({ children }: { children: ReactNode }) {
  const allowed = await isAdmin();
  if (!allowed) {
    return (
      <div className={styles.loginWrap}>
        <div className={styles.loginCard}>
          <h1 className={styles.h1}>SEO-конвейер</h1>
          <p className={styles.muted}>Введите токен доступа.</p>
          <LoginForm />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <span className={styles.brand}>SEO-конвейер</span>
        <nav className={styles.nav}>
          <Link className={styles.navLink} href="/admin/seo">Дашборд</Link>
          <Link className={styles.navLink} href="/admin/seo/plan">Контент-план</Link>
          <Link className={styles.navLink} href="/admin/seo/articles">Статьи</Link>
          <Link className={styles.navLink} href="/admin/seo/context">Контекст</Link>
        </nav>
      </header>
      <main className={styles.container}>{children}</main>
    </div>
  );
}
