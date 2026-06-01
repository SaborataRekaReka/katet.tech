import { NextResponse } from "next/server";
import { guard } from "../../_guard";
import { parseCsv } from "@/lib/seo/wordstat";
import { ingestRows } from "@/lib/seo/collect";
import { cleanAndNormalize } from "@/lib/seo/clean";
import { getScoringConfig } from "@/lib/seo/settings";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;
  const body = (await request.json().catch(() => ({}))) as {
    content?: string;
    region?: string;
    seedTerm?: string;
  };
  if (!body.content) return NextResponse.json({ error: "content_required" }, { status: 400 });

  const rows = parseCsv(body.content, body.region ?? null);
  const imported = await ingestRows(body.seedTerm ?? "csv-import", rows);
  const config = await getScoringConfig();
  const normalized = await cleanAndNormalize(config.thresholds.min_frequency);

  return NextResponse.json({ imported, normalized });
}
