"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AdminQueryItem, ClusterTargetItem } from "@/lib/seo/queries";
import { CONTENT_STATUS } from "./_status";
import styles from "./seo-admin.module.css";

const INTENT_LABELS: Record<string, string> = {
  commercial_service: "Коммерческий",
  commercial_local: "Локальный",
  commercial_price: "Цена",
  commercial_comparison: "Сравнение",
  informational_how_to: "Вопрос",
  informational_selection: "Выбор",
  informational_cost_estimation: "Расчёт стоимости",
  faq: "FAQ",
  case_or_example: "Пример",
  brand: "Бренд",
  competitor: "Конкурент",
  irrelevant: "Не подходит",
  unknown: "Не определён",
  commercial: "Коммерческий",
  informational: "Информационный",
  navigational: "Навигационный",
  transactional: "Транзакционный",
  local: "Локальный",
};

function intentLabel(intent: string | null): string {
  if (!intent) return "—";
  return INTENT_LABELS[intent] ?? intent;
}

type Props = {
  rows: AdminQueryItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  q: string;
  clusterTargets: ClusterTargetItem[];
};

function buildPageHref(page: number, q: string, pageSize: number): string {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (pageSize !== 100) params.set("pageSize", String(pageSize));
  params.set("page", String(page));
  const suffix = params.toString();
  return suffix ? `/admin/seo?${suffix}` : "/admin/seo";
}

