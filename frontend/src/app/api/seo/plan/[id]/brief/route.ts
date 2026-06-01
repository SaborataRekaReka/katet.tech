import { NextResponse } from "next/server";
import { guard } from "../../../_guard";
import { generateBrief } from "@/lib/seo/brief";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard(request);
  if (denied) return denied;
  const { id } = await params;
  try {
    const briefId = await generateBrief(Number(id), "admin");
    return NextResponse.json({ briefId });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
