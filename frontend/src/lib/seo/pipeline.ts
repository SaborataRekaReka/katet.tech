import "server-only";

import { one, run } from "./db";
import { regenerateSeeds } from "./seed";
import { collectAll } from "./collect";
import { cleanAndNormalize } from "./clean";
import { clusterize } from "./cluster";
import { generatePlan } from "./plan";
import { generateBrief } from "./brief";
import { generateArticle } from "./article";
import { resetSiteCache } from "./siteGap";
import { getScoringConfig } from "./settings";

/**
 * Pipeline orchestrator. Runs the full chain behind the "Начать генерацию"
 * button and tracks progress in seo.jobs so the admin UI can poll it.
 *
 * NOTE (deviation from Task.md §17.1): the full run can auto-draft the top-N
 * highest-priority candidates (brief + article) so the operator immediately sees
 * proposed articles. Drafts are NEVER auto-published — publishing stays manual.
 */

const STEPS = ["seeds", "collect", "clean", "cluster", "plan", "draft", "done"] as const;

export async function createJob(kind: string): Promise<number> {
  const row = await one<{ id: number }>(
    `INSERT INTO seo.jobs (kind, status, total) VALUES ($1, 'running', $2) RETURNING id`,
    [kind, STEPS.length],
  );
  return row!.id;
}

async function setStep(jobId: number, step: string, progress: number, message: string): Promise<void> {
  await run(
    `UPDATE seo.jobs
       SET step = $2, progress = $3,
           log = log || $4::jsonb
     WHERE id = $1`,
    [jobId, step, progress, JSON.stringify([{ at: new Date().toISOString(), step, message }])],
  );
}

async function finishJob(jobId: number, error?: string): Promise<void> {
  await run(
    `UPDATE seo.jobs SET status = $2, error = $3, finished_at = NOW(), progress = total WHERE id = $1`,
    [jobId, error ? "error" : "done", error ?? null],
  );
}

export type FullRunOptions = { autoDraftTop?: number };

/** Run the entire pipeline. Designed to be awaited inside an API route. */
export async function runFullPipeline(jobId: number, options: FullRunOptions = {}): Promise<void> {
  const autoDraftTop = options.autoDraftTop ?? 0;
  try {
    resetSiteCache();
    const config = await getScoringConfig();

    await setStep(jobId, "seeds", 1, "Генерация seed-термов из контекста компании");
    const seeds = await regenerateSeeds();
    await setStep(jobId, "seeds", 1, `Создано/обновлено seed-термов: ${seeds}`);

    await setStep(jobId, "collect", 2, "Сбор спроса из Wordstat");
    const raw = await collectAll();
    await setStep(jobId, "collect", 2, `Собрано сырых запросов: ${raw}`);

    await setStep(jobId, "clean", 3, "Очистка, нормализация и классификация интентов");
    const cleaned = await cleanAndNormalize(config.thresholds.min_frequency);
    await setStep(jobId, "clean", 3, `Обработано запросов: ${cleaned}`);

    await setStep(jobId, "cluster", 4, "Кластеризация запросов");
    const clusters = await clusterize();
    await setStep(jobId, "cluster", 4, `Создано кластеров: ${clusters}`);

    await setStep(jobId, "plan", 5, "Анализ сайта, скоринг и формирование контент-плана");
    const planned = await generatePlan();
    await setStep(jobId, "plan", 5, `Сформировано элементов плана: ${planned}`);

    if (autoDraftTop > 0) {
      await setStep(jobId, "draft", 6, `Авто-черновики для топ-${autoDraftTop} кластеров`);
      const top = await run<{ id: number }>(
        `SELECT id FROM seo.content_plan_items
         WHERE status IN ('pending_review', 'ready_for_brief')
         ORDER BY priority DESC LIMIT $1`,
        [autoDraftTop],
      );
      let drafted = 0;
      for (const item of top) {
        try {
          await generateBrief(item.id, "auto");
          await generateArticle(item.id);
          drafted += 1;
        } catch (error) {
          await setStep(jobId, "draft", 6, `Ошибка черновика #${item.id}: ${(error as Error).message}`);
        }
      }
      await setStep(jobId, "draft", 6, `Создано черновиков статей: ${drafted}`);
    }

    await setStep(jobId, "done", STEPS.length, "Готово");
    await finishJob(jobId);
  } catch (error) {
    await setStep(jobId, "error", 0, (error as Error).message);
    await finishJob(jobId, (error as Error).message);
  }
}
