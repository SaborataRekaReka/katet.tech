import { NextResponse } from "next/server";
import { authCookieName, getAdminToken } from "@/lib/seo/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { token?: string };
  const token = getAdminToken();
  if (!token) {
    return NextResponse.json({ ok: process.env.NODE_ENV !== "production" });
  }
  if (body.token !== token) {
    return NextResponse.json({ error: "invalid_token" }, { status: 401 });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(authCookieName(), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
