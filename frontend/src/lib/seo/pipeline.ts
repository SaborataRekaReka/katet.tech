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
import { getScoringConfig, getSemanticsCleaningConfig } from "./settings";

/**
 * Pipeline orchestrator. Runs the full chain behind the "Начать генерацию"
 * button and tracks progress in seo.jobs so the admin UI can poll it.
 *
 * NOTE (deviation from Task.md §17.1): the full run can auto-draft the top-N
 * highest-priority candidates (brief + article) so the operator immediately sees
 * proposed articles. Drafts are NEVER auto-published — publishing stays manual.
 */

const STEPS = ["seeds", "collect", "clean", "cluster", "plan", "draft", "done"] as const;
const CSV_STEPS = ["clean", "cluster", "plan", "done"] as const;

function clusterMethodLabel(method: string): string {
  if (method === "ai_embeddings") return "ИИ-кластеризация по смыслу";
  if (method === "ai_llm") return "ИИ-кластеризация моделью";
  if (method === "rules") return "кластеризация по правилам";
  return "новых запросов нет";
}

export async function createJob(kind: string, total: number = STEPS.length): Promise<number> {
  const row = await one<{ id: number }>(
    `INSERT INTO seo.jobs (kind, status, total) VALUES ($1, 'running', $2) RETURNING id`,
    [kind, total],
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

async function draftTopArticles(
  limit: number,
  onProgress?: (drafted: number, total: number, planItemId: number, error?: string) => Promise<void>,
  clusterIds?: number[],
): Promise<number> {
  if (limit <= 0) return 0;

  const selected = (clusterIds ?? []).filter((n) => Number.isFinite(n));
  const clusterFilter = selected.length > 0 ? `AND p.cluster_id = ANY($2::int[])` : "";
  const params: unknown[] = selected.length > 0 ? [limit, selected] : [limit];

  const top = await run<{ id: number }>(
    `SELECT p.id
     FROM seo.content_plan_items p
     JOIN seo.keyword_clusters c ON c.id = p.cluster_id
     WHERE p.status NOT IN ('rejected', 'published', 'content_generated')
       AND COALESCE(p.recommended_action, '') <> 'no_action'
       AND NOT EXISTS (
         SELECT 1 FROM seo.generated_articles a WHERE a.content_plan_item_id = p.id
       )
       ${clusterFilter}
     ORDER BY p.priority DESC, c.total_frequency DESC, p.id DESC
     LIMIT $1`,
    params,
  );

  let drafted = 0;
  for (const item of top) {
    try {
      const existingBrief = await one<{ id: number }>(
        `SELECT id FROM seo.content_briefs WHERE content_plan_item_id = $1 LIMIT 1`,
        [item.id],
      );
      if (!existingBrief) await generateBrief(item.id, "auto");
      await generateArticle(item.id);
      drafted += 1;
      await onProgress?.(drafted, top.length, item.id);
    } catch (error) {
      await onProgress?.(drafted, top.length, item.id, (error as Error).message);
    }
  }
  return drafted;
}

/** Run the entire pipeline. Designed to be awaited inside an API route. */
export async function runFullPipeline(jobId: number, options: FullRunOptions = {}): Promise<void> {
  const autoDraftTop = options.autoDraftTop ?? 0;
  try {
    resetSiteCache();
    const config = await getScoringConfig();
    const cleaning = await getSemanticsCleaningConfig();

    await setStep(jobId, "seeds", 1, "Генерация seed-термов из контекста компании");
    const seeds = await regenerateSeeds();
    await setStep(jobId, "seeds", 1, `Создано/обновлено seed-термов: ${seeds}`);

    await setStep(jobId, "collect", 2, "Сбор спроса из Wordstat");
    const raw = await collectAll();
    await setStep(jobId, "collect", 2, `Собрано сырых запросов: ${raw}`);

    await setStep(jobId, "clean", 3, "Очистка, нормализация и классификация интентов");
    const cleaned = await cleanAndNormalize(cleaning.min_frequency, { cleaning });
    await setStep(jobId, "clean", 3, `Обработано запросов: ${cleaned}`);

    await setStep(jobId, "cluster", 4, "Кластеризация запросов");
    const clusters = await clusterize();
    await setStep(jobId, "cluster", 4, `Создано кластеров: ${clusters.created} (${clusterMethodLabel(clusters.method)})`);

    await setStep(jobId, "plan", 5, "Анализ сайта, скоринг и формирование контент-плана");
    const planned = await generatePlan();
    await setStep(jobId, "plan", 5, `Сформировано элементов плана: ${planned}`);

    if (autoDraftTop > 0) {
      await setStep(jobId, "draft", 6, `Авто-черновики для топ-${autoDraftTop} кластеров`);
      const drafted = await draftTopArticles(autoDraftTop, async (_drafted, _total, planItemId, error) => {
        if (error) await setStep(jobId, "draft", 6, `Ошибка черновика #${planItemId}: ${error}`);
      });
      await setStep(
        jobId,
        "draft",
        6,
        drafted > 0
          ? `Создано черновиков статей: ${drafted}`
          : "Новых черновиков нет: нет незакрытых тем без статьи",
      );
    }

    await setStep(jobId, "done", STEPS.length, "Готово");
    await finishJob(jobId);
  } catch (error) {
    await setStep(jobId, "error", 0, (error as Error).message);
    await finishJob(jobId, (error as Error).message);
  }
}

/** Process already imported CSV/raw semantics without calling external Wordstat APIs. */
export async function runImportedSemanticsPipeline(
  jobId: number,
  options: { rebuildClusters?: boolean } = {},
): Promise<void> {
  try {
    resetSiteCache();
    const cleaning = await getSemanticsCleaningConfig();

    await setStep(jobId, "clean", 1, "Очистка, нормализация и классификация импортированных запросов");
    const cleaned = await cleanAndNormalize(cleaning.min_frequency, {
      reprocess: options.rebuildClusters,
      cleaning,
    });
    await setStep(jobId, "clean", 1, `Обработано запросов: ${cleaned}`);

    await setStep(
      jobId,
      "cluster",
      2,
      options.rebuildClusters
        ? "ИИ-пересборка кластеров по смыслу запросов"
        : "Кластеризация импортированной семантики",
    );
    const clusters = await clusterize({
      rebuild: options.rebuildClusters,
      requireAi: options.rebuildClusters,
    });
    await setStep(jobId, "cluster", 2, `Создано кластеров: ${clusters.created} (${clusterMethodLabel(clusters.method)})`);

    await setStep(jobId, "plan", 3, "Скоринг и формирование контент-плана по кластерам");
    const planned = await generatePlan();
    await setStep(jobId, "plan", 3, `Сформировано элементов плана: ${planned}`);

    await setStep(jobId, "done", CSV_STEPS.length, "Готово");
    await finishJob(jobId);
  } catch (error) {
    await setStep(jobId, "error", 0, (error as Error).message);
    await finishJob(jobId, (error as Error).message);
  }
}

/** Run only semantics cleaning/classification with user-defined cleaning rules. */
export async function runSemanticsClean(jobId: number, options: { reprocess?: boolean } = {}): Promise<void> {
  try {
    const cleaning = await getSemanticsCleaningConfig();
    await setStep(jobId, "clean", 1, "Очистка и классификация семантики по заданным правилам");
    const cleaned = await cleanAndNormalize(cleaning.min_frequency, {
      reprocess: options.reprocess ?? true,
      cleaning,
    });
    await setStep(jobId, "done", 2, `Готово. Обработано запросов: ${cleaned}`);
    await finishJob(jobId);
  } catch (error) {
    await setStep(jobId, "error", 0, (error as Error).message);
    await finishJob(jobId, (error as Error).message);
  }
}

/** Generate article drafts for the best uncovered content-plan items (optionally limited to selected clusters). */
export async function runArticleBatch(jobId: number, limit: number, clusterIds?: number[]): Promise<void> {
  const safeLimit = Math.max(1, Math.min(20, Math.trunc(limit)));
  try {
    await setStep(jobId, "draft", 1, `Выбор тем для генерации (до ${safeLimit})`);
    const drafted = await draftTopArticles(
      safeLimit,
      async (done, total, planItemId, error) => {
      const message = error
        ? `Ошибка статьи #${planItemId}: ${error}`
        : `Создан черновик по плану #${planItemId}: ${done}/${total}`;
        await setStep(jobId, "draft", Math.max(1, done), message);
      },
      clusterIds,
    );
    await setStep(
      jobId,
      "done",
      safeLimit + 1,
      drafted > 0
        ? `Создано черновиков статей: ${drafted}`
        : "Новых черновиков нет: нет незакрытых тем без статьи",
    );
    await finishJob(jobId);
  } catch (error) {
    await setStep(jobId, "error", 0, (error as Error).message);
    await finishJob(jobId, (error as Error).message);
  }
}
