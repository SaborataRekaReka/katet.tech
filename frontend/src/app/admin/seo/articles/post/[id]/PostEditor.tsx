"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../../../seo-admin.module.css";
import type { AdminPost, BlogCategory } from "@/lib/seo/blog";

export function PostEditor({ post, categories }: { post: AdminPost; categories: BlogCategory[] }) {
  const router = useRouter();
  const [title, setTitle] = useState(post.title ?? "");
  const [seoTitle, setSeoTitle] = useState(post.seo_title ?? "");
  const [metaDescription, setMetaDescription] = useState(post.meta_description ?? "");
  const [excerpt, setExcerpt] = useState(post.excerpt ?? "");
  const [body, setBody] = useState(post.body ?? "");
  const [cats, setCats] = useState<number[]>(post.category_ids);
  const [status, setStatus] = useState(post.status);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function toggleCat(id: number) {
    setCats((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/seo/posts/${post.id}/`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          seo_title: seoTitle,
          meta_description: metaDescription,
          excerpt,
          body,
          status,
          categoryIds: cats,
        }),
      });
      setMsg(res.ok ? "Сохранено" : "Ошибка сохранения");
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className={styles.card}>
        <div className={styles.formGrid}>
          <div>
            <div className={styles.fieldLabel}>Заголовок</div>
            <input className={`${styles.input} ${styles.fullInput}`} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <div className={styles.fieldLabel}>SEO Title</div>
            <input className={`${styles.input} ${styles.fullInput}`} value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} />
          </div>
          <div>
            <div className={styles.fieldLabel}>Meta Description</div>
            <input className={`${styles.input} ${styles.fullInput}`} value={metaDescription} onChange={(e) => setMetaDescription(e.target.value)} />
          </div>
          <div>
            <div className={styles.fieldLabel}>Краткое описание</div>
            <textarea className={styles.textarea} style={{ minHeight: 90 }} value={excerpt} onChange={(e) => setExcerpt(e.target.value)} />
          </div>
          <div>
            <div className={styles.fieldLabel}>Текст статьи (HTML)</div>
            <textarea className={styles.textarea} style={{ minHeight: 360 }} value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
          <div>
            <div className={styles.fieldLabel}>Рубрики</div>
            <div className={styles.chipRow}>
              {categories.map((c) => (
                <button
                  key={c.id}
                  className={`${styles.chip} ${cats.includes(c.id) ? styles.chipActive : ""}`}
                  onClick={() => toggleCat(c.id)}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className={styles.fieldLabel}>Статус</div>
            <select className={styles.select} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="publish">Опубликовано</option>
              <option value="draft">Черновик</option>
              <option value="archived">В архиве</option>
            </select>
          </div>
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.row}>
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={save} disabled={busy}>
            {busy ? "Сохранение…" : "Сохранить"}
          </button>
          {post.url_path && (
            <a className={styles.iconLink} href={post.url_path} target="_blank" rel="noreferrer">
              Открыть на сайте
            </a>
          )}
          {msg && <span className={styles.smallMuted}>{msg}</span>}
        </div>
      </div>
    </div>
  );
}
