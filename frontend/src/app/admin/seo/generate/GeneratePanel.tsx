"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../seo-admin.module.css";
import type { GeneratableCluster } from "@/lib/seo/queries";

type JobRow = {
  id: number;
  status: string;
  progress: number;
  total: number;
  error: string | null;
  log?: { message?: string }[] | null;
};

type DraftLink = {
  id: number;
  title: string;
  url_path: string | null;
  status: string;
  cluster_id: number | null;
  cluster_name: string | null;
};

type GeneratePanelProps = {
  clusters: GeneratableCluster[];
  initialSelected?: number[];
};

export function GeneratePanel({ clusters, initialSelected = [] }: GeneratePanelProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<number[]>(() => {
    const allowed = new Set(clusters.map((cluster) => cluster.id));
    return [...new Set(initialSelected.filter((id) => Number.isFinite(id) && allowed.has(id)))];
  });
  const [count, setCount] = useState(3);
  const [busy, setBusy] = useState(false);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<DraftLink[] | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  useEffect(() => {
    if (initialSelected.length === 0) return;
    const allowed = new Set(clusters.map((cluster) => cluster.id));
    setSelected((prev) => {
      if (prev.length > 0) return prev.filter((id) => allowed.has(id));
      return [...new Set(initialSelected.filter((id) => Number.isFinite(id) && allowed.has(id)))];
    });
  }, [clusters, initialSelected]);

  function toggle(id: number) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function selectAll() {
    setSelected(selected.length === clusters.length ? [] : clusters.map((c) => c.id));
  }

  async function fetchResults(clusterIds: number[]) {
    try {
      const res = await fetch("/api/seo/articles/by-clusters/", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clusterIds }),
      });
      const data = (await res.json().catch(() => ({}))) as { drafts?: DraftLink[] };
      setResults(data.drafts ?? []);
    } catch {
      setResults([]);
    }
  }

  async function poll(jobId: number, clusterIds: number[]) {
    const res = await fetch(`/api/seo/jobs/${jobId}/`, { cache: "no-store" });
    const job = (await res.json().catch(() => null)) as JobRow | null;
    if (!job) {
      setError("Не удалось получить статус задачи");
      setBusy(false);
      return;
    }
    setProgress(job.total > 0 ? Math.round((job.progress / job.total) * 100) : 0);
    if (Array.isArray(job.log)) {
      setLogLines(job.log.map((l) => l?.message ?? "").filter(Boolean));
    }
    if (job.status === "done") {
      setProgress(100);
      setBusy(false);
      await fetchResults(clusterIds);
      router.refresh();
      return;
    }
    if (job.status === "error") {
      setError(job.error || "Ошибка генерации");
      setBusy(false);
      return;
    }
    timer.current = setTimeout(() => void poll(jobId, clusterIds), 1500);
  }

  async function onGenerate() {
    setBusy(true);
    setError(null);
    setResults(null);
    setLogLines([]);
    setProgress(0);
    const clusterIds = selected;
    const limit = clusterIds.length > 0 ? clusterIds.length : count;
    try {
      const res = await fetch("/api/seo/articles/generate-batch/", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ limit, clusterIds: clusterIds.length > 0 ? clusterIds : undefined }),
      });
      const data = (await res.json().catch(() => ({}))) as { jobId?: number; error?: string };
      if (!res.ok || !data.jobId) {
        setError(data.error || `Ошибка ${res.status}`);
        setBusy(false);
        return;
      }
      void poll(data.jobId, clusterIds);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  if (clusters.length === 0) {
    return (
      <div className={styles.tableCard}>
        <div className={styles.emptyState}>
          <p className={styles.emptyTitle}>Нет кластеров для генерации</p>
          <p>Нет кластеров без черновика. Пересоберите кластеры или создайте новые темы в «Семантике».</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className={styles.card}>
        <div className={styles.row} style={{ justifyContent: "space-between" }}>
          <div className={styles.row}>
            <label className={styles.fieldLabel} style={{ marginBottom: 0 }}>Количество статей</label>
            <input
              className={`${styles.input} ${styles.numInput}`}
              type="number"
              min={1}
              max={20}
              value={selected.length > 0 ? selected.length : count}
              disabled={selected.length > 0 || busy}
              onChange={(e) => setCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
            />
            <span className={styles.smallMuted}>
              {selected.length > 0
                ? `Выбрано кластеров: ${selected.length}`
                : "Будут выбраны лучшие незакрытые темы"}
            </span>
          </div>
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={onGenerate} disabled={busy}>
            {busy ? "Генерация…" : "Сгенерировать"}
          </button>
        </div>

        {selected.length > 0 && (
          <p className={styles.smallMuted} style={{ marginTop: 8 }}>
            Ручной режим: будут сгенерированы выбранные кластеры, даже если они не рекомендованы автоматически.
          </p>
        )}

        {(busy || progress > 0) && (
          <div className={styles.row} style={{ marginTop: 14 }}>
            <div className={styles.progressOuter}>
              <div className={styles.progressInner} style={{ width: `${progress}%` }} />
            </div>
            <span className={styles.smallMuted}>{progress}%</span>
          </div>
        )}
        {error && <p className={styles.error} style={{ marginTop: 8 }}>{error}</p>}
        {logLines.length > 0 && (
          <div className={styles.logBox} style={{ marginTop: 12 }}>
            {logLines.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
        )}

        {results && results.length > 0 && (
          <div className={styles.resultList}>
            {results.map((d) => (
              <div key={d.id} className={styles.resultItem}>
                <span className={styles.cellMain}>{d.title}</span>
                <a className={styles.iconLink} href={`/admin/seo/articles/${d.id}`}>Открыть черновик</a>
              </div>
            ))}
          </div>
        )}
        {results && results.length === 0 && !error && (
          <p className={styles.smallMuted} style={{ marginTop: 12 }}>Новых черновиков не создано.</p>
        )}
      </div>

      <div className={styles.toolbar}>
        <span className={styles.fieldLabel} style={{ marginBottom: 0 }}>Выберите кластеры (необязательно)</span>
        <button className={`${styles.btn} ${styles.btnSm}`} onClick={selectAll}>
          {selected.length === clusters.length ? "Снять выбор" : "Выбрать все"}
        </button>
      </div>

      <div className={styles.tableCard}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.checkCell}></th>
              <th>Кластер</th>
              <th>Запросов</th>
              <th>Частотность</th>
            </tr>
          </thead>
          <tbody>
            {clusters.map((c) => {
              const isSelected = selected.includes(c.id);
              return (
                <tr key={c.id} className={isSelected ? styles.rowSelected : ""}>
                  <td className={styles.checkCell}>
                    <input
                      className={styles.checkbox}
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggle(c.id)}
                    />
                  </td>
                  <td className={styles.cellMain}>{c.cluster_name || c.primary_keyword || `Кластер #${c.id}`}</td>
                  <td className={styles.num}>{c.keyword_count}</td>
                  <td className={styles.num}>{Number(c.total_frequency).toLocaleString("ru-RU")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
