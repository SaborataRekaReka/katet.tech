import type { MetadataRoute } from "next";
import { getSitemapPaths } from "@/lib/content";
import { siteUrl } from "@/lib/format";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const paths = await getSitemapPaths();
  const host = siteUrl();

  return paths.map((path) => ({
    url: `${host}${encodeURI(path.url_path)}`,
    lastModified: path.updated_at ? new Date(path.updated_at) : new Date(),
  }));
}