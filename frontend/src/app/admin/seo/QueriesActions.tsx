"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./seo-admin.module.css";
import { CsvImportPanel } from "./semantics/CsvImportPanel";

type JobRow = {
  id: number;
  status: string;
  progress: number;
  total: number;
  error: string | null;
  log?: { message?: string }[] | null;
};

export function QueriesActions() {
  const router = useRouter();
  const [showImport, setShowImport] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ pct: number; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function poll(jobId: number) {
    const res = await fetch(`/api/seo/jobs/${jobId}/`, { cache: "no-store" });
    const job = (await res.json().catch(() => null)) as JobRow | null;
    if (!job) {
      setError("Не удалось получить статус задачи");
      setBusy(false);
      return;
    }
    const pct = job.total > 0 ? Math.round((job.progress / job.total) * 100) : 0;
    const lastLog = Array.isArray(job.log) ? job.log[job.log.length - 1]?.message : undefined;
    setProgress({ pct, message: lastLog || "Обработка…" });
    if (job.status === "done") {
      setProgress({ pct: 100, message: "Готово" });
      setBusy(false);
      router.refresh();
      return;
    }
    if (job.status === "error") {
      setError(job.error || "Ошибка обработки");
      setBusy(false);
      return;
    }
    timer.current = setTimeout(() => void poll(jobId), 1200);
  }

  async function onClusterize() {
    if (!confirm("Пересобрать кластеры с помощью ИИ? Существующие статьи останутся в разделе «Статьи».")) return;
    setBusy(true);
    setError(null);
    setProgress({ pct: 0, message: "Запуск ИИ-кластеризации…" });
    try {
      const res = await fetch("/api/seo/clusterize/", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rebuild: true }),
      });
      const data = (await res.json().catch(() => ({}))) as { jobId?: number; error?: string };
      if (!res.ok || !data.jobId) {
        setError(data.error || `Ошибка ${res.status}`);
        setBusy(false);
        return;
      }
      void poll(data.jobId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <div>
      <div className={styles.toolbarRight}>
        <button className={styles.btn} onClick={() => setShowImport((v) => !v)}>
          {showImport ? "Скрыть импорт" : "Импорт запросов"}
        </button>
        <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={onClusterize} disabled={busy}>
          {busy ? "ИИ-кластеризация…" : "ИИ-кластеризация"}
        </button>
      </div>

      {progress && (
        <div className={styles.row} style={{ marginTop: 12 }}>
          <div className={styles.progressOuter}>
            <div className={styles.progressInner} style={{ width: `${progress.pct}%` }} />
          </div>
          <span className={styles.smallMuted}>{progress.message}</span>
        </div>
      )}
      {error && <p className={styles.error} style={{ marginTop: 8 }}>{error}</p>}

      {showImport && (
        <div style={{ marginTop: 16 }}>
          <CsvImportPanel />
        </div>
      )}
    </div>
  );
}
