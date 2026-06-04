"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "../seo-admin.module.css";

type JobLogEntry = {
  at: string;
  step: string;
  message: string;
};

type Job = {
  id: number;
  kind: string;
  status: string;
  step: string | null;
  progress: number;
  total: number;
  error: string | null;
  started_at: string;
  log?: JobLogEntry[];
} | null;

const STEP_LABELS: Record<string, string> = {
  clean: "Очистка",
  cluster: "Кластеризация",
  plan: "Контент-план",
  draft: "Генерация статей",
  done: "Готово",
  error: "Ошибка",
};

export function WorkflowPanel() {
  const router = useRouter();
  const [job, setJob] = useState<Job>(null);
  const [busy, setBusy] = useState<"process" | "articles" | null>(null);
  const [articleCount, setArticleCount] = useState(3);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const running = job?.status === "running";

  useEffect(() => {
    if (!running || !job) return;
    pollRef.current = setInterval(async () => {
      const res = await fetch(`/api/seo/jobs/${job.id}`);
      if (!res.ok) return;
      const next = (await res.json()) as Job;
      setJob(next);
      if (next && next.status !== "running") {
        if (pollRef.current) clearInterval(pollRef.current);
        router.refresh();
      }
    }, 1500);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [running, job, router]);

  async function start(endpoint: string, mode: "process" | "articles", body: Record<string, unknown> = {}) {
    setBusy(mode);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { jobId?: number; error?: string };
      if (!res.ok || !data.jobId) {
        alert(`Ошибка запуска: ${data.error ?? res.status}`);
        return;
      }
      setJob({
        id: data.jobId,
        kind: mode,
        status: "running",
        step: mode === "process" ? "clean" : "draft",
        progress: 0,
        total: 0,
        error: null,
        started_at: new Date().toISOString(),
      });
    } finally {
      setBusy(null);
    }
  }

  const pct = job && job.total > 0 ? Math.round((job.progress / job.total) * 100) : running ? 5 : 0;
  const latestMessage = job?.log
    ?.slice()
    .reverse()
    .find((entry) => entry.message !== "Готово")?.message;

  return (
    <div className={styles.card}>
      <h2 className={styles.cardTitle}>Рабочий процесс CSV</h2>
      <div className={styles.formCol}>
        <div className={styles.row}>
          <button
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={() => start("/api/seo/semantics/rebuild/", "process")}
            disabled={running || busy !== null}
          >
            {busy === "process" || (running && job?.kind === "process") ? "Обработка..." : "Обработать семантику"}
          </button>
          <span className={styles.smallMuted}>Очистка по вашим правилам, кластеризация и сбор контент-плана без внешнего Wordstat API.</span>
        </div>

        <div className={styles.row}>
          <button
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={() => start("/api/seo/articles/generate-batch/", "articles", { limit: articleCount })}
            disabled={running || busy !== null}
          >
            {busy === "articles" || (running && job?.kind === "articles") ? "Генерация..." : "Сгенерировать статьи"}
          </button>
          <label className={styles.smallMuted}>
            Количество: {" "}
            <input
              className={styles.input}
              style={{ minWidth: 70, width: 80 }}
              type="number"
              min={1}
              max={20}
              value={articleCount}
              onChange={(event) => setArticleCount(Math.max(1, Math.min(20, Number(event.target.value) || 1)))}
              disabled={running}
            />
          </label>
          <span className={styles.smallMuted}>Система сама берёт лучшие незакрытые темы по приоритету.</span>
        </div>
      </div>

      {job && (
        <div style={{ marginTop: 16 }}>
          <div className={styles.row}>
            <span className={styles.badge}>
              {job.status === "running" ? "В работе" : job.status === "done" ? "Завершено" : "Ошибка"}
            </span>
            <span className={styles.smallMuted}>
              {job.step ? STEP_LABELS[job.step] ?? job.step : ""}
              {job.total > 0 ? ` — ${job.progress}/${job.total}` : ""}
            </span>
          </div>
          <div className={styles.row} style={{ marginTop: 8 }}>
            <div className={styles.progressOuter}>
              <div className={styles.progressInner} style={{ width: `${pct}%` }} />
            </div>
            <span className={styles.smallMuted}>{pct}%</span>
          </div>
          {latestMessage && <p className={styles.smallMuted}>{latestMessage}</p>}
          {job.status === "done" && (job.kind === "articles" || job.kind === "article_batch") && (
            <p className={styles.smallMuted}>
              Черновики находятся в разделе <Link className={styles.link} href="/admin/seo/articles">Статьи</Link>.
            </p>
          )}
          {job.error && <p className={styles.error}>Ошибка: {job.error}</p>}
        </div>
      )}
    </div>
  );
}