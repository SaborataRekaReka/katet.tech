import "server-only";

import OpenAI from "openai";

/**
 * Thin OpenAI wrapper for the SEO pipeline.
 * - Cheap steps (cleaning, intent, cluster naming) use a small model.
 * - Heavy steps (briefs, articles) use a stronger model.
 * If no API key is configured the client stays disabled and callers fall back
 * to deterministic heuristics, so the pipeline still runs end-to-end.
 */

const apiKey = process.env.OPENAI_API_KEY?.trim() || "";

export const MODELS = {
  cheap: process.env.OPENAI_MODEL_CHEAP?.trim() || "gpt-5.5-pro",
  strong: process.env.OPENAI_MODEL_STRONG?.trim() || "gpt-5.5-pro",
  embedding: process.env.OPENAI_MODEL_EMBEDDING?.trim() || "text-embedding-3-small",
} as const;

export const llmEnabled = apiKey.length > 0;

let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!client) client = new OpenAI({ apiKey });
  return client;
}

// gpt-5 / o-series reasoning models reject a custom `temperature`, need the
// Responses API (not chat/completions), and consume the output-token budget on
// hidden reasoning. Detect them to build correct params.
function isReasoningModel(model: string): boolean {
  return /^(gpt-5|o\d)/i.test(model);
}

/** Strip accidental ```json fences before JSON.parse. */
function stripFences(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
}

type ChatJsonOptions = {
  model?: string;
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
};

/**
 * Calls the chat API expecting a strict JSON object response.
 * Returns null when the LLM is disabled or the call fails (callers must fall back).
 */
export async function chatJson<T>(options: ChatJsonOptions): Promise<T | null> {
  if (!llmEnabled) return null;
  const model = options.model ?? MODELS.cheap;
  const reasoning = isReasoningModel(model);
  try {
    const response = await getClient().responses.create({
      model,
      instructions: `${options.system}\n\nReturn only a single valid JSON object. No markdown, no commentary.`,
      input: options.user,
      ...(reasoning ? {} : { temperature: options.temperature ?? 0.2 }),
      ...(options.maxTokens && !reasoning ? { max_output_tokens: options.maxTokens } : {}),
    });
    const content = response.output_text?.trim();
    if (!content) return null;
    return JSON.parse(stripFences(content)) as T;
  } catch (error) {
    console.error("[seo/openai] chatJson failed:", (error as Error).message);
    return null;
  }
}

/** Free-text completion (used for HTML article body). */
export async function chatText(options: ChatJsonOptions): Promise<string | null> {
  if (!llmEnabled) return null;
  const model = options.model ?? MODELS.strong;
  const reasoning = isReasoningModel(model);
  try {
    const response = await getClient().responses.create({
      model,
      instructions: options.system,
      input: options.user,
      ...(reasoning ? {} : { temperature: options.temperature ?? 0.5 }),
      ...(options.maxTokens && !reasoning ? { max_output_tokens: options.maxTokens } : {}),
    });
    return response.output_text?.trim() || null;
  } catch (error) {
    console.error("[seo/openai] chatText failed:", (error as Error).message);
    return null;
  }
}

/** Batch embeddings. Returns null on failure so callers can fall back to lexical clustering. */
export async function embed(texts: string[]): Promise<number[][] | null> {
  if (!llmEnabled || texts.length === 0) return null;
  try {
    const response = await getClient().embeddings.create({
      model: MODELS.embedding,
      input: texts,
    });
    return response.data.map((row) => row.embedding as number[]);
  } catch (error) {
    console.error("[seo/openai] embed failed:", (error as Error).message);
    return null;
  }
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
