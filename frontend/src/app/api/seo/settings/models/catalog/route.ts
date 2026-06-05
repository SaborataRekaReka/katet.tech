import { NextResponse } from "next/server";
import { guard } from "../../../_guard";
import { getAvailableOpenAiModels, getOpenAiKeySettings } from "@/lib/seo/openai";

export const runtime = "nodejs";

function formatCatalogError(error: unknown): { message: string; status: number } {
  const err = error as Error & { status?: number; code?: string; type?: string };
  const message = [
    err.status ? `status ${err.status}` : null,
    err.code ? `code ${err.code}` : null,
    err.type ? `type ${err.type}` : null,
    err.message || null,
  ]
    .filter(Boolean)
    .join("; ");

  const status = typeof err.status === "number" && err.status >= 400 && err.status <= 599 ? err.status : 502;
  return { message: message || "model_catalog_request_failed", status };
}

export async function GET(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;

  const key = await getOpenAiKeySettings(true);
  if (!key.hasKey) {
    return NextResponse.json(
      { ok: false, error: "openai_key_not_configured", key, options: null },
      { status: 400 },
    );
  }

  try {
    const options = await getAvailableOpenAiModels(true);
    return NextResponse.json({ ok: true, key, options });
  } catch (error) {
    const formatted = formatCatalogError(error);
    return NextResponse.json(
      { ok: false, error: formatted.message, key, options: null },
      { status: formatted.status },
    );
  }
}
