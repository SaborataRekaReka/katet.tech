import { defineEndpoint } from "@directus/extensions-sdk";

const DEFAULT_SEMANTICS_CLEANING = {
  min_frequency: 5,
  require_business_fit: true,
  junk_words: [],
};

function getSeoApiBaseUrl() {
  const explicit = (process.env.SEO_STUDIO_API_BASE_URL || "").trim();
  if (explicit) return explicit.replace(/\/$/, "");

  // Prevent runtime fetch failures on Linux production hosts where host.docker.internal is unavailable.
  if ((process.env.NODE_ENV || "").toLowerCase() === "production") {
    return "https://katet.tech";
  }

  return "http://host.docker.internal:3000";
}

function getSeoTokenFromEnv() {
  return (process.env.SEO_STUDIO_TOKEN || process.env.SEO_ADMIN_TOKEN || "").trim();
}

function getIncomingToken(req) {
  const header = req.headers["x-seo-token"];
  if (typeof header === "string" && header.trim()) return header.trim();
  if (Array.isArray(header) && header[0] && header[0].trim()) return header[0].trim();
  return "";
}

function getQueryString(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return "";
}

async function parseBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  return {};
}

async function callSeoApi(path, options = {}, requestToken = "") {
  const headers = { ...(options.headers || {}) };
  const token = requestToken || getSeoTokenFromEnv();

  if (token) headers["x-seo-token"] = token;
  if (options.body && !headers["content-type"]) headers["content-type"] = "application/json";

  const response = await fetch(`${getSeoApiBaseUrl()}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body,
    redirect: "follow",
  });

  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json")
    ? await response.json().catch(() => ({ error: "invalid_json_response" }))
    : { raw: await response.text().catch(() => "") };

  return { status: response.status, body };
}

function toInt(value, fallback, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const num = Number(value);
  if (!Number.isInteger(num)) return fallback;
  return Math.max(min, Math.min(max, num));
}

function parseRelatedPages(rawValue) {
  let raw = rawValue;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const source = typeof item.source === "string" ? item.source : "";
      const url = typeof item.url === "string" ? item.url : "";
      const title = typeof item.title === "string" ? item.title : "";
      const score = Number(item.score || 0);
      if (!source || !url || !title) return null;
      return {
        source,
        url,
        title,
        score: Number.isFinite(score) ? score : 0,
      };
    })
    .filter(Boolean);
}

function normalizeCleaningSettings(value) {
  const raw = value && typeof value === "object" ? value : {};
  const minFrequency = Number(raw.min_frequency);
  const junkWords = Array.isArray(raw.junk_words)
    ? raw.junk_words
        .map((word) => String(word || "").trim().toLowerCase())
        .filter((word) => word.length > 0)
        .slice(0, 300)
    : [];

  return {
    min_frequency: Number.isFinite(minFrequency)
      ? Math.max(1, Math.trunc(minFrequency))
      : DEFAULT_SEMANTICS_CLEANING.min_frequency,
    require_business_fit: raw.require_business_fit !== false,
    junk_words: junkWords,
  };
}

function getContentStatus(row) {
  const planStatus = String(row.plan_status || "");
  if (
    row.is_relevant === false ||
    !row.cluster_id ||
    planStatus === "rejected" ||
    planStatus === "needs_more_data"
  ) {
    return "not_recommended";
  }
  if (row.has_article || planStatus === "content_generated" || planStatus === "published") {
    return "created";
  }
  return "awaiting";
}

/**
 * Keep seo.generated_articles/content_plan_items consistent with actual blog post status.
 * If a linked post is no longer published (or removed), the SEO article is reopened as draft
 * and the plan item becomes regeneratable again.
 */
async function reconcileSeoArticleLinks(database) {
  await database.raw(
    `UPDATE seo.generated_articles a
       SET status = 'draft',
           published_post_id = NULL,
           published_at = NULL,
           url_path = NULL,
           updated_at = NOW()
     WHERE a.status = 'published'
       AND a.published_post_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
         FROM public.posts p
         WHERE p.id = a.published_post_id
           AND p.status = 'publish'
       )`,
  );

  await database.raw(
    `UPDATE seo.content_plan_items p
       SET status = CASE
             WHEN EXISTS (
               SELECT 1 FROM seo.content_briefs b WHERE b.content_plan_item_id = p.id
             ) THEN 'brief_created'
             ELSE 'approved'
           END,
           updated_at = NOW()
     WHERE p.status IN ('published', 'content_generated')
       AND NOT EXISTS (
         SELECT 1
         FROM seo.generated_articles a
         LEFT JOIN public.posts post ON post.id = a.published_post_id
         WHERE a.content_plan_item_id = p.id
           AND ${activeArticlePredicateSql("a", "post")}
       )`,
  );
}

function activeArticlePredicateSql(articleAlias = "a", postAlias = "post") {
  return `(
    ${articleAlias}.status IN ('draft', 'needs_review', 'approved')
    OR (
      ${articleAlias}.status = 'published'
      AND ${postAlias}.id IS NOT NULL
      AND ${postAlias}.status = 'publish'
    )
  )`;
}

function activePlanArticleExistsSql(planIdExpr = "p.id") {
  return `EXISTS (
    SELECT 1
    FROM seo.generated_articles a
    LEFT JOIN public.posts post ON post.id = a.published_post_id
    WHERE a.content_plan_item_id = ${planIdExpr}
      AND ${activeArticlePredicateSql("a", "post")}
  )`;
}

function activeClusterArticleExistsSql(clusterIdExpr = "c.id") {
  return `EXISTS (
    SELECT 1
    FROM seo.generated_articles a
    JOIN seo.content_plan_items p2 ON p2.id = a.content_plan_item_id
    LEFT JOIN public.posts post ON post.id = a.published_post_id
    WHERE p2.cluster_id = ${clusterIdExpr}
      AND ${activeArticlePredicateSql("a", "post")}
  )`;
}

export default defineEndpoint((router, { database }) => {
  async function proxy(req, res, targetPath, method = "GET", body = undefined) {
    const requestToken = getIncomingToken(req);
    const payload = body === undefined ? undefined : JSON.stringify(body || {});

    const proxied = await callSeoApi(
      targetPath,
      {
        method,
        body: payload,
      },
      requestToken,
    );

    res.status(proxied.status).json(proxied.body);
  }

  router.get("/health", (_req, res) => {
    res.json({ ok: true, bridge: "directus-extension-katet-seo-pipeline" });
  });

  router.get("/summary", async (_req, res) => {
    try {
      await reconcileSeoArticleLinks(database);

      const result = await database.raw(
        `SELECT
            COALESCE((SELECT value->>'mode' FROM seo.settings WHERE key = 'wordstat' LIMIT 1), 'csv') AS mode,
            (SELECT COUNT(*)::int FROM seo.company_context WHERE is_active) AS context_total,
            (SELECT COUNT(*)::int FROM seo.raw_keywords) AS raw_total,
            (SELECT COUNT(*)::int FROM seo.raw_keywords WHERE source = 'wordstat_api') AS raw_wordstat_api,
            (SELECT COUNT(*)::int FROM seo.raw_keywords WHERE source = 'csv') AS raw_csv,
            (SELECT COUNT(*)::int FROM seo.raw_keywords WHERE source = 'mock') AS raw_mock,
            (SELECT COUNT(*)::int FROM seo.normalized_keywords) AS normalized_total,
            (SELECT COUNT(*)::int FROM seo.normalized_keywords WHERE is_relevant = TRUE) AS normalized_relevant,
            (SELECT COUNT(*)::int FROM seo.normalized_keywords WHERE is_relevant = FALSE) AS normalized_irrelevant,
            (SELECT COUNT(*)::int FROM seo.keyword_clusters WHERE status <> 'archived') AS clusters_total,
            (SELECT COUNT(*)::int FROM seo.content_plan_items) AS plan_items,
            (SELECT COUNT(*)::int FROM seo.content_plan_items WHERE status = 'pending_review') AS plan_pending,
            (SELECT COUNT(*)::int FROM seo.content_plan_items WHERE status IN ('approved', 'ready_for_brief', 'brief_created', 'in_content_generation')) AS plan_approved,
            (SELECT COUNT(*)::int FROM seo.content_plan_items WHERE status IN ('content_generated', 'published')) AS plan_closed,
            (SELECT COUNT(*)::int FROM seo.content_plan_items WHERE status IN ('rejected', 'needs_more_data')) AS plan_rejected,
            (SELECT COUNT(*)::int FROM seo.generated_articles WHERE status IN ('draft', 'needs_review', 'approved')) AS articles_work,
            (SELECT COUNT(*)::int FROM seo.generated_articles WHERE status = 'draft') AS articles_draft,
            (SELECT COUNT(*)::int FROM seo.generated_articles WHERE status = 'published') AS articles_published,
            (SELECT COUNT(*)::int FROM public.posts) AS posts_total,
            (SELECT COUNT(*)::int FROM public.posts WHERE status = 'publish') AS posts_published,
            (SELECT COUNT(*)::int FROM public.posts WHERE status = 'draft') AS posts_draft,
            (SELECT COUNT(*)::int FROM seo.jobs WHERE status = 'running') AS jobs_running`
      );

      const row = result.rows?.[0] || {};
      res.json({
        mode: row.mode || "csv",
        contextTotal: Number(row.context_total || 0),
        rawTotal: Number(row.raw_total || 0),
        rawWordstatApi: Number(row.raw_wordstat_api || 0),
        rawCsv: Number(row.raw_csv || 0),
        rawMock: Number(row.raw_mock || 0),
        normalizedTotal: Number(row.normalized_total || 0),
        normalizedRelevant: Number(row.normalized_relevant || 0),
        normalizedIrrelevant: Number(row.normalized_irrelevant || 0),
        clustersTotal: Number(row.clusters_total || 0),
        planItems: Number(row.plan_items || 0),
        planPending: Number(row.plan_pending || 0),
        planApproved: Number(row.plan_approved || 0),
        planClosed: Number(row.plan_closed || 0),
        planRejected: Number(row.plan_rejected || 0),
        articlesWork: Number(row.articles_work || 0),
        articlesDraft: Number(row.articles_draft || 0),
        articlesPublished: Number(row.articles_published || 0),
        postsTotal: Number(row.posts_total || 0),
        postsPublished: Number(row.posts_published || 0),
        postsDraft: Number(row.posts_draft || 0),
        jobsRunning: Number(row.jobs_running || 0),
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "summary_failed" });
    }
  });

  router.get("/queries", async (req, res) => {
    const q = getQueryString(req.query.q).trim();
    const page = toInt(req.query.page, 1, 1, 10000);
    const pageSize = toInt(req.query.pageSize, 100, 20, 300);

    const where = ["n.is_relevant = TRUE"];
    const bindings = [];

    if (q) {
      const qLike = `%${q}%`;
      where.push("(n.keyword ILIKE ? OR COALESCE(n.normalized_keyword, '') ILIKE ?)");
      bindings.push(qLike, qLike);
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

    try {
      await reconcileSeoArticleLinks(database);

      const totalResult = await database.raw(
        `SELECT COUNT(*)::int AS n
         FROM seo.normalized_keywords n
         ${whereSql}`,
        bindings,
      );
      const total = Number(totalResult.rows?.[0]?.n || 0);
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const safePage = Math.min(page, totalPages);
      const offset = (safePage - 1) * pageSize;

      const result = await database.raw(
        `SELECT
            n.id,
            n.keyword,
            n.frequency,
            n.detected_intent AS intent,
            n.is_relevant,
            c.id AS cluster_id,
            c.cluster_name,
            ${activeClusterArticleExistsSql("c.id")} AS has_article,
            (
              SELECT p.status
              FROM seo.content_plan_items p
              WHERE p.cluster_id = c.id
              ORDER BY p.id DESC
              LIMIT 1
            ) AS plan_status
         FROM seo.normalized_keywords n
         LEFT JOIN seo.keyword_clusters c ON c.id = n.cluster_id
         ${whereSql}
         ORDER BY n.id DESC, n.frequency DESC NULLS LAST
         LIMIT ? OFFSET ?`,
        [...bindings, pageSize, offset],
      );

      const items = (result.rows || []).map((row) => ({
        id: Number(row.id),
        keyword: row.keyword,
        frequency: Number(row.frequency || 0),
        intent: row.intent || null,
        is_relevant: row.is_relevant,
        cluster_id: row.cluster_id ? Number(row.cluster_id) : null,
        cluster_name: row.cluster_name || null,
        plan_status: row.plan_status || null,
        has_article: Boolean(row.has_article),
        content_status: getContentStatus(row),
      }));

      res.json({
        items,
        total,
        page: safePage,
        pageSize,
        totalPages,
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "queries_fetch_failed" });
    }
  });

  router.get("/cluster-targets", async (req, res) => {
    const limit = toInt(req.query.limit, 300, 20, 1000);
    try {
      const result = await database.raw(
        `SELECT id, cluster_name, primary_keyword, total_frequency
         FROM seo.keyword_clusters
         WHERE status <> 'archived'
         ORDER BY total_frequency DESC, id DESC
         LIMIT ?`,
        [limit],
      );
      res.json({ items: result.rows || [] });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "cluster_targets_failed" });
    }
  });

  router.post("/queries", async (req, res) => {
    const body = await parseBody(req);
    try {
      await proxy(req, res, "/api/seo/queries/", "POST", body);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "queries_merge_failed" });
    }
  });

  router.delete("/queries", async (req, res) => {
    const body = await parseBody(req);
    try {
      await proxy(req, res, "/api/seo/queries/", "DELETE", body);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "queries_delete_failed" });
    }
  });

  router.post("/clusterize", async (req, res) => {
    const body = await parseBody(req);
    try {
      await proxy(req, res, "/api/seo/clusterize/", "POST", body);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "clusterize_failed" });
    }
  });

  router.get("/semantics/stats", async (_req, res) => {
    try {
      await reconcileSeoArticleLinks(database);

      const result = await database.raw(
        `SELECT
            COALESCE((SELECT value->>'mode' FROM seo.settings WHERE key = 'wordstat' LIMIT 1), 'csv') AS mode,
            (SELECT COUNT(*)::int FROM seo.raw_keywords) AS raw_total,
            (SELECT COUNT(*)::int FROM seo.raw_keywords WHERE source = 'wordstat_api') AS raw_wordstat_api,
            (SELECT COUNT(*)::int FROM seo.raw_keywords WHERE source = 'csv') AS raw_csv,
            (SELECT COUNT(*)::int FROM seo.raw_keywords WHERE source = 'mock') AS raw_mock,
            (SELECT COUNT(*)::int FROM seo.normalized_keywords) AS normalized_total,
            (SELECT COUNT(*)::int FROM seo.normalized_keywords WHERE is_relevant = TRUE) AS normalized_relevant,
            (SELECT COUNT(*)::int FROM seo.normalized_keywords WHERE is_relevant = FALSE) AS normalized_irrelevant,
            (SELECT COUNT(*)::int FROM seo.keyword_clusters WHERE status <> 'archived') AS clusters_total,
            (SELECT COUNT(*)::int FROM seo.content_plan_items) AS plan_items,
            (SELECT COUNT(*)::int FROM seo.content_plan_items p
              WHERE p.status IN ('content_generated', 'published')
              OR ${activePlanArticleExistsSql("p.id")}
            ) AS content_closed`
      );

      const row = result.rows?.[0] || {};
      res.json({
        mode: row.mode || "csv",
        rawTotal: Number(row.raw_total || 0),
        rawWordstatApi: Number(row.raw_wordstat_api || 0),
        rawCsv: Number(row.raw_csv || 0),
        rawMock: Number(row.raw_mock || 0),
        normalizedTotal: Number(row.normalized_total || 0),
        normalizedRelevant: Number(row.normalized_relevant || 0),
        normalizedIrrelevant: Number(row.normalized_irrelevant || 0),
        clustersTotal: Number(row.clusters_total || 0),
        planItems: Number(row.plan_items || 0),
        contentClosed: Number(row.content_closed || 0),
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "semantics_stats_failed" });
    }
  });

  router.get("/semantics/raw", async (req, res) => {
    const q = getQueryString(req.query.q).trim();
    const source = getQueryString(req.query.source).trim().toLowerCase();
    const limit = toInt(req.query.limit, 200, 20, 1000);

    const where = [];
    const bindings = [];

    if (source && source !== "all") {
      where.push("r.source = ?");
      bindings.push(source);
    }

    if (q) {
      const qLike = `%${q}%`;
      where.push("(r.keyword ILIKE ? OR COALESCE(r.seed_term, '') ILIKE ?)");
      bindings.push(qLike, qLike);
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

    try {
      const result = await database.raw(
        `SELECT r.id, r.source, r.seed_term, r.keyword, r.frequency, r.region, r.period, r.imported_at
         FROM seo.raw_keywords r
         ${whereSql}
         ORDER BY r.id DESC
         LIMIT ?`,
        [...bindings, limit],
      );
      res.json({ items: result.rows || [] });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "raw_fetch_failed" });
    }
  });

  router.get("/semantics/normalized", async (req, res) => {
    const q = getQueryString(req.query.q).trim();
    const source = getQueryString(req.query.source).trim().toLowerCase();
    const relevance = getQueryString(req.query.relevance).trim().toLowerCase();
    const limit = toInt(req.query.limit, 200, 20, 1000);

    const where = [];
    const bindings = [];

    if (source && source !== "all") {
      where.push("r.source = ?");
      bindings.push(source);
    }

    if (relevance === "relevant") {
      where.push("n.is_relevant = TRUE");
    } else if (relevance === "irrelevant") {
      where.push("n.is_relevant = FALSE");
    }

    if (q) {
      const qLike = `%${q}%`;
      where.push("(n.keyword ILIKE ? OR COALESCE(n.normalized_keyword, '') ILIKE ?)");
      bindings.push(qLike, qLike);
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

    try {
      const result = await database.raw(
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
            n.created_at
         FROM seo.normalized_keywords n
         LEFT JOIN seo.raw_keywords r ON r.id = n.raw_keyword_id
         ${whereSql}
         ORDER BY n.id DESC
         LIMIT ?`,
        [...bindings, limit],
      );
      res.json({ items: result.rows || [] });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "normalized_fetch_failed" });
    }
  });

  router.get("/semantics/clusters", async (req, res) => {
    const limit = toInt(req.query.limit, 100, 20, 500);
    try {
      await reconcileSeoArticleLinks(database);

      const result = await database.raw(
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
            ${activePlanArticleExistsSql("p.id")} AS has_article,
            (
              SELECT a.id
              FROM seo.generated_articles a
              LEFT JOIN public.posts post ON post.id = a.published_post_id
              WHERE a.content_plan_item_id = p.id
                AND ${activeArticlePredicateSql("a", "post")}
              ORDER BY a.id DESC
              LIMIT 1
            ) AS article_id
         FROM seo.keyword_clusters c
         LEFT JOIN seo.cluster_keywords ck ON ck.cluster_id = c.id
         LEFT JOIN seo.content_plan_items p ON p.cluster_id = c.id
         WHERE c.status <> 'archived'
         GROUP BY c.id, p.id
         ORDER BY COALESCE(p.priority, c.content_priority_score, 0) DESC, c.total_frequency DESC, c.id DESC
         LIMIT ?`,
        [limit],
      );

      const items = (result.rows || []).map((row) => ({
        ...row,
        coverage_score: row.coverage_score == null ? null : Number(row.coverage_score),
        related_pages: parseRelatedPages(row.related_pages_raw),
      }));
      res.json({ items });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "clusters_fetch_failed" });
    }
  });

  router.get("/semantics/cleaning", async (req, res) => {
    try {
      const requestToken = getIncomingToken(req);
      const proxied = await callSeoApi("/api/seo/semantics/clean/", {}, requestToken);
      if (proxied.status >= 400) {
        res.status(proxied.status).json(proxied.body);
        return;
      }

      const value = proxied.body?.settings;
      res.json({ settings: normalizeCleaningSettings(value) });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "cleaning_config_failed" });
    }
  });

  router.post("/semantics/cleaning", async (req, res) => {
    const body = await parseBody(req);
    try {
      await proxy(req, res, "/api/seo/semantics/clean/", "POST", body);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "semantics_clean_failed" });
    }
  });

  router.post("/semantics/rebuild", async (req, res) => {
    const body = await parseBody(req);
    try {
      await proxy(req, res, "/api/seo/semantics/rebuild/", "POST", body);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "semantics_rebuild_failed" });
    }
  });

  router.post("/semantics/purge-mock", async (req, res) => {
    try {
      await proxy(req, res, "/api/seo/semantics/purge-mock/", "POST", {});
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "purge_mock_failed" });
    }
  });

  router.post("/keywords/import", async (req, res) => {
    const body = await parseBody(req);
    try {
      await proxy(req, res, "/api/seo/keywords/import/", "POST", body);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "keywords_import_failed" });
    }
  });

  router.get("/site-index", async (_req, res) => {
    const tables = {
      pages: "public.pages",
      posts: "public.posts",
      equipmentTypes: "public.equipment_types",
      workTypes: "public.work_types",
      brands: "public.brands",
    };

    const stats = {
      pages: 0,
      posts: 0,
      equipmentTypes: 0,
      workTypes: 0,
      brands: 0,
      total: 0,
    };

    for (const [key, tableName] of Object.entries(tables)) {
      try {
        const result = await database.raw(
          `SELECT COUNT(*)::int AS n FROM ${tableName} WHERE url_path IS NOT NULL`,
        );
        stats[key] = Number(result.rows?.[0]?.n || 0);
      } catch {
        stats[key] = 0;
      }
    }

    stats.total = stats.pages + stats.posts + stats.equipmentTypes + stats.workTypes + stats.brands;
    res.json(stats);
  });

  router.get("/clusters/:id/keywords", async (req, res) => {
    try {
      await proxy(req, res, `/api/seo/clusters/${encodeURIComponent(req.params.id)}/keywords/`);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "cluster_keywords_failed" });
    }
  });

  router.delete("/clusters/:id/keywords", async (req, res) => {
    const body = await parseBody(req);
    try {
      await proxy(req, res, `/api/seo/clusters/${encodeURIComponent(req.params.id)}/keywords/`, "DELETE", body);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "cluster_keyword_delete_failed" });
    }
  });

  router.delete("/clusters/:id", async (req, res) => {
    try {
      await proxy(req, res, `/api/seo/clusters/${encodeURIComponent(req.params.id)}/`, "DELETE");
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "cluster_delete_failed" });
    }
  });

  router.get("/context", async (_req, res) => {
    try {
      const result = await database.raw(
        `SELECT id, context_type, name, description, is_active, is_allowed_for_seo
         FROM seo.company_context
         ORDER BY context_type, name`,
      );
      res.json({ items: result.rows || [] });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "context_fetch_failed" });
    }
  });

  router.post("/context", async (req, res) => {
    const body = await parseBody(req);
    try {
      await proxy(req, res, "/api/seo/context/", "POST", body);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "context_create_failed" });
    }
  });

  router.delete("/context/:id", async (req, res) => {
    try {
      await proxy(req, res, `/api/seo/context/?id=${encodeURIComponent(req.params.id)}`, "DELETE");
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "context_delete_failed" });
    }
  });

  router.delete("/context", async (req, res) => {
    const all = getQueryString(req.query.all).trim().toLowerCase();
    if (all === "1" || all === "true") {
      try {
        await proxy(req, res, "/api/seo/context/?all=1", "DELETE");
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : "context_delete_failed" });
      }
      return;
    }

    const id = getQueryString(req.query.id).trim();
    if (!id) {
      res.status(400).json({ error: "id_required" });
      return;
    }
    try {
      await proxy(req, res, `/api/seo/context/?id=${encodeURIComponent(id)}`, "DELETE");
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "context_delete_failed" });
    }
  });

  router.get("/settings/models", async (req, res) => {
    try {
      await proxy(req, res, "/api/seo/settings/models/");
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "models_settings_failed" });
    }
  });

  router.post("/settings/models", async (req, res) => {
    const body = await parseBody(req);
    try {
      await proxy(req, res, "/api/seo/settings/models/", "POST", body);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "models_settings_save_failed" });
    }
  });

  router.get("/settings/models/catalog", async (req, res) => {
    try {
      await proxy(req, res, "/api/seo/settings/models/catalog/");
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "models_catalog_failed" });
    }
  });

  router.get("/settings/openai-key", async (req, res) => {
    try {
      await proxy(req, res, "/api/seo/settings/openai-key/");
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "openai_key_fetch_failed" });
    }
  });

  router.post("/settings/openai-key", async (req, res) => {
    const body = await parseBody(req);
    try {
      await proxy(req, res, "/api/seo/settings/openai-key/", "POST", body);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "openai_key_save_failed" });
    }
  });

  router.delete("/settings/openai-key", async (req, res) => {
    try {
      await proxy(req, res, "/api/seo/settings/openai-key/", "DELETE");
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "openai_key_delete_failed" });
    }
  });

  router.get("/generatable-clusters", async (_req, res) => {
    try {
      await reconcileSeoArticleLinks(database);

      // Manual clusters can exist without a plan item (for example after ad-hoc merges in Queries).
      // Auto-seed missing plan rows so such clusters become available in the Generation tab.
      await database.raw(
        `INSERT INTO seo.content_plan_items (
            cluster_id,
            page_type,
            recommended_action,
            status,
            priority,
            reason,
            proposed_title,
            proposed_url,
            target_existing_url,
            created_at,
            updated_at
          )
         SELECT
            c.id,
            COALESCE(NULLIF(c.cluster_type, ''), 'service') AS page_type,
            NULLIF(c.recommended_action, '') AS recommended_action,
            'pending_review' AS status,
            COALESCE(c.content_priority_score, 0) AS priority,
            'auto_from_cluster' AS reason,
            COALESCE(NULLIF(c.cluster_name, ''), NULLIF(c.primary_keyword, ''), CONCAT('Кластер #', c.id::text)) AS proposed_title,
            c.proposed_url,
            c.target_existing_url,
            NOW(),
            NOW()
         FROM seo.keyword_clusters c
         LEFT JOIN seo.content_plan_items p ON p.cluster_id = c.id
         WHERE p.id IS NULL
           AND c.status <> 'archived'
           AND EXISTS (SELECT 1 FROM seo.cluster_keywords ck WHERE ck.cluster_id = c.id)
           AND NOT ${activeClusterArticleExistsSql("c.id")}`,
      );

      const result = await database.raw(
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
           AND NOT ${activePlanArticleExistsSql("p.id")}
         GROUP BY c.id, p.id
         ORDER BY p.priority DESC NULLS LAST, c.total_frequency DESC, c.id DESC`,
      );
      res.json({ items: result.rows || [] });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "generatable_clusters_failed" });
    }
  });

  router.post("/articles/by-clusters", async (req, res) => {
    const body = await parseBody(req);
    try {
      await proxy(req, res, "/api/seo/articles/by-clusters/", "POST", body);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "drafts_by_clusters_failed" });
    }
  });

  router.get("/plan", async (req, res) => {
    const limit = toInt(req.query.limit, 80, 1, 200);
    const offset = toInt(req.query.offset, 0, 0, 1000000);
    const statusRaw = getQueryString(req.query.status).trim();
    const status = statusRaw || null;

    try {
      await reconcileSeoArticleLinks(database);

      const result = await database.raw(
        `SELECT
            p.id,
            p.cluster_id,
            p.status,
            p.priority,
            p.page_type,
            p.recommended_action,
            p.proposed_title,
            p.reason,
            p.target_existing_url,
            p.proposed_url,
            p.updated_at,
            c.cluster_name,
            c.primary_keyword,
            c.main_intent,
            c.total_frequency,
            ${activePlanArticleExistsSql("p.id")} AS has_article,
            a.id AS article_id,
            a.status AS article_status
         FROM seo.content_plan_items p
         LEFT JOIN seo.keyword_clusters c ON c.id = p.cluster_id
         LEFT JOIN LATERAL (
           SELECT ga.id, ga.status
           FROM seo.generated_articles ga
           LEFT JOIN public.posts post ON post.id = ga.published_post_id
           WHERE ga.content_plan_item_id = p.id
             AND ${activeArticlePredicateSql("ga", "post")}
           ORDER BY ga.id DESC
           LIMIT 1
         ) a ON TRUE
         WHERE (COALESCE(?, '') = '' OR p.status = ?)
         ORDER BY p.priority DESC, p.id DESC
         LIMIT ? OFFSET ?`,
        [status, status, limit, offset],
      );

      res.json({ items: result.rows || [] });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "plan_fetch_failed" });
    }
  });

  router.get("/articles", async (req, res) => {
    const limit = toInt(req.query.limit, 80, 1, 200);
    const offset = toInt(req.query.offset, 0, 0, 1000000);
    const statusRaw = getQueryString(req.query.status).trim();
    const status = statusRaw || null;

    try {
      await reconcileSeoArticleLinks(database);

      const result = await database.raw(
        `SELECT
            a.id,
            a.status,
            a.title,
            a.slug,
            a.url_path,
            a.seo_title,
            a.meta_description,
            a.updated_at,
            a.published_post_id,
            p.id AS plan_id,
            c.id AS cluster_id,
            c.cluster_name,
            post.status AS post_status,
            post.url_path AS post_url_path
         FROM seo.generated_articles a
         LEFT JOIN seo.content_plan_items p ON p.id = a.content_plan_item_id
         LEFT JOIN seo.keyword_clusters c ON c.id = p.cluster_id
         LEFT JOIN public.posts post ON post.id = a.published_post_id
         WHERE (COALESCE(?, '') = '' OR a.status = ?)
         ORDER BY a.updated_at DESC, a.id DESC
         LIMIT ? OFFSET ?`,
        [status, status, limit, offset],
      );

      res.json({ items: result.rows || [] });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "articles_fetch_failed" });
    }
  });

  router.get("/posts", async (req, res) => {
    const limit = toInt(req.query.limit, 60, 1, 200);
    const offset = toInt(req.query.offset, 0, 0, 1000000);
    const q = getQueryString(req.query.q).trim();
    const statusRaw = getQueryString(req.query.status).trim();
    const status = statusRaw && statusRaw !== "all" ? statusRaw : null;

    const where = [];
    const bindings = [];

    if (status) {
      where.push("post.status = ?");
      bindings.push(status);
    }

    if (q) {
      const qLike = `%${q}%`;
      where.push("(post.title ILIKE ? OR COALESCE(post.url_path, '') ILIKE ?)");
      bindings.push(qLike, qLike);
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

    try {
      await reconcileSeoArticleLinks(database);

      const result = await database.raw(
        `SELECT
            post.id,
            post.title,
            post.status,
            post.url_path,
            COALESCE(post.wp_updated_at, post.migrated_at) AS updated_at,
            link.cluster_id,
            link.cluster_name,
            link.draft_id,
            COALESCE((
              SELECT json_agg(json_build_object('id', cat.id, 'name', cat.name) ORDER BY cat.sort NULLS LAST, cat.name)
              FROM public.posts_categories rel
              JOIN public.categories cat ON cat.id = rel.category_id
              WHERE rel.post_id = post.id
            ), '[]'::json) AS categories
         FROM public.posts post
         LEFT JOIN LATERAL (
           SELECT cl.id AS cluster_id, cl.cluster_name, a.id AS draft_id
           FROM seo.generated_articles a
           JOIN seo.content_plan_items pi ON pi.id = a.content_plan_item_id
           JOIN seo.keyword_clusters cl ON cl.id = pi.cluster_id
           WHERE a.published_post_id = post.id
           ORDER BY a.id DESC
           LIMIT 1
         ) link ON TRUE
         ${whereSql}
         ORDER BY COALESCE(post.wp_created_at, post.migrated_at) DESC NULLS LAST, post.id DESC
         LIMIT ? OFFSET ?`,
        [...bindings, limit, offset],
      );

      const counts = await database.raw(
        `SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status = 'publish')::int AS published,
            COUNT(*) FILTER (WHERE status = 'draft')::int AS draft,
            COUNT(*) FILTER (WHERE status = 'archived')::int AS archived
         FROM public.posts`,
      );

      res.json({ items: result.rows || [], counts: counts.rows?.[0] || {} });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "posts_fetch_failed" });
    }
  });

  router.post("/posts/:id/status", async (req, res) => {
    const body = await parseBody(req);
    const status = typeof body.status === "string" ? body.status : "";
    if (!["publish", "draft", "archived"].includes(status)) {
      res.status(400).json({ error: "invalid_status" });
      return;
    }
    try {
      await database.raw(
        `UPDATE public.posts SET status = ?, wp_updated_at = NOW() WHERE id = ?`,
        [status, toInt(req.params.id, 0, 0)],
      );

      await reconcileSeoArticleLinks(database);

      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "post_status_failed" });
    }
  });

  router.get("/jobs", async (req, res) => {
    const limit = toInt(req.query.limit, 40, 1, 200);

    try {
      const result = await database.raw(
        `SELECT id, kind, status, step, progress, total, error, started_at, finished_at
         FROM seo.jobs
         ORDER BY id DESC
         LIMIT ?`,
        [limit],
      );
      res.json({ items: result.rows || [] });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "jobs_fetch_failed" });
    }
  });

  router.get("/jobs/:id", async (req, res) => {
    try {
      const proxied = await callSeoApi(
        `/api/seo/jobs/${encodeURIComponent(req.params.id)}/`,
        {},
        getIncomingToken(req),
      );
      res.status(proxied.status).json(proxied.body);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "job_proxy_failed" });
    }
  });

  router.post("/pipeline/run", async (req, res) => {
    const body = await parseBody(req);
    try {
      await proxy(req, res, "/api/seo/pipeline/run/", "POST", body);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "pipeline_run_failed" });
    }
  });

  router.post("/articles/generate-batch", async (req, res) => {
    const body = await parseBody(req);
    try {
      await proxy(req, res, "/api/seo/articles/generate-batch/", "POST", body);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "generate_batch_failed" });
    }
  });

  router.post("/plan/:id/review", async (req, res) => {
    const body = await parseBody(req);
    try {
      await proxy(req, res, `/api/seo/plan/${encodeURIComponent(req.params.id)}/review/`, "POST", body);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "plan_review_failed" });
    }
  });

  router.post("/plan/:id/brief", async (req, res) => {
    try {
      await proxy(req, res, `/api/seo/plan/${encodeURIComponent(req.params.id)}/brief/`, "POST", {});
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "plan_brief_failed" });
    }
  });

  router.post("/plan/:id/article", async (req, res) => {
    try {
      await proxy(req, res, `/api/seo/plan/${encodeURIComponent(req.params.id)}/article/`, "POST", {});
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "plan_article_failed" });
    }
  });

  router.get("/articles/:id", async (req, res) => {
    try {
      const proxied = await callSeoApi(
        `/api/seo/articles/${encodeURIComponent(req.params.id)}/`,
        {},
        getIncomingToken(req),
      );
      res.status(proxied.status).json(proxied.body);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "article_fetch_failed" });
    }
  });

  router.patch("/articles/:id", async (req, res) => {
    const body = await parseBody(req);
    try {
      await proxy(req, res, `/api/seo/articles/${encodeURIComponent(req.params.id)}/`, "PATCH", body);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "article_update_failed" });
    }
  });

  router.delete("/articles/:id", async (req, res) => {
    try {
      await proxy(req, res, `/api/seo/articles/${encodeURIComponent(req.params.id)}/`, "DELETE");
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "article_delete_failed" });
    }
  });

  router.post("/articles/:id/publish", async (req, res) => {
    try {
      await proxy(req, res, `/api/seo/articles/${encodeURIComponent(req.params.id)}/publish/`, "POST", {});
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "article_publish_failed" });
    }
  });
});
