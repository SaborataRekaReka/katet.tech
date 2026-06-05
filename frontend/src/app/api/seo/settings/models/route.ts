import { NextResponse } from "next/server";
import { guard } from "../../_guard";
import { getLlmModelsConfig, setLlmModelsConfig } from "@/lib/seo/openai";

export const runtime = "nodejs";

type ModelsInput = {
  cheap?: string;
  strong?: string;
  cluster?: string;
  embedding?: string;
  image?: string;
};

function sanitize(input: ModelsInput): ModelsInput {
  const out: ModelsInput = {};
  const keys: Array<keyof ModelsInput> = ["cheap", "strong", "cluster", "embedding", "image"];
  for (const key of keys) {
    const raw = input[key];
    if (typeof raw !== "string") continue;
    const value = raw.trim();
    if (!value) continue;
    out[key] = value.slice(0, 120);
  }
  return out;
}

export async function GET(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;
  const models = await getLlmModelsConfig(true);
  return NextResponse.json({ models });
}

export async function POST(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;

  const body = (await request.json().catch(() => ({}))) as { models?: ModelsInput };
  const payload = sanitize(body.models || {});
  const models = await setLlmModelsConfig(payload);
  return NextResponse.json({ ok: true, models });
}
