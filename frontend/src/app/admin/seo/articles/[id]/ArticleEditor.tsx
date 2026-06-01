"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../../seo-admin.module.css";

export type ArticleData = {
  id: number;
  title: string | null;
  slug: string | null;
  url_path: string | null;
  seo_title: string | null;
  meta_description: string | null;
  body_html: string | null;
  status: string;
  published_post_id: number | null;
  faq?: { question: string; answer: string }[];
};

export function ArticleEditor({ article }: { article: ArticleData }) {
  const router = useRouter();
  const [title, setTitle] = useState(article.title ?? "");
  const [slug, setSlug] = useState(article.slug ?? "");
  const [seoTitle, setSeoTitle] = useState(article.seo_title ?? "");
  const [metaDescription, setMetaDescription] = useState(article.meta_description ?? "");
  const [bodyHtml, setBodyHtml] = useState(article.body_html ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const published = article.status === "published";

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/seo/articles/${article.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          slug,
          seo_title: seoTitle,
          meta_description: metaDescription,
          body_html: bodyHtml,
        }),
      });
      setMsg(res.ok ? "Сохранено" : "Ошибка сохранения");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    if (!confirm("Опубликовать статью на сайт?")) return;
    setBusy(true);
    setMsg(null);
    try {
      await save();
      const res = await fetch(`/api/seo/articles/${article.id}/publish`, { method: "POST" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setMsg(`Ошибка публикации: ${data.error ?? res.status}`);
        return;
      }
      setMsg("Опубликовано");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className={styles.card}>
        <div className={styles.row} style={{ justifyContent: "space-between" }}>
          <span
            className={`${styles.badge} ${published ? styles.badgeGreen : styles.badgeGray}`}
          >
            {published ? "Опубликовано" : "Черновик"}
          </span>
          {article.url_path && <span className={styles.smallMuted}>{article.url_path}</span>}
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.formCol}>
          <div>
            <div className={styles.fieldLabel}>Заголовок (H1)</div>
            <input className={styles.input} style={{ width: "100%" }} value={title} onChange={(e) => setTitle(e.target.value)} disabled={published} />
          </div>
          <div>
            <div className={styles.fieldLabel}>Slug</div>
            <input className={styles.input} style={{ width: "100%" }} value={slug} onChange={(e) => setSlug(e.target.value)} disabled={published} />
          </div>
          <div>
            <div className={styles.fieldLabel}>SEO Title</div>
            <input className={styles.input} style={{ width: "100%" }} value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} disabled={published} />
          </div>
          <div>
            <div className={styles.fieldLabel}>Meta Description</div>
            <input className={styles.input} style={{ width: "100%" }} value={metaDescription} onChange={(e) => setMetaDescription(e.target.value)} disabled={published} />
          </div>
          <div>
            <div className={styles.fieldLabel}>Тело статьи (HTML)</div>
            <textarea className={styles.textarea} style={{ minHeight: 360 }} value={bodyHtml} onChange={(e) => setBodyHtml(e.target.value)} disabled={published} />
          </div>
        </div>
      </div>

      {article.faq && article.faq.length > 0 && (
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>FAQ</h2>
          {article.faq.map((f, i) => (
            <div key={i} style={{ marginBottom: 10 }}>
              <div style={{ fontWeight: 600 }}>{f.question}</div>
              <div className={styles.smallMuted}>{f.answer || "— нет ответа —"}</div>
            </div>
          ))}
        </div>
      )}

      <div className={styles.card}>
        <div className={styles.row}>
          {!published && (
            <>
              <button className={styles.btn} onClick={save} disabled={busy}>
                Сохранить
              </button>
              <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={publish} disabled={busy}>
                Опубликовать на сайт
              </button>
            </>
          )}
          {msg && <span className={styles.smallMuted}>{msg}</span>}
        </div>
      </div>
    </div>
  );
}
