import { NextResponse } from "next/server";
import { guard } from "../../_guard";
import { getDraftsForClusters } from "@/lib/seo/blog";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;
  const body = (await request.json().catch(() => ({}))) as { clusterIds?: number[] };
  const clusterIds = Array.isArray(body.clusterIds) ? body.clusterIds.map((n) => Number(n)) : [];
  const drafts = await getDraftsForClusters(clusterIds);
  return NextResponse.json({ drafts });
}
