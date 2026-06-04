import type { ReactNode } from "react";
import { isAdmin } from "@/lib/seo/auth";
import { LoginForm } from "./LoginForm";
import { AdminNav } from "./AdminNav";
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
        <AdminNav />
      </header>
      <main className={styles.container}>{children}</main>
    </div>
  );
}
