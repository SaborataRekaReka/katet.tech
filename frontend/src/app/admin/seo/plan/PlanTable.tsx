"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PlanListItem } from "@/lib/seo/queries";
import styles from "../seo-admin.module.css";

const STATUS_BADGE: Record<string, string> = {
  pending_review: styles.badgeAmber,
  ready_for_brief: styles.badgeBlue,
  approved: styles.badgeBlue,
  rejected: styles.badgeRed,
  needs_more_data: styles.badgeGray,
};

const STATUS_LABEL: Record<string, string> = {
  pending_review: "На проверке",
  ready_for_brief: "Одобрено",
  approved: "Одобрено",
  rejected: "Отклонено",
  needs_more_data: "Нужны данные",
};

const ACTION_LABEL: Record<string, string> = {
  create_new_page: "Новая страница",
  update_existing_page: "Обновить существующую",
  add_faq_to_existing_page: "Добавить FAQ",
  add_section_to_existing_page: "Добавить раздел",
  merge_with_existing_cluster: "Объединить",
  no_action: "Без действия",
  manual_review: "Ручная проверка",
};

export function PlanTable({ items }: { items: PlanListItem[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<number | null>(null);

  async function call(id: number, path: string, body: unknown) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/seo/plan/${id}/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        alert(`Ошибка: ${data.error ?? res.status}`);
        return;
      }
      const data = (await res.json()) as { articleId?: number };
      if (data.articleId) {
        router.push(`/admin/seo/articles/${data.articleId}`);
        return;
      }
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className={styles.card}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Кластер</th>
            <th>Интент</th>
            <th>Действие</th>
            <th>Частотность</th>
            <th>Приоритет</th>
            <th>Статус</th>
            <th>Решение</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => {
            const busy = busyId === it.id;
            return (
              <tr key={it.id}>
                <td style={{ fontWeight: 600, maxWidth: 240 }}>
                  {it.cluster_name ?? `#${it.cluster_id}`}
                  {it.reason && <div className={styles.smallMuted}>{it.reason}</div>}
                  {it.target_existing_url && (
                    <div className={styles.smallMuted}>→ {it.target_existing_url}</div>
                  )}
                </td>
                <td>{it.main_intent ?? "—"}</td>
                <td>{it.recommended_action ? ACTION_LABEL[it.recommended_action] ?? it.recommended_action : "—"}</td>
                <td>{it.total_frequency}</td>
                <td>{it.priority}</td>
                <td>
                  <span className={`${styles.badge} ${STATUS_BADGE[it.status] ?? styles.badgeGray}`}>
                    {STATUS_LABEL[it.status] ?? it.status}
                  </span>
                </td>
                <td style={{ minWidth: 220 }}>
                  <div className={styles.row}>
                    {it.has_article ? (
                      <span className={`${styles.badge} ${styles.badgeGreen}`}>Статья создана</span>
                    ) : (
                      <>
                        {it.status === "pending_review" && (
                          <>
                            <button
                              className={styles.btn}
                              onClick={() => call(it.id, "review", { action: "approve" })}
                              disabled={busy}
                            >
                              Одобрить
                            </button>
                            <button
                              className={`${styles.btn} ${styles.btnDanger}`}
                              onClick={() => call(it.id, "review", { action: "reject", reject_reason: "manual" })}
                              disabled={busy}
                            >
                              Отклонить
                            </button>
                          </>
                        )}
                        {it.status !== "rejected" && (
                          <button
                            className={`${styles.btn} ${styles.btnPrimary}`}
                            onClick={() => call(it.id, "article", {})}
                            disabled={busy}
                          >
                            {busy ? "Генерация…" : "Сгенерировать статью"}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
