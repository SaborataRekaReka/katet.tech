import { NextResponse } from "next/server";
import { guard } from "../../_guard";
import { createSingleFlightJob, runImportedSemanticsPipeline } from "@/lib/seo/pipeline";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;

  const started = await createSingleFlightJob("csv_semantics_pipeline", 4);
  if (!started.alreadyRunning) {
    void runImportedSemanticsPipeline(started.jobId);
  }

  return NextResponse.json({ jobId: started.jobId, alreadyRunning: started.alreadyRunning });
}