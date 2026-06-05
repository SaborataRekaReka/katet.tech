import type { ReactNode } from "react";
import { isAdmin } from "@/lib/seo/auth";
import { LoginForm } from "./seo/LoginForm";
import { AdminHubNav } from "./AdminHubNav";
import styles from "./admin-shell.module.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Админка — Катет",
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const allowed = await isAdmin();

  if (!allowed) {
    return (
      <div className={styles.loginWrap}>
        <div className={styles.loginCard}>
          <h1 className={styles.loginTitle}>Катет Admin</h1>
          <p className={styles.loginText}>Введите SEO токен, чтобы открыть рабочее пространство контента.</p>
          <LoginForm />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.topbarInner}>
          <div className={styles.brandWrap}>
            <h1 className={styles.brand}>Катет Admin</h1>
            <p className={styles.brandMuted}>Контент, SEO-конвейер и заявки</p>
          </div>
          <AdminHubNav />
        </div>
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
