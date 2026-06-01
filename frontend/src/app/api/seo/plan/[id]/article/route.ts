import { NextResponse } from "next/server";
import { guard } from "../../../_guard";
import { one } from "@/lib/seo/db";
import { generateBrief } from "@/lib/seo/brief";
import { generateArticle } from "@/lib/seo/article";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard(request);
  if (denied) return denied;
  const { id } = await params;
  const planId = Number(id);
  try {
    // Ensure a brief exists; auto-generate it if the operator skipped that step.
    const existing = await one<{ id: number }>(
      `SELECT id FROM seo.content_briefs WHERE content_plan_item_id = $1 LIMIT 1`,
      [planId],
    );
    if (!existing) await generateBrief(planId, "admin");
    const articleId = await generateArticle(planId);
    return NextResponse.json({ articleId });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
