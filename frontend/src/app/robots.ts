import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const host = process.env.NEXT_PUBLIC_SITE_URL ?? "https://katet.tech";

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/reviews/"],
      },
    ],
    sitemap: `${host.replace(/\/$/, "")}/sitemap.xml`,
  };
}