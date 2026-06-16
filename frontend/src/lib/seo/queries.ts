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

export type RawKeywordListItem = {
  id: number;
  source: string;
  seed_term: string | null;
  keyword: string;
  frequency: number | null;
  region: string | null;
  period: string | null;
  imported_at: string;
};

export type NormalizedKeywordListItem = {
  id: number;
  keyword: string;
  normalized_keyword: string;
  frequency: number;
  region: string | null;
  detected_intent: string | null;
  intent_confidence: number | null;
  is_relevant: boolean | null;
  irrelevance_reason: string | null;
  status: string;
  cluster_id: number | null;
  raw_source: string | null;
  created_at: string;
};

export type SemanticsStats = {
  rawTotal: number;
  rawWordstatApi: number;
  rawCsv: number;
  rawMock: number;
  normalizedTotal: number;
  normalizedRelevant: number;
  normalizedIrrelevant: number;
  clustersTotal: number;
  planItems: number;
  contentClosed: number;
};

function normalizeLimit(limit: number | undefined, fallback = 200, max = 1000): number {
  const value = Number(limit);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(20, Math.min(max, Math.trunc(value)));
}

export async function getSemanticsStats(): Promise<SemanticsStats> {
  const rawRows = await run<{ source: string; n: string }>(
    `SELECT source, COUNT(*)::text AS n FROM seo.raw_keywords GROUP BY source`,
  );
  const normalized = await one<{ total: string; relevant: string; irrelevant: string }>(
    `SELECT
       COUNT(*)::text AS total,
       COUNT(*) FILTER (WHERE is_relevant = TRUE)::text AS relevant,
       COUNT(*) FILTER (WHERE is_relevant = FALSE)::text AS irrelevant
     FROM seo.normalized_keywords`,
  );
    const coverage = await one<{ clusters: string; plan_items: string; closed: string }>(
     `SELECT
       (SELECT COUNT(*) FROM seo.keyword_clusters)::text AS clusters,
       (SELECT COUNT(*) FROM seo.content_plan_items)::text AS plan_items,
       (SELECT COUNT(*)
         FROM seo.content_plan_items p
        WHERE p.status IN ('content_generated', 'published')
          OR EXISTS (SELECT 1 FROM seo.generated_articles a WHERE a.content_plan_item_id = p.id))::text AS closed`,
    );

  const bySource = new Map(rawRows.map((r) => [r.source, Number(r.n)]));
  return {
    rawTotal: rawRows.reduce((sum, row) => sum + Number(row.n), 0),
    rawWordstatApi: bySource.get("wordstat_api") ?? 0,
    rawCsv: bySource.get("csv") ?? 0,
    rawMock: bySource.get("mock") ?? 0,
    normalizedTotal: Number(normalized?.total ?? 0),
    normalizedRelevant: Number(normalized?.relevant ?? 0),
    normalizedIrrelevant: Number(normalized?.irrelevant ?? 0),
    clustersTotal: Number(coverage?.clusters ?? 0),
    planItems: Number(coverage?.plan_items ?? 0),
    contentClosed: Number(coverage?.closed ?? 0),
  };
}

export type SemanticsClusterListItem = {
  id: number;
  cluster_name: string | null;
  primary_keyword: string | null;
  main_intent: string | null;
  cluster_type: string | null;
  total_frequency: number;
  region: string | null;
  keyword_count: number;
  plan_id: number | null;
  plan_status: string | null;
  priority: number | null;
  has_article: boolean;
  article_id: number | null;
  recommended_action: string | null;
  target_existing_url: string | null;
  coverage_score: number | null;
  related_pages: { source: string; url: string; title: string; score: number }[];
};

type SemanticsClusterListRawItem = Omit<SemanticsClusterListItem, "related_pages"> & {
  related_pages_raw: unknown;
};

