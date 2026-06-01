import "server-only";

import { NextResponse } from "next/server";
import { assertApiAdmin } from "@/lib/seo/auth";

/** Guard helper for SEO API routes. Returns null when authorized, or a 401 response. */
export async function guard(request: Request): Promise<NextResponse | null> {
  const ok = await assertApiAdmin(request.headers.get("x-seo-token"));
  if (!ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return null;
}
