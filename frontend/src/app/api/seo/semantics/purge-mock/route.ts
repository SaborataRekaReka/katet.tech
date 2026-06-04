import { NextResponse } from "next/server";
import { guard } from "../../_guard";
import { pool } from "@/lib/seo/db";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const deleted = await client.query<{ n: number }>(
      `WITH d AS (
         DELETE FROM seo.raw_keywords
         WHERE source = 'mock'
         RETURNING id
       )
       SELECT COUNT(*)::int AS n FROM d`,
    );
    const removedRawMock = Number(deleted.rows[0]?.n ?? 0);

    if (removedRawMock > 0) {
      // Clusters/plan/articles are derived from normalized keywords. Once a part of
      // normalized data is removed (via raw->normalized cascade), reset derived
      // artifacts so the next pipeline run rebuilds a coherent state.
      await client.query(`DELETE FROM seo.generated_articles`);
      await client.query(`DELETE FROM seo.content_briefs`);
      await client.query(`DELETE FROM seo.review_decisions`);
      await client.query(`DELETE FROM seo.content_plan_items`);
      await client.query(`DELETE FROM seo.cluster_keywords`);
      await client.query(`DELETE FROM seo.keyword_clusters`);
      await client.query(
        `UPDATE seo.normalized_keywords
         SET cluster_id = NULL,
             status = CASE WHEN is_relevant = TRUE THEN 'classified' ELSE 'excluded' END`,
      );
    }

    await client.query("COMMIT");
    return NextResponse.json({
      ok: true,
      removedRawMock,
      resetDerived: removedRawMock > 0,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  } finally {
    client.release();
  }
}
