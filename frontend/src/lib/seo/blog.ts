import "server-only";

import { one, run } from "./db";

/** Admin helpers for the unified "Статьи" tab: site blog posts + SEO drafts. */

export type BlogCategory = { id: number; name: string; slug: string };

export type AdminArticle = {
  kind: "post" | "draft";
  /** posts.id for kind=post, generated_articles.id for kind=draft */
  id: number;
  title: string;
  status: string;
  url_path: string | null;
  updated_at: string | null;
  cluster_id: number | null;
  cluster_name: string | null;
  categories: BlogCategory[];
};

const POST_STATUSES = new Set(["publish", "draft", "archived"]);

export async function getAdminCategories(): Promise<BlogCategory[]> {
  return run<BlogCategory>(
    `SELECT id, name, slug FROM public.categories ORDER BY sort NULLS LAST, name`,
  );
}

/** Unified article list: published/draft/archived site posts + not-yet-published SEO drafts. */
export async function getAdminArticles(): Promise<AdminArticle[]> {
  const posts = await run<AdminArticle>(
    `SELECT
       'post'::text AS kind,
       p.id,
       p.title,
       p.status,
       p.url_path,
       COALESCE(p.wp_updated_at, p.migrated_at)::text AS updated_at,
       link.cluster_id,
       link.cluster_name,
       COALESCE((
         SELECT json_agg(json_build_object('id', c.id, 'name', c.name, 'slug', c.slug) ORDER BY c.sort NULLS LAST, c.name)
         FROM public.posts_categories rel
         JOIN public.categories c ON c.id = rel.category_id
         WHERE rel.post_id = p.id
       ), '[]'::json) AS categories
     FROM public.posts p
     LEFT JOIN LATERAL (
       SELECT cl.id AS cluster_id, cl.cluster_name
       FROM seo.generated_articles a
       JOIN seo.content_plan_items pi ON pi.id = a.content_plan_item_id
       JOIN seo.keyword_clusters cl ON cl.id = pi.cluster_id
       WHERE a.published_post_id = p.id
       ORDER BY a.id DESC LIMIT 1
     ) link ON TRUE
     ORDER BY COALESCE(p.wp_created_at, p.migrated_at) DESC NULLS LAST, p.id DESC`,
  );

  const drafts = await run<AdminArticle>(
    `SELECT
       'draft'::text AS kind,
       a.id,
       a.title,
       a.status,
       a.url_path,
       a.updated_at::text AS updated_at,
       cl.id AS cluster_id,
       cl.cluster_name,
       '[]'::json AS categories
     FROM seo.generated_articles a
     LEFT JOIN seo.content_plan_items pi ON pi.id = a.content_plan_item_id
     LEFT JOIN seo.keyword_clusters cl ON cl.id = pi.cluster_id
     WHERE a.published_post_id IS NULL
     ORDER BY a.id DESC`,
  );

  return [...drafts, ...posts];
}

export type AdminPost = {
  id: number;
  title: string;
  slug: string;
  url_path: string | null;
  status: string;
  body: string | null;
  excerpt: string | null;
  seo_title: string | null;
  meta_description: string | null;
  category_ids: number[];
};

export async function getAdminPost(id: number): Promise<AdminPost | null> {
  const post = await one<Omit<AdminPost, "category_ids">>(
    `SELECT id, title, slug, url_path, status, body, excerpt, seo_title, meta_description
     FROM public.posts WHERE id = $1`,
    [id],
  );
  if (!post) return null;
  const cats = await run<{ category_id: number }>(
    `SELECT category_id FROM public.posts_categories WHERE post_id = $1`,
    [id],
  );
  return { ...post, category_ids: cats.map((c) => c.category_id) };
}

