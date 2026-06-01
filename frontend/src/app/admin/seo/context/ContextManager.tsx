"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../seo-admin.module.css";

type ContextRow = {
  id: number;
  context_type: string;
  name: string;
  description: string | null;
  is_active: boolean;
  is_allowed_for_seo: boolean;
};

const TYPES = [
  "service_category",
  "equipment_type",
  "task",
  "region",
  "advantage",
  "restriction",
  "forbidden_topic",
  "faq",
];

const TYPE_LABELS: Record<string, string> = {
  service_category: "Категория услуг",
  equipment_type: "Тип техники",
  task: "Задача",
  region: "Регион",
  advantage: "Преимущество",
  restriction: "Ограничение",
  forbidden_topic: "Запретная тема",
  faq: "FAQ",
};

export function ContextManager({ initial }: { initial: ContextRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [type, setType] = useState("equipment_type");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  async function add() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await fetch("/api/seo/context", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ item: { context_type: type, name: name.trim(), description: description.trim() || null } }),
      });
      setName("");
      setDescription("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function seedPreset() {
    setBusy(true);
    try {
      await fetch("/api/seo/context", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ preset: "katet" }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    setBusy(true);
    try {
      await fetch(`/api/seo/context?id=${id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const grouped = TYPES.map((t) => ({ type: t, rows: initial.filter((r) => r.context_type === t) })).filter(
    (g) => g.rows.length > 0,
  );

  return (
    <div>
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Добавить элемент</h2>
        <div className={styles.row}>
          <select className={styles.select} value={type} onChange={(e) => setType(e.target.value)}>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          <input
            className={styles.input}
            placeholder="Название (например, аренда экскаватора)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className={styles.input}
            placeholder="Описание (необязательно)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={add} disabled={busy || !name.trim()}>
            Добавить
          </button>
        </div>
        {initial.length === 0 && (
          <div className={styles.row} style={{ marginTop: 14 }}>
            <button className={styles.btn} onClick={seedPreset} disabled={busy}>
              Заполнить пресетом для Катет (аренда спецтехники)
            </button>
          </div>
        )}
      </div>

      {grouped.map((g) => (
        <div key={g.type} className={styles.card}>
          <h2 className={styles.cardTitle}>{TYPE_LABELS[g.type] ?? g.type}</h2>
          <table className={styles.table}>
            <tbody>
              {g.rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>{r.name}</td>
                  <td>{r.description}</td>
                  <td style={{ width: 90, textAlign: "right" }}>
                    <button className={`${styles.btn} ${styles.btnDanger}`} onClick={() => remove(r.id)} disabled={busy}>
                      Удалить
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