function parseRelatedPages(raw: unknown): { source: string; url: string; title: string; score: number }[] {
  if (typeof raw === "string") {
    try {
      return parseRelatedPages(JSON.parse(raw) as unknown);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const source = (item as { source?: unknown }).source;
      const url = (item as { url?: unknown }).url;
      const title = (item as { title?: unknown }).title;
      const score = Number((item as { score?: unknown }).score ?? 0);
      if (typeof source !== "string" || typeof url !== "string" || typeof title !== "string") return null;
      return {
        source,
        url,
        title,
        score: Number.isFinite(score) ? score : 0,
      };
    })
    .filter((item): item is { source: string; url: string; title: string; score: number } => Boolean(item));
}

export type SiteIndexStats = {
  pages: number;
  posts: number;
  equipmentTypes: number;
  workTypes: number;
  brands: number;
  total: number;
};

export async function getSiteIndexStats(): Promise<SiteIndexStats> {
  const count = async (sql: string): Promise<number> => {
    try {
      const row = await one<{ n: string }>(sql);
      return Number(row?.n ?? 0);
    } catch {
      return 0;
    }
  };

  const stats: SiteIndexStats = {
    pages: await count(`SELECT COUNT(*)::text AS n FROM public.pages WHERE url_path IS NOT NULL`),
    posts: await count(`SELECT COUNT(*)::text AS n FROM public.posts WHERE url_path IS NOT NULL`),
    equipmentTypes: await count(`SELECT COUNT(*)::text AS n FROM public.equipment_types WHERE url_path IS NOT NULL`),
    workTypes: await count(`SELECT COUNT(*)::text AS n FROM public.work_types WHERE url_path IS NOT NULL`),
    brands: await count(`SELECT COUNT(*)::text AS n FROM public.brands WHERE url_path IS NOT NULL`),
    total: 0,
  };
  stats.total = stats.pages + stats.posts + stats.equipmentTypes + stats.workTypes + stats.brands;
  return stats;
}

export async function getSemanticsClustersList(limit = 100): Promise<SemanticsClusterListItem[]> {
  const normalizedLimit = normalizeLimit(limit, 100, 500);
  const rows = await run<SemanticsClusterListRawItem>(
    `SELECT
       c.id,
       c.cluster_name,
       c.primary_keyword,
       c.main_intent,
       c.cluster_type,
       c.total_frequency,
       c.region,
       COUNT(ck.id)::int AS keyword_count,
       p.id AS plan_id,
       p.status AS plan_status,
       p.priority,
       COALESCE(p.recommended_action, c.recommended_action) AS recommended_action,
       COALESCE(p.target_existing_url, c.target_existing_url) AS target_existing_url,
       NULLIF(c.decision_log->'gap'->>'best_score', '')::numeric AS coverage_score,
       COALESCE(c.decision_log->'gap'->'similar_pages', '[]'::jsonb) AS related_pages_raw,
       EXISTS (SELECT 1 FROM seo.generated_articles a WHERE a.content_plan_item_id = p.id) AS has_article,
       (SELECT a.id FROM seo.generated_articles a WHERE a.content_plan_item_id = p.id ORDER BY a.id DESC LIMIT 1) AS article_id
     FROM seo.keyword_clusters c
     LEFT JOIN seo.cluster_keywords ck ON ck.cluster_id = c.id
     LEFT JOIN seo.content_plan_items p ON p.cluster_id = c.id
    WHERE c.status <> 'archived'
     GROUP BY c.id, p.id
     ORDER BY COALESCE(p.priority, c.content_priority_score, 0) DESC, c.total_frequency DESC, c.id DESC
     LIMIT $1`,
    [normalizedLimit],
  );

  return rows.map((row) => {
    const { related_pages_raw, ...rest } = row;
    return {
      ...rest,
      coverage_score: row.coverage_score == null ? null : Number(row.coverage_score),
      related_pages: parseRelatedPages(related_pages_raw),
    };
  });
}

export type SemanticsFilters = {
  q?: string;
  source?: string;
  relevance?: string;
  limit?: number;
};

