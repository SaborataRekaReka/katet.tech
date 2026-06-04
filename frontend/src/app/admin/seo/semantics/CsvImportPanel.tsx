"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../seo-admin.module.css";

export function CsvImportPanel() {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [seedTerm, setSeedTerm] = useState("csv-import");
  const [region, setRegion] = useState("Москва");
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<{ imported: number; parsed?: number; mode?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function decodeFile(buffer: ArrayBuffer): string {
    const utf8 = new TextDecoder("utf-8").decode(buffer);
    const replacementCount = (utf8.match(/\uFFFD/g) ?? []).length;
    if (replacementCount > 0 && typeof TextDecoder !== "undefined") {
      try {
        return new TextDecoder("windows-1251").decode(buffer);
      } catch {
        return utf8;
      }
    }
    return utf8;
  }

  async function onFile(file: File | null) {
    if (!file) return;
    setError(null);
    setResult(null);
    const text = decodeFile(await file.arrayBuffer());
    setContent(text);
    setFileName(file.name);
    if (seedTerm === "csv-import") {
      setSeedTerm(file.name.replace(/\.[^.]+$/, "") || "csv-import");
    }
  }

  async function onImport() {
    if (!content.trim()) return;
    setBusy(true);
    setResult(null);
    setError(null);
    try {
      const response = await fetch("/api/seo/keywords/import/", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content, seedTerm: seedTerm.trim() || "csv-import", region: region.trim() || null }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        imported?: number;
        parsed?: number;
        mode?: string;
        error?: string;
        hint?: string;
      };

      if (!response.ok) {
        setError(data.hint ? `${data.error ?? response.status}: ${data.hint}` : `${data.error ?? response.status}`);
        return;
      }

      setResult({ imported: data.imported ?? 0, parsed: data.parsed, mode: data.mode });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.card}>
      <h2 className={styles.cardTitle}>Импорт Wordstat CSV/TSV</h2>
      <p className={styles.smallMuted}>
        Поддерживается файл Wordstat, формат «фраза;частотность» и одна фраза в строке без частотности. Импорт выполняется в raw-таблицу без очистки.
      </p>

      <div className={styles.row} style={{ marginBottom: 10 }}>
        <input
          className={styles.input}
          value={seedTerm}
          onChange={(e) => setSeedTerm(e.target.value)}
          placeholder="Seed term"
        />
        <input
          className={styles.input}
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          placeholder="Регион"
        />
        <input
          className={styles.input}
          type="file"
          accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
          onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
        />
      </div>

      <textarea
        className={styles.textarea}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={"Пример:\nаренда экскаватора;1200\nэкскаватор цена;340\nвывоз снега подмосковье"}
      />

      <div className={styles.row} style={{ marginTop: 10 }}>
        <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={onImport} disabled={busy || !content.trim()}>
          {busy ? "Импорт..." : "Импортировать"}
        </button>
        {fileName && <span className={styles.smallMuted}>Файл загружен в поле: {fileName}. Нажмите «Импортировать».</span>}
        {result && (
          <span className={styles.smallMuted}>
            Разобрано: {result.parsed ?? result.imported}, импортировано: {result.imported}
            {result.mode ? `, режим: ${result.mode}` : ""}
          </span>
        )}
        {error && <span className={styles.error}>Ошибка импорта: {error}</span>}
      </div>
    </div>
  );
}
