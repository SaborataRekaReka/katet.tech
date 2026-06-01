import "server-only";

import { run } from "./db";
import type { CompanyContext } from "./types";

/**
 * Seed generator (Task.md §8).
 * Builds Wordstat seed terms from the company context. Seeds are NOT final
 * keywords — they are starting points for demand collection.
 */

const COMMERCIAL_MODIFIERS = ["аренда", "услуги", "заказать", "цена"];

type SeedDraft = {
  seed_term: string;
  seed_type: string;
  region: string | null;
  source_context_id: number;
  priority: "high" | "medium" | "low";
};

export async function loadContext(): Promise<CompanyContext[]> {
  return run<CompanyContext>(
    `SELECT id, context_type, name, slug, description, attributes, is_active, is_allowed_for_seo
     FROM seo.company_context
     WHERE is_active = TRUE AND is_allowed_for_seo = TRUE
     ORDER BY id`,
  );
}

function isForbidden(name: string, forbidden: string[]): boolean {
  const lower = name.toLowerCase();
  return forbidden.some((term) => lower.includes(term));
}

/** Produce seed drafts from context. Combines services with tasks/regions. */
export function buildSeeds(context: CompanyContext[]): SeedDraft[] {
  const services = context.filter((c) => c.context_type === "service" || c.context_type === "service_category");
  const equipment = context.filter((c) => c.context_type === "equipment_type");
  const tasks = context.filter((c) => c.context_type === "task");
  const regions = context.filter((c) => c.context_type === "region");
  const faqs = context.filter((c) => c.context_type === "faq");
  const forbidden = context
    .filter((c) => c.context_type === "forbidden_topic")
    .map((c) => c.name.toLowerCase());

  const drafts: SeedDraft[] = [];
  const regionNames = regions.length > 0 ? regions.map((r) => r.name) : [null];

  const push = (draft: SeedDraft) => {
    if (isForbidden(draft.seed_term, forbidden)) return;
    drafts.push(draft);
  };

  // services and equipment as base seeds + commercial / region combos
  for (const item of [...services, ...equipment]) {
    push({ seed_term: item.name, seed_type: "base", region: null, source_context_id: item.id, priority: "high" });
    for (const mod of COMMERCIAL_MODIFIERS) {
      push({ seed_term: `${mod} ${item.name}`, seed_type: "commercial", region: null, source_context_id: item.id, priority: "high" });
    }
    for (const region of regionNames) {
      if (!region) continue;
      push({ seed_term: `${item.name} ${region}`, seed_type: "service+region", region, source_context_id: item.id, priority: "medium" });
    }
    // service + task
    for (const task of tasks) {
      push({ seed_term: `${item.name} ${task.name}`, seed_type: "service+task", region: null, source_context_id: item.id, priority: "medium" });
    }
  }

  // tasks alone + task + region
  for (const task of tasks) {
    push({ seed_term: task.name, seed_type: "task", region: null, source_context_id: task.id, priority: "medium" });
    for (const region of regionNames) {
      if (!region) continue;
      push({ seed_term: `${task.name} ${region}`, seed_type: "task+region", region, source_context_id: task.id, priority: "low" });
    }
  }

  // faq questions become informational seeds
  for (const faq of faqs) {
    push({ seed_term: faq.name, seed_type: "question", region: null, source_context_id: faq.id, priority: "low" });
  }

  return drafts;
}

/** Regenerate seeds: build drafts and upsert into seo.seed_terms. Returns count. */
export async function regenerateSeeds(): Promise<number> {
  const context = await loadContext();
  const drafts = buildSeeds(context);
  let inserted = 0;
  for (const draft of drafts) {
    const term = draft.seed_term.trim().replace(/\s+/g, " ").toLowerCase();
    if (term.length < 3) continue;
    await run(
      `INSERT INTO seo.seed_terms (source_context_id, seed_term, seed_type, region, priority, status, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'active', NOW())
       ON CONFLICT (seed_term, COALESCE(region, '')) DO UPDATE
         SET seed_type = EXCLUDED.seed_type,
             priority = EXCLUDED.priority,
             updated_at = NOW()`,
      [draft.source_context_id, term, draft.seed_type, draft.region, draft.priority],
    );
    inserted += 1;
  }
  return inserted;
}
