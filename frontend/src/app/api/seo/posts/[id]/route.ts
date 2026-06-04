import { NextResponse } from "next/server";
import { guard } from "../../_guard";
import { getAdminPost, setPostCategories, setPostStatus, updatePost } from "@/lib/seo/blog";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard(request);
  if (denied) return denied;
  const { id } = await params;
  const post = await getAdminPost(Number(id));
  if (!post) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(post);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard(request);
  if (denied) return denied;
  const { id } = await params;
  const postId = Number(id);
  const body = (await request.json().catch(() => ({}))) as {
    title?: string;
    body?: string;
    excerpt?: string;
    seo_title?: string;
    meta_description?: string;
    status?: string;
    categoryIds?: number[];
  };

  try {
    await updatePost(postId, {
      title: body.title,
      body: body.body,
      excerpt: body.excerpt,
      seo_title: body.seo_title,
      meta_description: body.meta_description,
      status: body.status,
    });
    if (Array.isArray(body.categoryIds)) {
      await setPostCategories(postId, body.categoryIds.map((n) => Number(n)));
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}

/** Quick status change (publish / draft / archived). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard(request);
  if (denied) return denied;
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { status?: string };
  if (!body.status) return NextResponse.json({ error: "status_required" }, { status: 400 });
  try {
    await setPostStatus(Number(id), body.status);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
