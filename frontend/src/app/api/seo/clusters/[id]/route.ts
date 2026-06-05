import { NextResponse } from "next/server";
import { guard } from "@/app/api/seo/_guard";
import { pool } from "@/lib/seo/db";

export const runtime = "nodejs";

function parseId(raw: string): number | null {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) return null;
  return value;
}

/**
 * Delete a cluster that has no generated articles.
 * Keeps published/draft article integrity by blocking deletion when articles exist.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard(request);
  if (denied) return denied;

  const { id } = await params;
  const clusterId = parseId(id);
  if (!clusterId) return NextResponse.json({ error: "invalid_cluster_id" }, { status: 400 });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const cluster = await client.query<{ id: number }>(
      `SELECT id FROM seo.keyword_clusters WHERE id = $1 FOR UPDATE`,
      [clusterId],
    );
    if (cluster.rows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "cluster_not_found" }, { status: 404 });
    }

    const articleCountResult = await client.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n
       FROM seo.generated_articles a
       JOIN seo.content_plan_items p ON p.id = a.content_plan_item_id
       WHERE p.cluster_id = $1`,
      [clusterId],
    );
    const articleCount = Number(articleCountResult.rows[0]?.n || 0);
    if (articleCount > 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "cluster_has_articles", articleCount },
        { status: 409 },
      );
    }

    await client.query(
      `DELETE FROM seo.review_decisions
       WHERE cluster_id = $1
          OR content_plan_item_id IN (
            SELECT id FROM seo.content_plan_items WHERE cluster_id = $1
          )`,
      [clusterId],
    );

    const unassigned = await client.query(
      `UPDATE seo.normalized_keywords
       SET cluster_id = NULL,
           status = CASE WHEN status = 'clustered' THEN 'classified' ELSE status END
       WHERE cluster_id = $1`,
      [clusterId],
    );

    await client.query(`DELETE FROM seo.keyword_clusters WHERE id = $1`, [clusterId]);

    await client.query("COMMIT");
    return NextResponse.json({ ok: true, id: clusterId, unassignedKeywords: unassigned.rowCount ?? 0 });
  } catch (error) {
    await client.query("ROLLBACK");
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "cluster_delete_failed" },
      { status: 500 },
    );
  } finally {
    client.release();
  }
}
