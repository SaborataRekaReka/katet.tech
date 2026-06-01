import "server-only";

import { one, run } from "./db";

/** Read helpers for the admin UI. */

export type DashboardStats = {
  context: number;
  seeds: number;
  rawKeywords: number;
  normalized: number;
  clusters: number;
  planPending: number;
  planApproved: number;
  drafts: number;
  published: number;
  lastJob: {
    id: number;
    kind: string;
    status: string;
    step: string | null;
    progress: number;
    total: number;
    error: string | null;
    started_at: string;
  } | null;
};

export async function getDashboardStats(): Promise<DashboardStats> {
  const count = async (sql: string) => Number((await one<{ n: string }>(sql))?.n ?? 0);
  return {
    context: await count(`SELECT COUNT(*) n FROM seo.company_context WHERE is_active`),
    seeds: await count(`SELECT COUNT(*) n FROM seo.seed_terms WHERE status = 'active'`),
    rawKeywords: await count(`SELECT COUNT(*) n FROM seo.raw_keywords`),
    normalized: await count(`SELECT COUNT(*) n FROM seo.normalized_keywords WHERE is_relevant`),
    clusters: await count(`SELECT COUNT(*) n FROM seo.keyword_clusters`),
    planPending: await count(`SELECT COUNT(*) n FROM seo.content_plan_items WHERE status = 'pending_review'`),
    planApproved: await count(`SELECT COUNT(*) n FROM seo.content_plan_items WHERE status IN ('approved','ready_for_brief','brief_created','in_content_generation')`),
    drafts: await count(`SELECT COUNT(*) n FROM seo.generated_articles WHERE status = 'draft'`),
    published: await count(`SELECT COUNT(*) n FROM seo.generated_articles WHERE status = 'published'`),
    lastJob:
      (await one(
        `SELECT id, kind, status, step, progress, total, error, started_at
         FROM seo.jobs ORDER BY id DESC LIMIT 1`,
      )) ?? null,
  };
}

export type PlanListItem = {
  id: number;
  cluster_id: number;
  cluster_name: string | null;
  main_intent: string | null;
  page_type: string | null;
  recommended_action: string | null;
  status: string;
  priority: number;
  business_fit_score: number | null;
  seo_opportunity_score: number | null;
  content_readiness_score: number | null;
  risk_score: number | null;
  total_frequency: number;
  region: string | null;
  target_existing_url: string | null;
  proposed_url: string | null;
  reason: string | null;
  has_article: boolean;
};

export async function getPlanItems(status?: string): Promise<PlanListItem[]> {
  const where = status && status !== "all" ? `WHERE p.status = $1` : "";
  const params = status && status !== "all" ? [status] : [];
  return run<PlanListItem>(
    `SELECT p.id, p.cluster_id, c.cluster_name, c.main_intent, p.page_type, p.recommended_action,
            p.status, p.priority, c.business_fit_score, c.seo_opportunity_score,
            c.content_readiness_score, c.risk_score, c.total_frequency, c.region,
            p.target_existing_url, p.proposed_url, p.reason,
            EXISTS (SELECT 1 FROM seo.generated_articles a WHERE a.content_plan_item_id = p.id) AS has_article
     FROM seo.content_plan_items p
     JOIN seo.keyword_clusters c ON c.id = p.cluster_id
     ${where}
     ORDER BY p.priority DESC, p.id DESC`,
    params,
  );
}

export type ClusterDetail = {
  cluster: Record<string, unknown> | null;
  keywords: { keyword: string; role: string; frequency: number }[];
  plan: Record<string, unknown> | null;
  brief: Record<string, unknown> | null;
};

export async function getClusterDetail(clusterId: number): Promise<ClusterDetail> {
  const cluster = await one(`SELECT * FROM seo.keyword_clusters WHERE id = $1`, [clusterId]);
  const keywords = await run<{ keyword: string; role: string; frequency: number }>(
    `SELECT n.keyword, ck.role, ck.frequency
     FROM seo.cluster_keywords ck JOIN seo.normalized_keywords n ON n.id = ck.keyword_id
     WHERE ck.cluster_id = $1 ORDER BY ck.frequency DESC`,
    [clusterId],
  );
  const plan = await one(`SELECT * FROM seo.content_plan_items WHERE cluster_id = $1`, [clusterId]);
  const brief = plan
    ? await one(`SELECT * FROM seo.content_briefs WHERE content_plan_item_id = $1 ORDER BY id DESC LIMIT 1`, [
        (plan as { id: number }).id,
      ])
    : null;
  return { cluster, keywords, plan, brief };
}

export type ArticleListItem = {
  id: number;
  title: string | null;
  slug: string | null;
  url_path: string | null;
  status: string;
  priority: number | null;
  published_post_id: number | null;
  created_at: string;
};

export async function getArticles(): Promise<ArticleListItem[]> {
  return run<ArticleListItem>(
    `SELECT a.id, a.title, a.slug, a.url_path, a.status, p.priority, a.published_post_id, a.created_at
     FROM seo.generated_articles a
     LEFT JOIN seo.content_plan_items p ON p.id = a.content_plan_item_id
     ORDER BY a.id DESC`,
  );
}

export async function getArticle(id: number): Promise<Record<string, unknown> | null> {
  return one(`SELECT * FROM seo.generated_articles WHERE id = $1`, [id]);
}

export async function getContextItems(): Promise<Record<string, unknown>[]> {
  return run(`SELECT * FROM seo.company_context ORDER BY context_type, name`);
}

export async function getJob(id: number): Promise<Record<string, unknown> | null> {
  return one(`SELECT * FROM seo.jobs WHERE id = $1`, [id]);
}
