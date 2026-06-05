import { NextResponse } from "next/server";
import { guard } from "../../_guard";
import { clearOpenAiKey, getOpenAiKeySettings, setOpenAiKey } from "@/lib/seo/openai";

export const runtime = "nodejs";

type Body = {
  apiKey?: string;
};

export async function GET(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;

  const settings = await getOpenAiKeySettings(true);
  return NextResponse.json(settings);
}

export async function POST(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;

  const body = (await request.json().catch(() => ({}))) as Body;
  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  if (!apiKey) return NextResponse.json({ error: "api_key_required" }, { status: 400 });

  const settings = await setOpenAiKey(apiKey);
  return NextResponse.json({ ok: true, ...settings });
}

export async function DELETE(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;

  const settings = await clearOpenAiKey();
  return NextResponse.json({ ok: true, ...settings });
}
