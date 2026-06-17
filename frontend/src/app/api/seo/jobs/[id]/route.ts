import { NextResponse } from "next/server";
import { guard } from "../../_guard";
import { getJob } from "@/lib/seo/queries";
import { run } from "@/lib/seo/db";

export const runtime = "nodejs";

const DEFAULT_STALL_SECONDS = 420;

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function latestLogAt(job: unknown): Date | null {
  if (!job || typeof job !== "object") return null;
  const log = (job as { log?: unknown }).log;
  if (!Array.isArray(log) || log.length === 0) return null;

  for (let i = log.length - 1; i >= 0; i -= 1) {
    const row = log[i];
    if (!row || typeof row !== "object") continue;
    const at = parseDate((row as { at?: unknown }).at);
    if (at) return at;
  }

  return null;
}

async function failStalledJob(jobId: number, reason: string) {
  const nowIso = new Date().toISOString();
  await run(
    `UPDATE seo.jobs
        SET status='error',
            error=$2::text,
            finished_at=NOW(),
            log=COALESCE(log, '[]'::jsonb) || jsonb_build_array(
              jsonb_build_object('at', $3::text, 'level', 'error', 'message', $2::text)
            )
      WHERE id=$1 AND status='running'`,
    [jobId, reason, nowIso],
  );
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard(request);
  if (denied) return denied;
  const { id } = await params;
  const jobId = Number(id);
  const job = await getJob(jobId);
  if (!job) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (job.status === "running") {
    const timeoutSecondsRaw = Number(process.env.SEO_JOB_STALL_SECONDS || DEFAULT_STALL_SECONDS);
    const timeoutSeconds = Number.isFinite(timeoutSecondsRaw) ? Math.max(60, timeoutSecondsRaw) : DEFAULT_STALL_SECONDS;
    const lastActivityAt = latestLogAt(job) ?? parseDate(job.started_at);

    if (lastActivityAt) {
      const idleSeconds = Math.floor((Date.now() - lastActivityAt.getTime()) / 1000);
      if (idleSeconds >= timeoutSeconds) {
        const step = typeof job.step === "string" && job.step.trim() ? job.step.trim() : "unknown";
        const reason = `Задача остановлена по таймауту: нет прогресса ${idleSeconds}с на шаге ${step}`;
        await failStalledJob(jobId, reason);
        const refreshed = await getJob(jobId);
        if (refreshed) return NextResponse.json(refreshed);
      }
    }
  }

  return NextResponse.json(job);
}
