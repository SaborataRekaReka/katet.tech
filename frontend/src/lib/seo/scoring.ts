import "server-only";

import type { GapResult } from "./siteGap";
import type { ClusterScores, Intent, ScoringConfig } from "./types";

/**
 * Scoring model (Task.md §14). Each sub-score is 0-100; the final priority is a
 * weighted blend minus risk. Inputs are deterministic signals from the cluster,
 * the company context and the site-gap analysis.
 */

export type ScoringInput = {
  totalFrequency: number;
  keywordCount: number;
  questionCount: number;
  intent: Intent | null;
  region: string | null;
  // context readiness signals
  serviceInContext: boolean;
  serviceHasDescription: boolean;
  regionServed: boolean;
  hasFaqData: boolean;
  hasCaseData: boolean;
  hasAdvantageData: boolean;
  // gap signals
  gap: GapResult;
};

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function businessFit(input: ScoringInput): { score: number; signals: string[] } {
  const signals: string[] = [];
  let score = 30;
  if (input.serviceInContext) {
    score += 30;
    signals.push("service_in_context");
  }
  if (input.regionServed) {
    score += 10;
    signals.push("region_served");
  }
  if (input.intent?.startsWith("commercial")) {
    score += 20;
    signals.push("commercial_intent");
  }
  if (input.totalFrequency > 100) {
    score += 10;
    signals.push("real_demand");
  }
  if (!input.serviceInContext) signals.push("no_service_match");
  return { score: clamp(score), signals };
}

function seoOpportunity(input: ScoringInput): { score: number; signals: string[] } {
  const signals: string[] = [];
  // logarithmic frequency contribution (0..60)
  const freqScore = Math.min(60, Math.round(Math.log10(Math.max(1, input.totalFrequency)) * 20));
  // keyword breadth contribution (0..30)
  const breadthScore = Math.min(30, input.keywordCount * 3);
  const score = freqScore + breadthScore + 10;
  signals.push(`frequency_${input.totalFrequency}`, `keywords_${input.keywordCount}`);
  return { score: clamp(score), signals };
}

function contentReadiness(input: ScoringInput): { score: number; signals: string[] } {
  const signals: string[] = [];
  let score = 20;
  if (input.serviceInContext) {
    score += 25;
    signals.push("service_known");
  }
  if (input.serviceHasDescription) {
    score += 20;
    signals.push("service_described");
  }
  if (input.hasFaqData) {
    score += 15;
    signals.push("faq_available");
  }
  if (input.hasCaseData) {
    score += 10;
    signals.push("cases_available");
  }
  if (input.hasAdvantageData) {
    score += 10;
    signals.push("advantages_available");
  }
  return { score: clamp(score), signals };
}

function risk(input: ScoringInput): { score: number; signals: string[] } {
  const signals: string[] = [];
  let score = 10;
  if (input.gap.cannibalization_risk) {
    score += 35;
    signals.push("cannibalization");
  }
  if (input.gap.similar_urls.length > 0 && input.gap.recommended_action === "create_new_page") {
    score += 15;
    signals.push("possible_duplicate");
  }
  if (input.keywordCount <= 1 || input.totalFrequency < 30) {
    score += 20;
    signals.push("thin_page_risk");
  }
  if (input.intent === "unknown") {
    score += 20;
    signals.push("unclear_intent");
  }
  if (!input.serviceInContext) {
    score += 15;
    signals.push("no_data_to_back");
  }
  return { score: clamp(score), signals };
}

export function score(input: ScoringInput, config: ScoringConfig): {
  scores: ClusterScores;
  signals: Record<string, string[]>;
} {
  const bf = businessFit(input);
  const seo = seoOpportunity(input);
  const cr = contentReadiness(input);
  const rk = risk(input);
  const w = config.weights;
  const priority = clamp(
    bf.score * w.business_fit + seo.score * w.seo_opportunity + cr.score * w.content_readiness - rk.score * w.risk,
  );
  return {
    scores: {
      business_fit: bf.score,
      seo_opportunity: seo.score,
      content_readiness: cr.score,
      risk: rk.score,
      priority,
    },
    signals: {
      business_fit: bf.signals,
      seo_opportunity: seo.signals,
      content_readiness: cr.signals,
      risk: rk.signals,
    },
  };
}

/** Decide whether a cluster qualifies for the plan (Task.md §15.3 / §15.4). */
export function qualifies(scores: ClusterScores, config: ScoringConfig): boolean {
  const t = config.thresholds;
  return (
    scores.business_fit >= t.include_business_fit &&
    scores.seo_opportunity >= t.include_seo &&
    scores.content_readiness >= t.include_readiness &&
    scores.risk <= t.max_risk
  );
}
