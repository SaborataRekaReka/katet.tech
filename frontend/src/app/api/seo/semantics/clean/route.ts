import { NextResponse } from "next/server";
import { guard } from "../../_guard";
import { createJob, runSemanticsClean } from "@/lib/seo/pipeline";
import { getSemanticsCleaningConfig, setSemanticsCleaningConfig } from "@/lib/seo/settings";

export const runtime = "nodejs";
export const maxDuration = 300;

type Body = {
  settings?: {
    min_frequency?: number;
    require_business_fit?: boolean;
    junk_words?: string[];
  };
  run?: boolean;
};

export async function GET(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;
  const settings = await getSemanticsCleaningConfig();
  return NextResponse.json({ settings });
}

export async function POST(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;

  const body = (await request.json().catch(() => ({}))) as Body;
  const settings = body.settings
    ? await setSemanticsCleaningConfig(body.settings)
    : await getSemanticsCleaningConfig();

  if (body.run === false) return NextResponse.json({ ok: true, settings, savedOnly: true });

  const jobId = await createJob("semantics_clean", 2);
  void runSemanticsClean(jobId, { reprocess: true });
  return NextResponse.json({ ok: true, settings, jobId });
}
