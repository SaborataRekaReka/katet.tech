import { NextResponse } from "next/server";
import { guard } from "../../../_guard";
import { one, run } from "@/lib/seo/db";

export const runtime = "nodejs";

type ReviewBody = {
  action:
    | "approve"
    | "reject"
    | "ready_for_brief"
    | "change_page_type"
    | "change_action"
    | "mark_as_not_relevant"
    | "request_more_data";
  reject_reason?: string;
  page_type?: string;
  recommended_action?: string;
  comment?: string;
  reviewer?: string;
};

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard(request);
  if (denied) return denied;
  const { id } = await params;
  const planId = Number(id);
  const body = (await request.json().catch(() => ({}))) as ReviewBody;

  const plan = await one<{ id: number; cluster_id: number }>(
    `SELECT id, cluster_id FROM seo.content_plan_items WHERE id = $1`,
    [planId],
  );
  if (!plan) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const reviewer = body.reviewer ?? "admin";

  switch (body.action) {
    case "approve":
    case "ready_for_brief":
      await run(
        `UPDATE seo.content_plan_items
           SET status = 'ready_for_brief', approved_by = $2, approved_at = NOW(), reviewer_comment = $3, updated_at = NOW()
         WHERE id = $1`,
        [planId, reviewer, body.comment ?? null],
      );
      await run(`UPDATE seo.keyword_clusters SET status = 'approved', updated_at = NOW() WHERE id = $1`, [plan.cluster_id]);
      break;
    case "reject":
    case "mark_as_not_relevant":
      await run(
        `UPDATE seo.content_plan_items
           SET status = 'rejected', reject_reason = $2, reviewer_comment = $3, updated_at = NOW()
         WHERE id = $1`,
        [planId, body.reject_reason ?? "manual_strategy_decision", body.comment ?? null],
      );
      await run(`UPDATE seo.keyword_clusters SET status = 'rejected', updated_at = NOW() WHERE id = $1`, [plan.cluster_id]);
      break;
    case "change_page_type":
      await run(`UPDATE seo.content_plan_items SET page_type = $2, updated_at = NOW() WHERE id = $1`, [
        planId,
        body.page_type ?? null,
      ]);
      break;
    case "change_action":
      await run(`UPDATE seo.content_plan_items SET recommended_action = $2, updated_at = NOW() WHERE id = $1`, [
        planId,
        body.recommended_action ?? null,
      ]);
      break;
    case "request_more_data":
      await run(`UPDATE seo.content_plan_items SET status = 'needs_more_data', updated_at = NOW() WHERE id = $1`, [planId]);
      break;
    default:
      return NextResponse.json({ error: "unknown_action" }, { status: 400 });
  }

  await run(
    `INSERT INTO seo.review_decisions (content_plan_item_id, cluster_id, action, reject_reason, payload, reviewer)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [planId, plan.cluster_id, body.action, body.reject_reason ?? null, JSON.stringify(body), reviewer],
  );

  return NextResponse.json({ ok: true });
}
