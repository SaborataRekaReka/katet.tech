import { NextResponse } from "next/server";
import { guard } from "../../_guard";
import { parseCsv } from "@/lib/seo/wordstat";
import { ingestRows } from "@/lib/seo/collect";

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

  const imported = await ingestRows(body.seedTerm ?? "csv-import", rows);
  return NextResponse.json({ imported, parsed: rows.length, mode: "raw_only" });
}