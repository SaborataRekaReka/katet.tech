"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../seo-admin.module.css";
import type { SemanticsCleaningConfig } from "@/lib/seo/types";

type Job = {
  id: number;
  status: string;
  step: string | null;
  progress: number;
  total: number;
  error: string | null;
  log?: { message?: string }[];
};

export function SemanticsCleaningPanel({ initial }: { initial: SemanticsCleaningConfig }) {
  const router = useRouter();
  const [minFrequency, setMinFrequency] = useState(initial.min_frequency);
  const [requireBusinessFit, setRequireBusinessFit] = useState(initial.require_business_fit);
  const [junkWordsText, setJunkWordsText] = useState(initial.junk_words.join("\n"));
  const [busy, setBusy] = useState<"save" | "clean" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!job || job.status !== "running") return;
    pollRef.current = setInterval(async () => {
      const response = await fetch(`/api/seo/jobs/${job.id}/`);
      if (!response.ok) return;
      const next = (await response.json()) as Job;
      setJob(next);
      if (next.status !== "running") {
        if (pollRef.current) clearInterval(pollRef.current);
        router.refresh();
      }
    }, 1200);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [job, router]);

  function parseJunkWords(): string[] {
    return junkWordsText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }

  async function saveRules() {
    setBusy("save");
    setError(null);
    try {
      const response = await fetch("/api/seo/semantics/clean/", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          settings: {
            min_frequency: minFrequency,
            require_business_fit: requireBusinessFit,
            junk_words: parseJunkWords(),
          },
          run: false,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) {
        setError(data.error || `Ошибка ${response.status}`);
        return;
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function runClean() {
    if (!confirm("Запустить очистку и классификацию семантики по текущим правилам?")) return;
    setBusy("clean");
    setError(null);
    try {
      const response = await fetch("/api/seo/semantics/clean/", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          settings: {
            min_frequency: minFrequency,
            require_business_fit: requireBusinessFit,
            junk_words: parseJunkWords(),
          },
          run: true,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { ok?: boolean; jobId?: number; error?: string };
      if (!response.ok || !data.ok || !data.jobId) {
        setError(data.error || `Ошибка ${response.status}`);
        return;
      }
      setJob({
        id: data.jobId,
        status: "running",
        step: "clean",
        progress: 0,
        total: 2,
        error: null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  const pct = job && job.total > 0 ? Math.round((job.progress / job.total) * 100) : 0;
  const latest = job?.log?.[job.log.length - 1]?.message;

  return (
    <div className={styles.card}>
      <h2 className={styles.cardTitle}>Очистка семантики</h2>
      <div className={styles.formGrid}>
        <label>
          <div className={styles.fieldLabel}>Минимальная частотность</div>
          <input
            className={styles.input}
            type="number"
            min={1}
            max={100000}
            value={minFrequency}
            onChange={(event) => setMinFrequency(Math.max(1, Number(event.target.value) || 1))}
            disabled={busy !== null || job?.status === "running"}
          />
        </label>

        <label className={styles.row}>
          <input
            className={styles.checkbox}
            type="checkbox"
            checked={requireBusinessFit}
            onChange={(event) => setRequireBusinessFit(event.target.checked)}
            disabled={busy !== null || job?.status === "running"}
          />
          <span>Требовать соответствие бизнес-контексту (услуги/задачи)</span>
        </label>

        <label>
          <div className={styles.fieldLabel}>Дополнительные стоп-слова (по одному на строку)</div>
          <textarea
            className={styles.textarea}
            value={junkWordsText}
            onChange={(event) => setJunkWordsText(event.target.value)}
            placeholder="пример:\nбесплатно\nскачать"
            disabled={busy !== null || job?.status === "running"}
          />
        </label>

        <div className={styles.row}>
          <button className={styles.btn} type="button" onClick={saveRules} disabled={busy !== null || job?.status === "running"}>
            {busy === "save" ? "Сохранение..." : "Сохранить правила"}
          </button>
          <button className={`${styles.btn} ${styles.btnPrimary}`} type="button" onClick={runClean} disabled={busy !== null || job?.status === "running"}>
            {busy === "clean" || job?.status === "running" ? "Очистка..." : "Очистить"}
          </button>
        </div>

        {job && (
          <div>
            <div className={styles.row}>
              <span className={styles.badge}>{job.status === "running" ? "В работе" : job.status}</span>
              <span className={styles.smallMuted}>{job.step ?? ""}</span>
            </div>
            <div className={styles.row} style={{ marginTop: 8 }}>
              <div className={styles.progressOuter}>
                <div className={styles.progressInner} style={{ width: `${pct}%` }} />
              </div>
              <span className={styles.smallMuted}>{pct}%</span>
            </div>
            {latest && <div className={styles.smallMuted}>{latest}</div>}
          </div>
        )}

        {error && <div className={styles.error}>{error}</div>}
      </div>
    </div>
  );
}
