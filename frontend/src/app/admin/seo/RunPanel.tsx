"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "./seo-admin.module.css";

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
  seeds: "Генерация сид-запросов",
  collect: "Сбор частотности",
  clean: "Очистка и нормализация",
  cluster: "Кластеризация",
  plan: "Контент-план и скоринг",
  draft: "Черновики статей",
  done: "Готово",
};

export function RunPanel({ lastJob, hasContext }: { lastJob: Job; hasContext: boolean }) {
  const router = useRouter();
  const [job, setJob] = useState<Job>(lastJob);
  const [autoDraftTop, setAutoDraftTop] = useState(5);
  const [busy, setBusy] = useState(false);
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

  async function start() {
    setBusy(true);
    try {
      const res = await fetch("/api/seo/pipeline/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ autoDraftTop }),
      });
      if (!res.ok) return;
      const { jobId } = (await res.json()) as { jobId: number };
      setJob({
        id: jobId,
        kind: "full_pipeline",
        status: "running",
        step: "seeds",
        progress: 0,
        total: 0,
        error: null,
        started_at: new Date().toISOString(),
      });
    } finally {
      setBusy(false);
    }
  }

  const pct = job && job.total > 0 ? Math.round((job.progress / job.total) * 100) : running ? 5 : 0;
  const latestMessage = job?.log
    ?.slice()
    .reverse()
    .find((entry) => entry.message !== "Готово")?.message;

  return (
    <div className={styles.card}>
      <h2 className={styles.cardTitle}>Запуск конвейера</h2>

      {!hasContext && (
        <p className={styles.error}>
          Сначала добавьте контекст компании — иначе конвейеру не от чего отталкиваться.
        </p>
      )}

      <div className={styles.row}>
        <button
          className={`${styles.btn} ${styles.btnPrimary}`}
          onClick={start}
          disabled={busy || running || !hasContext}
        >
          {running ? "Идёт генерация…" : "Начать генерацию"}
        </button>
        <label className={styles.smallMuted}>
          Авто-черновики для топ-N кластеров:{" "}
          <input
            className={styles.input}
            style={{ minWidth: 70, width: 70 }}
            type="number"
            min={0}
            max={20}
            value={autoDraftTop}
            onChange={(e) => setAutoDraftTop(Number(e.target.value))}
            disabled={running}
          />
        </label>
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
          {job.status === "done" && (
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
