import { NextResponse } from "next/server";
import { guard } from "../../_guard";
import { run } from "@/lib/seo/db";
import { getArticle } from "@/lib/seo/queries";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard(request);
  if (denied) return denied;
  const { id } = await params;
  const article = await getArticle(Number(id));
  if (!article) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(article);
}

const EDITABLE = new Set([
  "title",
  "slug",
  "seo_title",
  "meta_description",
  "body_html",
  "body_markdown",
  "status",
]);

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard(request);
  if (denied) return denied;
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  for (const [key, value] of Object.entries(body)) {
    if (!EDITABLE.has(key)) continue;
    sets.push(`${key} = $${i}`);
    values.push(value);
    i += 1;
  }
  if (sets.length === 0) return NextResponse.json({ error: "no_editable_fields" }, { status: 400 });

  values.push(Number(id));
  await run(`UPDATE seo.generated_articles SET ${sets.join(", ")}, updated_at = NOW() WHERE id = $${i}`, values);
  return NextResponse.json({ ok: true });
}
