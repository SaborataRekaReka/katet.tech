import "server-only";

import { one, run } from "./db";

/**
 * Publish a generated article draft into the live site (public.posts).
 * Ensures a unique url_path/slug and links the records back together.
 */

type ArticleRow = {
  id: number;
  content_plan_item_id: number;
  title: string;
  slug: string;
  url_path: string;
  seo_title: string | null;
  meta_description: string | null;
  body_html: string | null;
  schema_jsonld: unknown;
  status: string;
  published_post_id: number | null;
};

async function uniqueUrlPath(slug: string): Promise<{ slug: string; urlPath: string }> {
  let candidateSlug = slug;
  let urlPath = `/${candidateSlug}/`;
  let suffix = 1;
  // posts.url_path is UNIQUE — find a free path
  while (true) {
    const existing = await one<{ id: number }>(`SELECT id FROM public.posts WHERE url_path = $1`, [urlPath]);
    if (!existing) break;
    suffix += 1;
    candidateSlug = `${slug}-${suffix}`;
    urlPath = `/${candidateSlug}/`;
  }
  return { slug: candidateSlug, urlPath };
}

/** Publish a draft article. Returns the new post id. */
export async function publishArticle(articleId: number): Promise<number> {
  const article = await one<ArticleRow>(`SELECT * FROM seo.generated_articles WHERE id = $1`, [articleId]);
  if (!article) throw new Error(`Article ${articleId} not found`);
  if (article.published_post_id) return article.published_post_id;

  const { slug, urlPath } = await uniqueUrlPath(article.slug);

  const post = await one<{ id: number }>(
    `INSERT INTO public.posts
       (status, title, slug, url_path, body, seo_title, meta_description, schema_type, schema_override, wp_created_at, wp_updated_at)
     VALUES ('publish', $1, $2, $3, $4, $5, $6, 'Article', $7, NOW(), NOW())
     RETURNING id`,
    [
      article.title,
      slug,
      urlPath,
      article.body_html,
      article.seo_title,
      article.meta_description,
      article.schema_jsonld ? JSON.stringify(article.schema_jsonld) : null,
    ],
  );
  const postId = post!.id;

  await run(
    `UPDATE seo.generated_articles
       SET status = 'published', published_post_id = $1, published_at = NOW(), url_path = $2, slug = $3, updated_at = NOW()
     WHERE id = $4`,
    [postId, urlPath, slug, articleId],
  );
  await run(`UPDATE seo.content_plan_items SET status = 'published', updated_at = NOW() WHERE id = $1`, [
    article.content_plan_item_id,
  ]);

  return postId;
}
