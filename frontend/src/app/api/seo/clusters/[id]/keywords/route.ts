import { NextResponse } from "next/server";
import { guard } from "@/app/api/seo/_guard";
import { pool, run } from "@/lib/seo/db";

export const runtime = "nodejs";

type KeywordRow = {
  keyword_id: number;
  keyword: string;
  frequency: number;
  role: string;
};

function parseId(raw: string): number | null {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) return null;
  return value;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard(request);
  if (denied) return denied;

  const { id } = await params;
  const clusterId = parseId(id);
  if (!clusterId) return NextResponse.json({ error: "invalid_cluster_id" }, { status: 400 });

  const keywords = await run<KeywordRow>(
    `SELECT ck.keyword_id, n.keyword, ck.frequency, ck.role
     FROM seo.cluster_keywords ck
     JOIN seo.normalized_keywords n ON n.id = ck.keyword_id
     WHERE ck.cluster_id = $1
     ORDER BY ck.frequency DESC, ck.id ASC`,
    [clusterId],
  );

  return NextResponse.json({ keywords });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard(request);
  if (denied) return denied;

  const { id } = await params;
  const clusterId = parseId(id);
  if (!clusterId) return NextResponse.json({ error: "invalid_cluster_id" }, { status: 400 });

  const body = (await request.json().catch(() => ({}))) as { keywordId?: unknown };
  const keywordId = parseId(String(body.keywordId ?? ""));
  if (!keywordId) return NextResponse.json({ error: "keyword_id_required" }, { status: 400 });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const exists = await client.query<{ keyword_id: number }>(
      `SELECT keyword_id FROM seo.cluster_keywords WHERE cluster_id = $1 AND keyword_id = $2 LIMIT 1`,
      [clusterId, keywordId],
    );
    if (exists.rows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "keyword_not_in_cluster" }, { status: 404 });
    }

    await client.query(`DELETE FROM seo.cluster_keywords WHERE cluster_id = $1 AND keyword_id = $2`, [clusterId, keywordId]);
    await client.query(`UPDATE seo.normalized_keywords SET cluster_id = NULL WHERE id = $1 AND cluster_id = $2`, [keywordId, clusterId]);

    const aggregate = await client.query<{ keyword_count: number; total_frequency: number }>(
      `SELECT COUNT(*)::int AS keyword_count, COALESCE(SUM(ck.frequency), 0)::int AS total_frequency
       FROM seo.cluster_keywords ck
       WHERE ck.cluster_id = $1`,
      [clusterId],
    );

    const keywordCount = aggregate.rows[0]?.keyword_count ?? 0;
    const totalFrequency = aggregate.rows[0]?.total_frequency ?? 0;

    if (keywordCount === 0) {
      await client.query(
        `UPDATE seo.keyword_clusters
         SET status = 'archived', total_frequency = 0, primary_keyword = NULL
         WHERE id = $1`,
        [clusterId],
      );
    } else {
      const primary = await client.query<{ keyword: string }>(
        `SELECT n.keyword
         FROM seo.cluster_keywords ck
         JOIN seo.normalized_keywords n ON n.id = ck.keyword_id
         WHERE ck.cluster_id = $1
         ORDER BY ck.frequency DESC, n.frequency DESC, n.id ASC
         LIMIT 1`,
        [clusterId],
      );

      await client.query(
        `UPDATE seo.keyword_clusters
         SET total_frequency = $2, primary_keyword = $3
         WHERE id = $1`,
        [clusterId, totalFrequency, primary.rows[0]?.keyword ?? null],
      );
    }

    await client.query("COMMIT");
    return NextResponse.json({ ok: true, remainingKeywords: keywordCount, totalFrequency });
  } catch (err) {
    await client.query("ROLLBACK");
    const message = err instanceof Error ? err.message : "failed_to_remove";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    client.release();
  }
}