export async function getRawKeywordsList(filters: SemanticsFilters = {}): Promise<RawKeywordListItem[]> {
  const where: string[] = [];
  const params: unknown[] = [];

  const source = (filters.source ?? "all").trim().toLowerCase();
  if (source !== "all") {
    params.push(source);
    where.push(`r.source = $${params.length}`);
  }

  const q = (filters.q ?? "").trim();
  if (q) {
    params.push(`%${q}%`);
    where.push(`(r.keyword ILIKE $${params.length} OR COALESCE(r.seed_term, '') ILIKE $${params.length})`);
  }

  const limit = normalizeLimit(filters.limit, 200, 1000);
  params.push(limit);

  return run<RawKeywordListItem>(
    `SELECT r.id, r.source, r.seed_term, r.keyword, r.frequency, r.region, r.period, r.imported_at::text
     FROM seo.raw_keywords r
     ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY r.id DESC
     LIMIT $${params.length}`,
    params,
  );
}

export async function getNormalizedKeywordsList(
  filters: SemanticsFilters = {},
): Promise<NormalizedKeywordListItem[]> {
  const where: string[] = [];
  const params: unknown[] = [];

  const source = (filters.source ?? "all").trim().toLowerCase();
  if (source !== "all") {
    params.push(source);
    where.push(`r.source = $${params.length}`);
  }

  const relevance = (filters.relevance ?? "all").trim().toLowerCase();
  if (relevance === "relevant") {
    where.push(`n.is_relevant = TRUE`);
  } else if (relevance === "irrelevant") {
    where.push(`n.is_relevant = FALSE`);
  }

  const q = (filters.q ?? "").trim();
  if (q) {
    params.push(`%${q}%`);
    where.push(`(n.keyword ILIKE $${params.length} OR n.normalized_keyword ILIKE $${params.length})`);
  }

  const limit = normalizeLimit(filters.limit, 200, 1000);
  params.push(limit);

  return run<NormalizedKeywordListItem>(
    `SELECT
       n.id,
       n.keyword,
       n.normalized_keyword,
       n.frequency,
       n.region,
       n.detected_intent,
       n.intent_confidence,
       n.is_relevant,
       n.irrelevance_reason,
       n.status,
       n.cluster_id,
       r.source AS raw_source,
       n.created_at::text
     FROM seo.normalized_keywords n
     LEFT JOIN seo.raw_keywords r ON r.id = n.raw_keyword_id
     ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY n.id DESC
     LIMIT $${params.length}`,
    params,
  );
}

/** Manager-friendly content status used across tabs. */
export type ContentStatus = "created" | "awaiting" | "not_recommended";

export type AdminQueryItem = {
  id: number;
  keyword: string;
  frequency: number;
  intent: string | null;
  is_relevant: boolean | null;
  cluster_id: number | null;
  cluster_name: string | null;
  content_status: ContentStatus;
};

