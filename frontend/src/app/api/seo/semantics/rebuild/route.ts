import { NextResponse } from "next/server";
import { guard } from "../../_guard";
import { createJob, runImportedSemanticsPipeline } from "@/lib/seo/pipeline";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;

  const jobId = await createJob("csv_semantics_pipeline", 4);
  void runImportedSemanticsPipeline(jobId);

  return NextResponse.json({ jobId });
}