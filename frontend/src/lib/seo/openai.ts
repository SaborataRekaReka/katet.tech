import "server-only";

import fs from "node:fs";
import path from "node:path";
import OpenAI from "openai";

/**
 * Thin OpenAI wrapper for the SEO pipeline.
 * - Cheap steps (cleaning, intent, cluster naming) use a small model.
 * - Heavy steps (briefs, articles) use a stronger model.
 * If no API key is configured the client stays disabled and callers fall back
 * to deterministic heuristics, so the pipeline still runs end-to-end.
 */

function stripOptionalQuotes(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function localEnvValue(name: string): string {
  if (process.env.NODE_ENV === "production") return "";
  const candidates = [path.join(process.cwd(), ".env.local"), path.join(process.cwd(), "frontend", ".env.local")];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      if (key === name) return stripOptionalQuotes(line.slice(eq + 1));
    }
  }
  return "";
}

function envValue(name: string): string {
  return (localEnvValue(name) || process.env[name] || "").trim();
}

const apiKey = envValue("OPENAI_API_KEY");

export const MODELS = {
  cheap: envValue("OPENAI_MODEL_CHEAP") || "gpt-5.5-pro",
  strong: envValue("OPENAI_MODEL_STRONG") || "gpt-5.5-pro",
  cluster: envValue("OPENAI_MODEL_CLUSTER") || envValue("OPENAI_MODEL_CHEAP") || "gpt-4.1",
  embedding: envValue("OPENAI_MODEL_EMBEDDING") || "text-embedding-3-small",
  image: envValue("OPENAI_MODEL_IMAGE") || "gpt-image-2",
} as const;

export const llmEnabled = apiKey.length > 0;

let lastEmbeddingError: string | null = null;

export function getLastEmbeddingError(): string | null {
  return lastEmbeddingError;
}

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
      ...(options.maxTokens ? { max_output_tokens: options.maxTokens } : {}),
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
      ...(options.maxTokens ? { max_output_tokens: options.maxTokens } : {}),
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
  lastEmbeddingError = null;
  try {
    const response = await getClient().embeddings.create({
      model: MODELS.embedding,
      input: texts,
    });
    return response.data.map((row) => row.embedding as number[]);
  } catch (error) {
    const err = error as Error & { status?: number; code?: string; type?: string };
    lastEmbeddingError = [
      err.status ? `status ${err.status}` : null,
      err.code ? `code ${err.code}` : null,
      err.type ? `type ${err.type}` : null,
      err.message,
    ].filter(Boolean).join("; ");
    console.error("[seo/openai] embed failed:", lastEmbeddingError);
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

export type GeneratedImage = {
  bytes: Buffer;
  mimeType: string;
};

/** Generate one image with the configured image model (gpt-image-2 by default). */
export async function generateImage(prompt: string, size: "1024x1024" | "1536x1024" = "1536x1024"): Promise<GeneratedImage | null> {
  if (!llmEnabled || !prompt.trim()) return null;
  try {
    const response = await getClient().images.generate({
      model: MODELS.image,
      prompt,
      size,
    });
    const first = response.data?.[0] as { b64_json?: string; url?: string } | undefined;
    if (!first) return null;

    if (first.b64_json) {
      return { bytes: Buffer.from(first.b64_json, "base64"), mimeType: "image/png" };
    }

    if (first.url) {
      const downloaded = await fetch(first.url);
      if (!downloaded.ok) return null;
      const arrayBuffer = await downloaded.arrayBuffer();
      const mimeType = downloaded.headers.get("content-type") || "image/png";
      return { bytes: Buffer.from(arrayBuffer), mimeType };
    }

    return null;
  } catch (error) {
    console.error("[seo/openai] generateImage failed:", (error as Error).message);
    return null;
  }
}
