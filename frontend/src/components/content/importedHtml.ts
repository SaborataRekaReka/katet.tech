import { rewriteWordPressHtml } from "@/lib/format";

export function normalizeImportedBody(html: string | null | undefined) {
  return rewriteWordPressHtml(html || "").replace(/<h1\b([^>]*)>([\s\S]*?)<\/h1>/gi, "<h2$1>$2</h2>");
}