import { NextResponse } from "next/server";
import type { PoolClient } from "pg";
import { guard } from "../_guard";
import { pool } from "@/lib/seo/db";

export const runtime = "nodejs";

type MergeBody = {
  action?: "merge";
  queryIds?: unknown;
  targetClusterId?: unknown;
  clusterName?: unknown;
};

type DeleteBody = {
  queryIds?: unknown;
};

type Aggregate = {
  keyword_count: number;
  total_frequency: number;
};

function asPositiveInt(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function asIdArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const ids = value.map(asPositiveInt).filter((id): id is number => Boolean(id));
  return [...new Set(ids)];
}

async function refreshCluster(client: PoolClient, clusterId: number): Promise<void> {
  const aggregate = await client.query<Aggregate>(
    `SELECT COUNT(*)::int AS keyword_count,
            COALESCE(SUM(ck.frequency), 0)::int AS total_frequency
     FROM seo.cluster_keywords ck
     WHERE ck.cluster_id = $1`,
    [clusterId],
  );

  const keywordCount = aggregate.rows[0]?.keyword_count ?? 0;
  const totalFrequency = aggregate.rows[0]?.total_frequency ?? 0;

  if (keywordCount === 0) {
    await client.query(
      `UPDATE seo.keyword_clusters
       SET status = 'archived', total_frequency = 0, primary_keyword = NULL, updated_at = NOW()
       WHERE id = $1`,
      [clusterId],
    );
    return;
  }

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
     SET total_frequency = $2,
         primary_keyword = $3,
         status = CASE WHEN status = 'archived' THEN 'new' ELSE status END,
         updated_at = NOW()
     WHERE id = $1`,
    [clusterId, totalFrequency, primary.rows[0]?.keyword ?? null],
  );
}

async function createClusterForQueries(
  client: PoolClient,
  queryIds: number[],
  clusterName: string | null,
): Promise<number> {
  const info = await client.query<{ keyword: string; frequency: number; intent: string | null; region: string | null }>(
    `SELECT keyword, frequency, detected_intent AS intent, region
     FROM seo.normalized_keywords
     WHERE id = ANY($1::bigint[])
     ORDER BY frequency DESC, id ASC`,
    [queryIds],
  );

  const primaryKeyword = info.rows[0]?.keyword ?? null;
  const totalFrequency = info.rows.reduce((sum, row) => sum + Number(row.frequency || 0), 0);
  const chosenIntent = info.rows.find((row) => row.intent)?.intent ?? null;
  const chosenRegion = info.rows.find((row) => row.region)?.region ?? null;

  const inserted = await client.query<{ id: number }>(
    `INSERT INTO seo.keyword_clusters (
        cluster_name,
        main_intent,
        cluster_type,
        primary_keyword,
        total_frequency,
        region,
        status,
        decision_log,
        created_at,
        updated_at
      ) VALUES (
        $1,
        $2,
        'service',
        $3,
        $4,
        $5,
        'new',
        '{}'::jsonb,
        NOW(),
        NOW()
      )
      RETURNING id`,
    [clusterName ?? primaryKeyword ?? "Новый кластер", chosenIntent, primaryKeyword, totalFrequency, chosenRegion],
  );

  return inserted.rows[0].id;
}

export async function POST(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;

  const body = (await request.json().catch(() => ({}))) as MergeBody;
  if (body.action !== "merge") return NextResponse.json({ error: "unsupported_action" }, { status: 400 });

  const queryIds = asIdArray(body.queryIds);
  if (queryIds.length === 0) return NextResponse.json({ error: "query_ids_required" }, { status: 400 });

  const targetClusterId = asPositiveInt(body.targetClusterId);
  const rawName = typeof body.clusterName === "string" ? body.clusterName.trim() : "";
  const clusterName = rawName.length > 0 ? rawName.slice(0, 180) : null;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const sourceRows = await client.query<{ cluster_id: number | null }>(
      `SELECT DISTINCT cluster_id FROM seo.normalized_keywords WHERE id = ANY($1::bigint[])`,
      [queryIds],
    );
    const sourceClusterIds = sourceRows.rows
      .map((row) => row.cluster_id)
      .filter((id): id is number => Number.isInteger(id));

    let clusterId = targetClusterId;
    if (clusterId) {
      const target = await client.query<{ id: number }>(
        `SELECT id FROM seo.keyword_clusters WHERE id = $1 AND status <> 'archived' LIMIT 1`,
        [clusterId],
      );
      if (target.rows.length === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "target_cluster_not_found" }, { status: 404 });
      }
    } else {
      clusterId = await createClusterForQueries(client, queryIds, clusterName);
    }

    await client.query(
      `DELETE FROM seo.cluster_keywords
       WHERE keyword_id = ANY($1::bigint[])
         AND cluster_id <> $2`,
      [queryIds, clusterId],
    );

    await client.query(
      `UPDATE seo.normalized_keywords
       SET cluster_id = $2,
           status = CASE WHEN status = 'excluded' THEN 'clustered' ELSE status END
       WHERE id = ANY($1::bigint[])`,
      [queryIds, clusterId],
    );

    await client.query(
      `INSERT INTO seo.cluster_keywords (cluster_id, keyword_id, role, frequency)
       SELECT $1, n.id,
              CASE
                WHEN n.id = (
                  SELECT nx.id FROM seo.normalized_keywords nx
                  WHERE nx.id = ANY($2::bigint[])
                  ORDER BY nx.frequency DESC, nx.id ASC
                  LIMIT 1
                ) THEN 'primary'
                ELSE 'secondary'
              END,
              n.frequency
       FROM seo.normalized_keywords n
       WHERE n.id = ANY($2::bigint[])
       ON CONFLICT (cluster_id, keyword_id) DO UPDATE
       SET frequency = EXCLUDED.frequency`,
      [clusterId, queryIds],
    );

    await refreshCluster(client, clusterId);

    const staleClusters = [...new Set(sourceClusterIds.filter((id) => id !== clusterId))];
    for (const staleClusterId of staleClusters) {
      await refreshCluster(client, staleClusterId);
    }

    await client.query("COMMIT");
    return NextResponse.json({ ok: true, clusterId, merged: queryIds.length });
  } catch (err) {
    await client.query("ROLLBACK");
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "merge_failed" },
      { status: 500 },
    );
  } finally {
    client.release();
  }
}

export async function DELETE(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;

  const body = (await request.json().catch(() => ({}))) as DeleteBody;
  const queryIds = asIdArray(body.queryIds);
  if (queryIds.length === 0) return NextResponse.json({ error: "query_ids_required" }, { status: 400 });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const sourceRows = await client.query<{ cluster_id: number | null }>(
      `SELECT DISTINCT cluster_id FROM seo.normalized_keywords WHERE id = ANY($1::bigint[])`,
      [queryIds],
    );
    const sourceClusterIds = sourceRows.rows
      .map((row) => row.cluster_id)
      .filter((id): id is number => Number.isInteger(id));

    const deleted = await client.query<{ id: number }>(
      `DELETE FROM seo.normalized_keywords
       WHERE id = ANY($1::bigint[])
       RETURNING id`,
      [queryIds],
    );

    for (const clusterId of [...new Set(sourceClusterIds)]) {
      await refreshCluster(client, clusterId);
    }

    await client.query("COMMIT");
    return NextResponse.json({ ok: true, deleted: deleted.rowCount ?? 0 });
  } catch (err) {
    await client.query("ROLLBACK");
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "delete_failed" },
      { status: 500 },
    );
  } finally {
    client.release();
  }
}
