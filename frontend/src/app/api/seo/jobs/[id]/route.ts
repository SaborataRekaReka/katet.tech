import { NextResponse } from "next/server";
import { guard } from "../../_guard";
import { getJob } from "@/lib/seo/queries";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard(request);
  if (denied) return denied;
  const { id } = await params;
  const job = await getJob(Number(id));
  if (!job) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(job);
}
