import { NextResponse } from "next/server";
import { guard } from "../_guard";
import { run } from "@/lib/seo/db";
import { getContextItems } from "@/lib/seo/queries";
import { DEFAULT_CONTEXT_PRESET } from "@/lib/seo/preset";

export const runtime = "nodejs";

type ContextInput = {
  context_type: string;
  name: string;
  description?: string | null;
  slug?: string | null;
  is_active?: boolean;
  is_allowed_for_seo?: boolean;
};

export async function GET(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;
  return NextResponse.json(await getContextItems());
}

export async function POST(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;
  const body = (await request.json().catch(() => ({}))) as {
    item?: ContextInput;
    items?: ContextInput[];
    preset?: string;
  };

  const items: ContextInput[] = body.preset === "katet" ? DEFAULT_CONTEXT_PRESET : body.items ?? (body.item ? [body.item] : []);
  if (items.length === 0) return NextResponse.json({ error: "no_items" }, { status: 400 });

  let inserted = 0;
  for (const item of items) {
    if (!item.context_type || !item.name) continue;
    await run(
      `INSERT INTO seo.company_context (context_type, name, slug, description, is_active, is_allowed_for_seo)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        item.context_type,
        item.name,
        item.slug ?? null,
        item.description ?? null,
        item.is_active ?? true,
        item.is_allowed_for_seo ?? true,
      ],
    );
    inserted += 1;
  }
  return NextResponse.json({ inserted });
}

export async function DELETE(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id_required" }, { status: 400 });
  await run(`DELETE FROM seo.company_context WHERE id = $1`, [Number(id)]);
  return NextResponse.json({ ok: true });
}
