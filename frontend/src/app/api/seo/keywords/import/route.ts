import { NextResponse } from "next/server";
import { guard } from "../../_guard";
import { parseCsv } from "@/lib/seo/wordstat";
import { ingestRows } from "@/lib/seo/collect";
import { getSemanticsCleaningConfig } from "@/lib/seo/settings";
import { cleanAndNormalize } from "@/lib/seo/clean";

export const runtime = "nodejs";

function previewImportContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((line) => String(line ?? "")).join("\n");
  if (typeof content === "object" && content !== null && "value" in content) {
    const value = (content as { value?: unknown }).value;
    if (typeof value === "string") return value;
    if (Array.isArray(value)) return value.map((line) => String(line ?? "")).join("\n");
  }
  return String(content ?? "");
}

function normalizeMinusWords(words: string[] | undefined): string[] {
  if (!Array.isArray(words)) return [];
  return words.map((word) => String(word || "").trim().toLowerCase()).filter(Boolean);
}

function containsMinusWord(keyword: string, minusWords: string[]): boolean {
  if (!keyword || minusWords.length === 0) return false;
  const text = keyword.toLowerCase();
  return minusWords.some((minus) => text.includes(minus));
}

export async function POST(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;

  const body = (await request.json().catch(() => ({}))) as {
    content?: unknown;
    region?: string;
    seedTerm?: string;
  };
  if (!previewImportContent(body.content).trim()) {
    return NextResponse.json({ error: "content_required" }, { status: 400 });
  }

  const rows = parseCsv(body.content, body.region ?? null, 1);
  if (rows.length === 0) {
    return NextResponse.json(
      { error: "no_rows_parsed", hint: "Ожидается CSV/TSV или одна фраза в строке." },
      { status: 400 },
    );
  }

  const cleaning = await getSemanticsCleaningConfig();
  const minusWords = normalizeMinusWords(cleaning.junk_words);
  const filteredRows = rows.filter((row) => !containsMinusWord(row.keyword, minusWords));
  const filteredByMinusWords = rows.length - filteredRows.length;

  if (filteredRows.length === 0) {
    return NextResponse.json({
      imported: 0,
      parsed: rows.length,
      filteredByMinusWords,
      cleaned: 0,
      mode: "raw_only",
    });
  }

  const imported = await ingestRows(body.seedTerm ?? "csv-import", filteredRows);
  const cleaned = await cleanAndNormalize(cleaning.min_frequency, { reprocess: false, cleaning });

  return NextResponse.json({
    imported,
    parsed: rows.length,
    filteredByMinusWords,
    cleaned,
    mode: "raw_only",
  });
}