export function QueriesTableManager({ rows, total, page, pageSize, totalPages, q, clusterTargets }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<number[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [targetClusterId, setTargetClusterId] = useState<string>("");
  const [newClusterName, setNewClusterName] = useState("");

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const rowIds = useMemo(() => rows.map((row) => row.id), [rows]);
  const selectedOnPageCount = rowIds.filter((id) => selectedSet.has(id)).length;
  const allOnPageSelected = rowIds.length > 0 && selectedOnPageCount === rowIds.length;

  function toggleRow(id: number, checked: boolean) {
    setSelected((prev) => {
      if (checked) return prev.includes(id) ? prev : [...prev, id];
      return prev.filter((item) => item !== id);
    });
  }

  function toggleAllOnPage(checked: boolean) {
    setSelected((prev) => {
      const set = new Set(prev);
      for (const id of rowIds) {
        if (checked) set.add(id);
        else set.delete(id);
      }
      return [...set];
    });
  }

  async function runMergeToExisting() {
    if (selected.length === 0) return;
    if (!targetClusterId) {
      setActionError("Выберите кластер для объединения.");
      return;
    }
    setActionError(null);
    const res = await fetch("/api/seo/queries/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "merge",
        queryIds: selected,
        targetClusterId: Number(targetClusterId),
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) {
      setActionError(data.error || `Ошибка ${res.status}`);
      return;
    }
    setSelected([]);
    router.refresh();
  }

  async function runMergeToNew() {
    if (selected.length === 0) return;
    setActionError(null);
    const res = await fetch("/api/seo/queries/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "merge",
        queryIds: selected,
        clusterName: newClusterName.trim() || null,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) {
      setActionError(data.error || `Ошибка ${res.status}`);
      return;
    }
    setSelected([]);
    setNewClusterName("");
    router.refresh();
  }

  async function runDelete(ids: number[]) {
    if (ids.length === 0) return;
    if (!confirm(`Удалить запросов: ${ids.length}?`)) return;
    setActionError(null);
    const res = await fetch("/api/seo/queries/", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ queryIds: ids }),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) {
      setActionError(data.error || `Ошибка ${res.status}`);
      return;
    }
    setSelected((prev) => prev.filter((id) => !ids.includes(id)));
    router.refresh();
  }

  function onMergeExisting() {
    startTransition(() => {
      void runMergeToExisting();
    });
  }

  function onMergeNew() {
    startTransition(() => {
      void runMergeToNew();
    });
  }

  function onDeleteSelected() {
    startTransition(() => {
      void runDelete(selected);
    });
  }

  function onDeleteOne(id: number) {
    startTransition(() => {
      void runDelete([id]);
    });
  }

  const pageWindowStart = Math.max(1, page - 2);
  const pageWindowEnd = Math.min(totalPages, pageWindowStart + 4);
  const pageNumbers: number[] = [];
  for (let p = pageWindowStart; p <= pageWindowEnd; p += 1) pageNumbers.push(p);

  return (
    <>
      <form className={styles.toolbar} method="get">
        <input
          className={styles.input}
          type="text"
          name="q"
          defaultValue={q}
          placeholder="Фильтр по тексту запроса"
        />
        <select className={styles.select} name="pageSize" defaultValue={String(pageSize)}>
          <option value="50">50 на странице</option>
          <option value="100">100 на странице</option>
          <option value="150">150 на странице</option>
          <option value="200">200 на странице</option>
        </select>
        <input type="hidden" name="page" value="1" />
        <button className={`${styles.btn} ${styles.btnPrimary}`} type="submit">
          Применить
        </button>
        <Link className={styles.btn} href="/admin/seo">
          Сбросить
        </Link>
        <span className={styles.smallMuted}>Всего запросов: {total.toLocaleString("ru-RU")}</span>
      </form>

      {selected.length > 0 && (
        <div className={styles.selectionBar}>
          <span>Выбрано: {selected.length}</span>

          <select
            className={styles.select}
            value={targetClusterId}
            onChange={(e) => setTargetClusterId(e.target.value)}
            disabled={pending}
          >
            <option value="">Выберите кластер</option>
            {clusterTargets.map((cluster) => (
              <option key={cluster.id} value={String(cluster.id)}>
                {(cluster.cluster_name || cluster.primary_keyword || `Кластер #${cluster.id}`).slice(0, 90)}
              </option>
            ))}
          </select>

          <button className={`${styles.btn} ${styles.btnPrimary}`} type="button" onClick={onMergeExisting} disabled={pending}>
            Объединить в выбранный
          </button>

          <input
            className={styles.input}
            type="text"
            value={newClusterName}
            onChange={(e) => setNewClusterName(e.target.value)}
            placeholder="Название нового кластера"
            disabled={pending}
          />

          <button className={styles.btn} type="button" onClick={onMergeNew} disabled={pending}>
            Объединить в новый
          </button>

          <button className={`${styles.btn} ${styles.btnDanger}`} type="button" onClick={onDeleteSelected} disabled={pending}>
            Удалить выбранные
          </button>
        </div>
      )}

      {actionError && <p className={styles.error}>{actionError}</p>}

      {rows.length === 0 ? (
        <div className={styles.tableCard}>
          <div className={styles.emptyState}>
            <p className={styles.emptyTitle}>Нет запросов</p>
            <p>Попробуйте изменить фильтр или импортировать новые данные.</p>
          </div>
        </div>
      ) : (
        <div className={styles.tableCard}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.checkCell}>
                  <input
                    className={styles.checkbox}
                    type="checkbox"
                    checked={allOnPageSelected}
                    onChange={(e) => toggleAllOnPage(e.target.checked)}
                    aria-label="Выбрать все на странице"
                  />
                </th>
                <th>Запрос</th>
                <th>Частотность</th>
                <th>Тип</th>
                <th>Релевантность</th>
                <th>Кластер</th>
                <th>Статус</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((qRow) => {
                const meta = CONTENT_STATUS[qRow.content_status];
                const isSelected = selectedSet.has(qRow.id);
                return (
                  <tr key={qRow.id} className={isSelected ? styles.rowSelected : undefined}>
                    <td className={styles.checkCell}>
                      <input
                        className={styles.checkbox}
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => toggleRow(qRow.id, e.target.checked)}
                        aria-label={`Выбрать запрос ${qRow.keyword}`}
                      />
                    </td>
                    <td>
                      <div className={styles.cellMain}>{qRow.keyword}</div>
                      <div className={styles.cellSub}>ID {qRow.id}</div>
                    </td>
                    <td className={styles.num}>{qRow.frequency.toLocaleString("ru-RU")}</td>
                    <td>{intentLabel(qRow.intent)}</td>
                    <td>
                      <span className={`${styles.badge} ${qRow.is_relevant === false ? styles.badgeRed : styles.badgeGreen}`}>
                        {qRow.is_relevant === false ? "irrelevant" : "relevant"}
                      </span>
                    </td>
                    <td>
                      {qRow.cluster_id ? (
                        <Link className={styles.iconLink} href={`/admin/seo/clusters#cluster-${qRow.cluster_id}`}>
                          {qRow.cluster_name || `Кластер #${qRow.cluster_id}`}
                        </Link>
                      ) : (
                        <span className={styles.smallMuted}>—</span>
                      )}
                    </td>
                    <td>
                      <span className={`${styles.badge} ${styles[meta.badge]}`}>{meta.label}</span>
                    </td>
                    <td>
                      <div className={styles.rowActions}>
                        <button
                          className={`${styles.btn} ${styles.btnSm} ${styles.btnDanger}`}
                          type="button"
                          onClick={() => onDeleteOne(qRow.id)}
                          disabled={pending}
                        >
                          Удалить
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className={styles.paginationRow}>
        <Link
          className={`${styles.btn} ${page <= 1 ? styles.btnDisabled : ""}`}
          href={page <= 1 ? "#" : buildPageHref(page - 1, q, pageSize)}
          aria-disabled={page <= 1}
        >
          Назад
        </Link>

        <div className={styles.paginationPages}>
          {pageNumbers.map((p) => (
            <Link
              key={p}
              className={`${styles.pageBtn} ${p === page ? styles.pageBtnActive : ""}`}
              href={buildPageHref(p, q, pageSize)}
            >
              {p}
            </Link>
          ))}
        </div>

        <Link
          className={`${styles.btn} ${page >= totalPages ? styles.btnDisabled : ""}`}
          href={page >= totalPages ? "#" : buildPageHref(page + 1, q, pageSize)}
          aria-disabled={page >= totalPages}
        >
          Вперёд
        </Link>
      </div>
    </>
  );
}
