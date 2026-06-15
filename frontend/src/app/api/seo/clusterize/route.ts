import { NextResponse } from "next/server";
import { guard } from "../_guard";
import { createJob, runImportedSemanticsPipeline } from "@/lib/seo/pipeline";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Run clustering + scoring over already imported semantics (no external Wordstat calls). */
export async function POST(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;

  const body = (await request.json().catch(() => ({}))) as { rebuild?: boolean; requireAi?: boolean };

  const jobId = await createJob("csv_semantics_pipeline", 4);
  void runImportedSemanticsPipeline(jobId, {
    rebuildClusters: Boolean(body.rebuild),
    requireAi: body.requireAi === true,
  });

  return NextResponse.json({ jobId });
}
