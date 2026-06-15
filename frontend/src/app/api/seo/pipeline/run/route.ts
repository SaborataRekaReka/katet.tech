import { NextResponse } from "next/server";
import { guard } from "../../_guard";
import { createSingleFlightJob, runFullPipeline } from "@/lib/seo/pipeline";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;

  const body = (await request.json().catch(() => ({}))) as { autoDraftTop?: number };
  const autoDraftTop = Number.isFinite(body.autoDraftTop) ? Math.max(0, Math.min(20, Number(body.autoDraftTop))) : 5;

  const started = await createSingleFlightJob("full_pipeline");
  if (!started.alreadyRunning) {
    // Run in the background on the long-lived Node server; do not block the response.
    void runFullPipeline(started.jobId, { autoDraftTop });
  }

  return NextResponse.json({ jobId: started.jobId, alreadyRunning: started.alreadyRunning });
}
