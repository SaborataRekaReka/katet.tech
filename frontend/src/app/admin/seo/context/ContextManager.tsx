"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../seo-admin.module.css";

type ContextRow = {
  id: number;
  context_type: string;
  name: string;
  description: string | null;
  is_active: boolean;
  is_allowed_for_seo: boolean;
};

export function ContextManager({ initial }: { initial: ContextRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [point, setPoint] = useState("");
  const [value, setValue] = useState("");

  async function add() {
    if (!point.trim() || !value.trim()) return;
    setBusy(true);
    try {
      await fetch("/api/seo/context", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ item: { context_type: point.trim(), name: value.trim(), description: null } }),
      });
      setPoint("");
      setValue("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function clearAll() {
    if (!window.confirm("Удалить все элементы контекста?")) return;
    setBusy(true);
    try {
      await fetch("/api/seo/context?all=1", { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    setBusy(true);
    try {
      await fetch(`/api/seo/context?id=${id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }
  const rows = [...initial].sort((a, b) => b.id - a.id);

  return (
    <div>
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Пары «поинт → значение»</h2>
        <div className={styles.row}>
          <input
            className={styles.input}
            placeholder="Поинт (например, адрес)"
            value={point}
            onChange={(e) => setPoint(e.target.value)}
          />
          <input
            className={styles.input}
            placeholder="Значение (например, Москва, ул. Ленина 1)"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={add} disabled={busy || !point.trim() || !value.trim()}>
            Добавить
          </button>
          <button className={`${styles.btn} ${styles.btnDanger}`} onClick={clearAll} disabled={busy || rows.length === 0}>
            Очистить всё
          </button>
        </div>
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Текущий контекст</h2>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Поинт</th>
              <th>Значение</th>
              <th style={{ width: 90, textAlign: "right" }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={{ fontWeight: 600 }}>{r.context_type}</td>
                <td>{r.name}</td>
                <td style={{ width: 90, textAlign: "right" }}>
                  <button className={`${styles.btn} ${styles.btnDanger}`} onClick={() => remove(r.id)} disabled={busy}>
                    Удалить
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
