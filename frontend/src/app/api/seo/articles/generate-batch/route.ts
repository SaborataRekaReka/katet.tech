import { NextResponse } from "next/server";
import { guard } from "../../_guard";
import { createJob, runArticleBatch } from "@/lib/seo/pipeline";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;

  const body = (await request.json().catch(() => ({}))) as { limit?: number; clusterIds?: number[] };
  const limit = Number.isFinite(body.limit) ? Math.max(1, Math.min(20, Number(body.limit))) : 3;
  const clusterIds = Array.isArray(body.clusterIds)
    ? body.clusterIds.map((n) => Number(n)).filter((n) => Number.isFinite(n))
    : undefined;

  const jobId = await createJob("article_batch", Math.trunc(limit) + 1);
  void runArticleBatch(jobId, limit, clusterIds);

  return NextResponse.json({ jobId });
}