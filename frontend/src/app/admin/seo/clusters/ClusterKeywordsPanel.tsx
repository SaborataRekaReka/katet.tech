"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import styles from "../seo-admin.module.css";

type ClusterKeywordItem = {
  keyword_id: number;
  keyword: string;
  frequency: number;
  role: string;
};

type ClusterKeywordsResponse = {
  keywords: ClusterKeywordItem[];
};

export function ClusterKeywordsPanel({ clusterId }: { clusterId: number }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keywords, setKeywords] = useState<ClusterKeywordItem[] | null>(null);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [refreshing, startRefresh] = useTransition();

  async function loadKeywords() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/seo/clusters/${clusterId}/keywords/`, { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as ClusterKeywordsResponse & { error?: string };
      if (!res.ok) {
        setError(data.error || `Ошибка ${res.status}`);
        return;
      }
      setKeywords(Array.isArray(data.keywords) ? data.keywords : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function onToggle() {
    if (!expanded && keywords === null) await loadKeywords();
    setExpanded((prev) => !prev);
  }

  async function onRemove(keywordId: number) {
    if (!confirm("Убрать этот запрос из кластера?")) return;
    setRemovingId(keywordId);
    setError(null);
    try {
      const res = await fetch(`/api/seo/clusters/${clusterId}/keywords/`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ keywordId }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error || `Ошибка ${res.status}`);
        return;
      }
      setKeywords((prev) => (prev ?? []).filter((item) => item.keyword_id !== keywordId));
      startRefresh(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className={styles.clusterQueriesWrap}>
      <button className={`${styles.btn} ${styles.btnSm}`} type="button" onClick={() => void onToggle()}>
        {expanded ? "Скрыть запросы" : "Показать запросы"}
      </button>

      {expanded && (
        <div className={styles.clusterQueriesBox}>
          {loading && <div className={styles.smallMuted}>Загрузка запросов...</div>}
          {error && <div className={styles.error}>{error}</div>}

          {!loading && !error && (keywords?.length ?? 0) === 0 && (
            <div className={styles.smallMuted}>В кластере нет запросов.</div>
          )}

          {!loading && !error && (keywords?.length ?? 0) > 0 && (
            <ul className={styles.clusterQueriesList}>
              {(keywords ?? []).map((item) => (
                <li key={item.keyword_id} className={styles.clusterQueriesItem}>
                  <div>
                    <div className={styles.cellMain}>{item.keyword}</div>
                    <div className={styles.cellSub}>
                      частотность {item.frequency.toLocaleString("ru-RU")} {item.role !== "secondary" ? `· ${item.role}` : ""}
                    </div>
                  </div>
                  <button
                    className={`${styles.btn} ${styles.btnSm} ${styles.btnDanger}`}
                    type="button"
                    onClick={() => void onRemove(item.keyword_id)}
                    disabled={removingId === item.keyword_id || refreshing}
                  >
                    {removingId === item.keyword_id ? "Убираем..." : "Убрать"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
