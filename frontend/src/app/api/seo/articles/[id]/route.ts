import { NextResponse } from "next/server";
import { guard } from "../../_guard";
import { one, run } from "@/lib/seo/db";
import { getArticle } from "@/lib/seo/queries";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard(request);
  if (denied) return denied;
  const { id } = await params;
  const article = await getArticle(Number(id));
  if (!article) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(article);
}

const EDITABLE = new Set([
  "title",
  "slug",
  "seo_title",
  "meta_description",
  "body_html",
  "body_markdown",
  "status",
]);

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard(request);
  if (denied) return denied;
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  for (const [key, value] of Object.entries(body)) {
    if (!EDITABLE.has(key)) continue;
    sets.push(`${key} = $${i}`);
    values.push(value);
    i += 1;
  }
  if (sets.length === 0) return NextResponse.json({ error: "no_editable_fields" }, { status: 400 });

  values.push(Number(id));
  await run(`UPDATE seo.generated_articles SET ${sets.join(", ")}, updated_at = NOW() WHERE id = $${i}`, values);
  return NextResponse.json({ ok: true });
}

/** Delete an unpublished draft article and reopen plan item for regeneration. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard(request);
  if (denied) return denied;

  const { id } = await params;
  const articleId = Number(id);
  if (!Number.isFinite(articleId) || articleId <= 0) {
    return NextResponse.json({ error: "invalid_article_id" }, { status: 400 });
  }

  const removed = await run<{ id: number; content_plan_item_id: number | null }>(
    `DELETE FROM seo.generated_articles
     WHERE id = $1 AND status = 'draft' AND published_post_id IS NULL
     RETURNING id, content_plan_item_id`,
    [articleId],
  );

  if (removed.length === 0) {
    const existing = await one<{ id: number; status: string; published_post_id: number | null }>(
      `SELECT id, status, published_post_id FROM seo.generated_articles WHERE id = $1`,
      [articleId],
    );

    if (!existing) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    return NextResponse.json(
      { error: "only_unpublished_draft_can_be_deleted" },
      { status: 409 },
    );
  }

  const planItemId = Number(removed[0].content_plan_item_id || 0);
  if (planItemId > 0) {
    const hasAnyDraft = await one<{ id: number }>(
      `SELECT id FROM seo.generated_articles WHERE content_plan_item_id = $1 LIMIT 1`,
      [planItemId],
    );

    if (!hasAnyDraft) {
      const hasBrief = await one<{ id: number }>(
        `SELECT id FROM seo.content_briefs WHERE content_plan_item_id = $1 LIMIT 1`,
        [planItemId],
      );

      await run(
        `UPDATE seo.content_plan_items
         SET status = $2, updated_at = NOW()
         WHERE id = $1 AND status = 'content_generated'`,
        [planItemId, hasBrief ? "brief_created" : "approved"],
      );
    }
  }

  return NextResponse.json({ ok: true, id: articleId });
}
