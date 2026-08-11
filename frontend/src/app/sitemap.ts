import type { MetadataRoute } from "next";
import { getSitemapPaths } from "@/lib/content";
import { siteUrl } from "@/lib/format";
import { SEO_BATCH_SERVICE_LINKS } from "@/lib/seoBatch20260811";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const paths = await getSitemapPaths();
  const host = siteUrl();
  const sitemapPaths = [
    ...paths,
    ...SEO_BATCH_SERVICE_LINKS
      .filter((item) => !paths.some((path) => path.url_path === item.url_path))
      .map((item) => ({ url_path: item.url_path, updated_at: null })),
  ];

  return sitemapPaths.map((path) => ({
    url: `${host}${encodeURI(path.url_path)}`,
    lastModified: path.updated_at ? new Date(path.updated_at) : new Date(),
  }));
}