export async function updatePost(
  id: number,
  patch: Partial<Pick<AdminPost, "title" | "body" | "excerpt" | "seo_title" | "meta_description" | "status">>,
): Promise<void> {
  const fields: string[] = [];
  const params: unknown[] = [];
  const set = (col: string, value: unknown) => {
    params.push(value);
    fields.push(`${col} = $${params.length}`);
  };
  if (patch.title !== undefined) set("title", patch.title);
  if (patch.body !== undefined) set("body", patch.body);
  if (patch.excerpt !== undefined) set("excerpt", patch.excerpt);
  if (patch.seo_title !== undefined) set("seo_title", patch.seo_title);
  if (patch.meta_description !== undefined) set("meta_description", patch.meta_description);
  if (patch.status !== undefined) {
    if (!POST_STATUSES.has(patch.status)) throw new Error("invalid_status");
    set("status", patch.status);
  }
  if (fields.length === 0) return;
  params.push(id);
  await run(`UPDATE public.posts SET ${fields.join(", ")}, wp_updated_at = NOW() WHERE id = $${params.length}`, params);
}

export async function setPostCategories(postId: number, categoryIds: number[]): Promise<void> {
  await run(`DELETE FROM public.posts_categories WHERE post_id = $1`, [postId]);
  const unique = Array.from(new Set(categoryIds.filter((n) => Number.isFinite(n))));
  for (const categoryId of unique) {
    await run(
      `INSERT INTO public.posts_categories (post_id, category_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [postId, categoryId],
    );
  }
}

/** Set a post status (publish/draft/archived). */
export async function setPostStatus(id: number, status: string): Promise<void> {
  if (!POST_STATUSES.has(status)) throw new Error("invalid_status");
  await run(`UPDATE public.posts SET status = $2, wp_updated_at = NOW() WHERE id = $1`, [id, status]);
}

export type SeoDraft = {
  id: number;
  title: string;
  slug: string;
  url_path: string | null;
  status: string;
  seo_title: string | null;
  meta_description: string | null;
  body_html: string | null;
};

export async function getSeoDraft(id: number): Promise<SeoDraft | null> {
  return one<SeoDraft>(
    `SELECT id, title, slug, url_path, status, seo_title, meta_description, body_html
     FROM seo.generated_articles WHERE id = $1`,
    [id],
  );
}

export async function updateSeoDraft(
  id: number,
  patch: Partial<Pick<SeoDraft, "title" | "seo_title" | "meta_description" | "body_html">>,
): Promise<void> {
  const fields: string[] = [];
  const params: unknown[] = [];
  const set = (col: string, value: unknown) => {
    params.push(value);
    fields.push(`${col} = $${params.length}`);
  };
  if (patch.title !== undefined) set("title", patch.title);
  if (patch.seo_title !== undefined) set("seo_title", patch.seo_title);
  if (patch.meta_description !== undefined) set("meta_description", patch.meta_description);
  if (patch.body_html !== undefined) set("body_html", patch.body_html);
  if (fields.length === 0) return;
  params.push(id);
  await run(
    `UPDATE seo.generated_articles SET ${fields.join(", ")}, updated_at = NOW() WHERE id = $${params.length}`,
    params,
  );
}

/** Archive an SEO draft (status=rejected so it leaves the active list). */
export async function archiveSeoDraft(id: number): Promise<void> {
  await run(`UPDATE seo.generated_articles SET status = 'rejected', updated_at = NOW() WHERE id = $1`, [id]);
}

export type DraftLink = {
  id: number;
  title: string;
  url_path: string | null;
  status: string;
  cluster_id: number | null;
  cluster_name: string | null;
};

/** Latest article drafts created for the given clusters (for the generation results list). */
export async function getDraftsForClusters(clusterIds: number[]): Promise<DraftLink[]> {
  const ids = Array.from(new Set(clusterIds.filter((n) => Number.isFinite(n))));
  if (ids.length === 0) return [];
  return run<DraftLink>(
    `SELECT a.id, a.title, a.url_path, a.status, cl.id AS cluster_id, cl.cluster_name
     FROM seo.generated_articles a
     JOIN seo.content_plan_items pi ON pi.id = a.content_plan_item_id
     JOIN seo.keyword_clusters cl ON cl.id = pi.cluster_id
     WHERE cl.id = ANY($1::int[])
     ORDER BY a.id DESC`,
    [ids],
  );
}
