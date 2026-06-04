"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../seo-admin.module.css";

export function PurgeMockButton({ hasMock }: { hasMock: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function purge() {
    if (!hasMock) return;
    const ok = window.confirm(
      "Удалить mock-данные семантики?\n\nЭто удалит raw mock-запросы и сбросит производные артефакты (кластеры, контент-план, брифы, статьи), чтобы пересобрать их из реальных данных.",
    );
    if (!ok) return;

    setBusy(true);
    try {
      const response = await fetch("/api/seo/semantics/purge-mock/", {
        method: "POST",
        headers: { "content-type": "application/json" },
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        removedRawMock?: number;
      };
      if (!response.ok) {
        alert(`Ошибка: ${data.error ?? response.status}`);
        return;
      }
      alert(`Готово: удалено mock raw-запросов: ${data.removedRawMock ?? 0}`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button className={`${styles.btn} ${styles.btnDanger}`} onClick={purge} disabled={busy || !hasMock}>
      {busy ? "Удаление..." : "Удалить mock-данные"}
    </button>
  );
}