export type AdminQueriesPage = {
  items: AdminQueryItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type AdminQueryFilters = {
  q?: string;
  page?: number;
  pageSize?: number;
};

export type ClusterTargetItem = {
  id: number;
  cluster_name: string | null;
  primary_keyword: string | null;
  total_frequency: number;
};

function normalizePage(value: number | undefined): number {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return 1;
  return Math.max(1, Math.trunc(raw));
}

/** Relevant queries with a derived manager-friendly content status. */
export async function getAdminQueries(limit = 500): Promise<AdminQueryItem[]> {
  const page = await getAdminQueriesPage({ page: 1, pageSize: normalizeLimit(limit, 500, 2000) });
  return page.items;
}

/** Relevant queries with a derived manager-friendly content status + pagination/filtering. */
export async function getAdminQueriesPage(filters: AdminQueryFilters = {}): Promise<AdminQueriesPage> {
  const page = normalizePage(filters.page);
  const pageSize = normalizeLimit(filters.pageSize, 100, 300);
  const offset = (page - 1) * pageSize;

  const where: string[] = [];
  const whereParams: unknown[] = [];
  const q = (filters.q ?? "").trim();
  if (q) {
    whereParams.push(`%${q}%`);
    where.push(`(n.keyword ILIKE $${whereParams.length} OR COALESCE(n.normalized_keyword, '') ILIKE $${whereParams.length})`);
  }

  const totalRow = await one<{ n: string }>(
    `SELECT COUNT(*)::text AS n
     FROM seo.normalized_keywords n
     ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}`,
    whereParams,
  );
  const total = Number(totalRow?.n ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const safeOffset = (safePage - 1) * pageSize;

  const rows = await run<{
    id: number;
    keyword: string;
    frequency: number;
    intent: string | null;
    is_relevant: boolean | null;
    cluster_id: number | null;
    cluster_name: string | null;
    has_article: boolean;
    plan_status: string | null;
  }>(
    `SELECT
       n.id,
       n.keyword,
       n.frequency,
       n.detected_intent AS intent,
       n.is_relevant,
       c.id AS cluster_id,
       c.cluster_name,
       EXISTS (
         SELECT 1 FROM seo.generated_articles a
         JOIN seo.content_plan_items p ON p.id = a.content_plan_item_id
         WHERE p.cluster_id = c.id
       ) AS has_article,
       (SELECT p.status FROM seo.content_plan_items p WHERE p.cluster_id = c.id ORDER BY p.id DESC LIMIT 1) AS plan_status
     FROM seo.normalized_keywords n
     LEFT JOIN seo.keyword_clusters c ON c.id = n.cluster_id
     ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY n.id DESC, n.frequency DESC NULLS LAST
     LIMIT $${whereParams.length + 1}
     OFFSET $${whereParams.length + 2}`,
    [...whereParams, pageSize, safeOffset],
  );

  const items = rows.map((r) => {
    let content_status: ContentStatus = "awaiting";
    const planStatus = r.plan_status ?? "";
    if (
      r.is_relevant === false ||
      !r.cluster_id ||
      planStatus === "rejected" ||
      planStatus === "needs_more_data"
    ) {
      content_status = "not_recommended";
    } else if (r.has_article || planStatus === "content_generated" || planStatus === "published") {
      content_status = "created";
    } else {
      content_status = "awaiting";
    }
    return {
      id: r.id,
      keyword: r.keyword,
      frequency: r.frequency,
      intent: r.intent,
      is_relevant: r.is_relevant,
      cluster_id: r.cluster_id,
      cluster_name: r.cluster_name,
      content_status,
    };
  });

  return {
    items,
    total,
    page: safePage,
    pageSize,
    totalPages,
  };
}

export async function getClusterTargets(limit = 300): Promise<ClusterTargetItem[]> {
  const safeLimit = normalizeLimit(limit, 300, 1000);
  return run<ClusterTargetItem>(
    `SELECT id, cluster_name, primary_keyword, total_frequency
     FROM seo.keyword_clusters
     WHERE status <> 'archived'
     ORDER BY total_frequency DESC, id DESC
     LIMIT $1`,
    [safeLimit],
  );
}

export type GeneratableCluster = {
  id: number;
  cluster_name: string | null;
  primary_keyword: string | null;
  total_frequency: number;
  keyword_count: number;
  plan_id: number;
  priority: number | null;
};

/** Clusters that have a content-plan item and no article yet (manual generation can override recommendation). */
export async function getGeneratableClusters(): Promise<GeneratableCluster[]> {
  return run<GeneratableCluster>(
    `SELECT
       c.id,
       c.cluster_name,
       c.primary_keyword,
       c.total_frequency,
       COUNT(ck.id)::int AS keyword_count,
       p.id AS plan_id,
       p.priority
     FROM seo.keyword_clusters c
     JOIN seo.content_plan_items p ON p.cluster_id = c.id
     LEFT JOIN seo.cluster_keywords ck ON ck.cluster_id = c.id
     WHERE c.status <> 'archived'
       AND p.status NOT IN ('published', 'content_generated')
       AND NOT EXISTS (SELECT 1 FROM seo.generated_articles a WHERE a.content_plan_item_id = p.id)
     GROUP BY c.id, p.id
     ORDER BY p.priority DESC NULLS LAST, c.total_frequency DESC, c.id DESC`,
  );
}
