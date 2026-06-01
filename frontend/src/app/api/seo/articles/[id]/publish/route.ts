import { NextResponse } from "next/server";
import { guard } from "../../../_guard";
import { publishArticle } from "@/lib/seo/publish";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard(request);
  if (denied) return denied;
  const { id } = await params;
  try {
    const postId = await publishArticle(Number(id));
    return NextResponse.json({ postId });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
