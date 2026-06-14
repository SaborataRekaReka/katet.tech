import type { Metadata } from "next";

export type SeoRecord = {
  title?: string | null;
  name?: string | null;
  seo_title?: string | null;
  meta_description?: string | null;
  canonical_url?: string | null;
  robots?: string | null;
  url_path?: string | null;
};

export type ImageFile = {
  id: string | null;
  filename_download?: string | null;
  title?: string | null;
  type?: string | null;
};

function envUrl(name: string, fallback: string) {
  const value = process.env[name]?.trim();
  return (value || fallback).replace(/\/$/, "");
}

export function siteUrl() {
  return envUrl("NEXT_PUBLIC_SITE_URL", "https://katet.tech");
}

export function directusUrl() {
  return envUrl("NEXT_PUBLIC_DIRECTUS_URL", "http://localhost:8055");
}

export function assetUrl(image?: ImageFile | null) {
  if (!image?.id) return null;
  return `${directusUrl()}/assets/${image.id}`;
}

export function ensureTrailingSlash(path: string) {
  if (!path || path === "/") return "/";
  const withSlash = path.startsWith("/") ? path : `/${path}`;
  return withSlash.endsWith("/") ? withSlash : `${withSlash}/`;
}

export function canonicalForPath(path?: string | null) {
  return `${siteUrl()}${ensureTrailingSlash(path ?? "/")}`;
}

export function stripHtml(html?: string | null) {
  if (!html) return "";
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export function excerptFromHtml(html?: string | null, fallback?: string | null, limit = 190) {
  const text = stripHtml(fallback || html);
  if (text.length <= limit) return text;
  return `${text.slice(0, limit).trim()}...`;
}

export function rewriteWordPressHtml(html?: string | null) {
  if (!html) return "";

  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<img\b[^>]*(?:wp-content|wp-includes|elementor|localhost:8081)[^>]*>/gi, "")
    .replace(/<source\b[^>]*(?:wp-content|wp-includes|elementor|localhost:8081)[^>]*>/gi, "")
    .replace(/\s(?:href|src|srcset)=("|')[^"']*(?:wp-content|wp-includes|elementor|localhost:8081)[^"']*\1/gi, "")
    .replace(/\s(?:class|id|style|data-[\w:-]+)=("|')[\s\S]*?\1/gi, "")
    .replace(/\s(?:class|id|style|data-[\w:-]+)=[^\s>]+/gi, "")
    .replace(/https?:\/\/(?:www\.)?katet\.tech\/wp-content\/uploads\/[^\s"'<>)]*/gi, "")
    .replace(/http:\/\/localhost:8081\/wp-content\/uploads\/[^\s"'<>)]*/gi, "")
    .replace(/\/wp-content\/uploads\/[^\s"'<>)]*/gi, "")
    .replace(/https?:\/\/katet\.tech/g, "")
    .replace(/https?:\/\/www\.katet\.tech/g, "")
    .replace(/\s{2,}/g, " ");
}

export function formatPrice(value?: string | number | null) {
  if (value === null || value === undefined || value === "") return "по запросу";
  const number = Number(value);
  if (Number.isFinite(number)) {
    return `${new Intl.NumberFormat("ru-RU").format(number)} ₽`;
  }
  return String(value);
}

export function metadataFrom(record: SeoRecord | null | undefined, fallbackTitle: string): Metadata {
  const title = record?.seo_title || record?.title || record?.name || fallbackTitle;
  const description = record?.meta_description || undefined;
  const robotsValue = record?.robots || "";

  return {
    title,
    description,
    alternates: {
      canonical: record?.canonical_url || canonicalForPath(record?.url_path),
    },
    openGraph: {
      title,
      description,
      url: canonicalForPath(record?.url_path),
      siteName: "Катет",
      locale: "ru_RU",
      type: "website",
    },
    robots: robotsValue
      ? {
          index: !robotsValue.includes("noindex"),
          follow: !robotsValue.includes("nofollow"),
        }
      : undefined,
  };
}