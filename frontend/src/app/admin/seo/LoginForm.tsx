"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./seo-admin.module.css";

export function LoginForm() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/seo/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) {
        setError("Неверный токен");
        return;
      }
      router.refresh();
    } catch {
      setError("Ошибка сети");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={styles.formCol} onSubmit={submit}>
      <input
        className={styles.input}
        type="password"
        placeholder="SEO_ADMIN_TOKEN"
        value={token}
        onChange={(e) => setToken(e.target.value)}
        autoFocus
      />
      {error && <span className={styles.error}>{error}</span>}
      <button className={`${styles.btn} ${styles.btnPrimary}`} type="submit" disabled={busy || !token}>
        {busy ? "Вход…" : "Войти"}
      </button>
    </form>
  );
}
