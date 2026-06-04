"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../seo-admin.module.css";
import { articleStatusMeta } from "../_status";
import type { AdminArticle, BlogCategory } from "@/lib/seo/blog";

type Filter = "all" | "draft" | "published" | "archived";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Все" },
  { key: "draft", label: "Черновики" },
  { key: "published", label: "Опубликованные" },
  { key: "archived", label: "Архив" },
];

function matchesFilter(article: AdminArticle, filter: Filter): boolean {
  if (filter === "all") return true;
  if (filter === "published") return article.status === "publish" || article.status === "published";
  if (filter === "draft") return article.status === "draft";
  if (filter === "archived") return article.status === "archived" || article.status === "rejected";
  return true;
}

export function ArticlesManager({
  articles,
  categories,
}: {
  articles: AdminArticle[];
  categories: BlogCategory[];
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [draftCats, setDraftCats] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);

  const visible = articles.filter((a) => matchesFilter(a, filter));

  async function call(key: string, url: string, init: RequestInit) {
    setBusyKey(key);
    setError(null);
    try {
      const res = await fetch(url, init);
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error || `Ошибка ${res.status}`);
        return false;
      }
      router.refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setBusyKey(null);
    }
  }

  function publishDraft(id: number) {
    return call(`pub-${id}`, `/api/seo/articles/${id}/publish/`, { method: "POST" });
  }

  function archiveDraft(id: number) {
    return call(`arc-${id}`, `/api/seo/articles/${id}/`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "rejected" }),
    });
  }

  function setPostStatus(id: number, status: string) {
    return call(`st-${id}`, `/api/seo/posts/${id}/`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
  }

  function openCategories(article: AdminArticle) {
    setEditing(article.id);
    setDraftCats(article.categories.map((c) => c.id));
  }

  async function saveCategories(id: number) {
    const ok = await call(`cat-${id}`, `/api/seo/posts/${id}/`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ categoryIds: draftCats }),
    });
    if (ok) setEditing(null);
  }

  return (
    <div>
      <div className={styles.toolbar}>
        <div className={styles.chipRow}>
          {FILTERS.map((f) => (
            <button
              key={f.key}
              className={`${styles.chip} ${filter === f.key ? styles.chipActive : ""}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className={styles.error} style={{ marginBottom: 12 }}>{error}</p>}

      {visible.length === 0 ? (
        <div className={styles.tableCard}>
          <div className={styles.emptyState}>
            <p className={styles.emptyTitle}>Статей нет</p>
            <p>Создайте черновики во вкладке «Генерация» или измените фильтр.</p>
          </div>
        </div>
      ) : (
        <div className={styles.tableCard}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Заголовок</th>
                <th>Рубрики</th>
                <th>Статус</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((a) => {
                const meta = articleStatusMeta(a.status);
                const rowKey = `${a.kind}-${a.id}`;
                const busy = busyKey?.endsWith(`-${a.id}`) ?? false;
                const editUrl = a.kind === "draft" ? `/admin/seo/articles/${a.id}` : `/admin/seo/articles/post/${a.id}`;
                return (
                  <FragmentRow key={rowKey}>
                    <tr>
                      <td>
                        <div className={styles.cellMain}>{a.title || "Без названия"}</div>
                        {a.cluster_name && <div className={styles.cellSub}>Кластер: {a.cluster_name}</div>}
                        {a.url_path && a.status === "publish" && (
                          <div className={styles.cellSub}>
                            <a className={styles.iconLink} href={a.url_path} target="_blank" rel="noreferrer">
                              {a.url_path}
                            </a>
                          </div>
                        )}
                      </td>
                      <td>
                        {a.categories.length > 0 ? (
                          <div className={styles.chipRow}>
                            {a.categories.map((c) => (
                              <span key={c.id} className={styles.badge}>{c.name}</span>
                            ))}
                          </div>
                        ) : (
                          <span className={styles.smallMuted}>—</span>
                        )}
                      </td>
                      <td>
                        <span className={`${styles.badge} ${styles[meta.badge]}`}>{meta.label}</span>
                      </td>
                      <td>
                        <div className={styles.rowActions}>
                          <a className={`${styles.btn} ${styles.btnSm}`} href={editUrl}>Редактировать</a>
                          {a.kind === "draft" ? (
                            <>
                              <button
                                className={`${styles.btn} ${styles.btnSm} ${styles.btnPrimary}`}
                                disabled={busy}
                                onClick={() => publishDraft(a.id)}
                              >
                                Опубликовать
                              </button>
                              <button
                                className={`${styles.btn} ${styles.btnSm} ${styles.btnDanger}`}
                                disabled={busy}
                                onClick={() => archiveDraft(a.id)}
                              >
                                В архив
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                className={`${styles.btn} ${styles.btnSm}`}
                                disabled={busy}
                                onClick={() => openCategories(a)}
                              >
                                Рубрики
                              </button>
                              {a.status !== "publish" && (
                                <button
                                  className={`${styles.btn} ${styles.btnSm} ${styles.btnPrimary}`}
                                  disabled={busy}
                                  onClick={() => setPostStatus(a.id, "publish")}
                                >
                                  Опубликовать
                                </button>
                              )}
                              {a.status === "publish" && (
                                <button
                                  className={`${styles.btn} ${styles.btnSm}`}
                                  disabled={busy}
                                  onClick={() => setPostStatus(a.id, "draft")}
                                >
                                  В черновик
                                </button>
                              )}
                              {a.status !== "archived" && (
                                <button
                                  className={`${styles.btn} ${styles.btnSm} ${styles.btnDanger}`}
                                  disabled={busy}
                                  onClick={() => setPostStatus(a.id, "archived")}
                                >
                                  В архив
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                    {editing === a.id && a.kind === "post" && (
                      <tr className={styles.rowSelected}>
                        <td colSpan={4}>
                          <div className={styles.chipRow} style={{ marginBottom: 12 }}>
                            {categories.map((c) => {
                              const on = draftCats.includes(c.id);
                              return (
                                <button
                                  key={c.id}
                                  className={`${styles.chip} ${on ? styles.chipActive : ""}`}
                                  onClick={() =>
                                    setDraftCats((prev) =>
                                      on ? prev.filter((x) => x !== c.id) : [...prev, c.id],
                                    )
                                  }
                                >
                                  {c.name}
                                </button>
                              );
                            })}
                          </div>
                          <div className={styles.row}>
                            <button
                              className={`${styles.btn} ${styles.btnPrimary} ${styles.btnSm}`}
                              disabled={busyKey === `cat-${a.id}`}
                              onClick={() => saveCategories(a.id)}
                            >
                              Сохранить рубрики
                            </button>
                            <button className={`${styles.btn} ${styles.btnSm}`} onClick={() => setEditing(null)}>
                              Отмена
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </FragmentRow>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
