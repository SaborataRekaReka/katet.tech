import "server-only";

import fs from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import { one, run } from "./db";

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
  const candidates = [path.join(process.cwd(), "frontend", ".env.local"), path.join(process.cwd(), ".env.local")];
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

const ENV_OPENAI_API_KEY = envValue("OPENAI_API_KEY");

export type LlmModels = {
  cheap: string;
  strong: string;
  cluster: string;
  embedding: string;
  image: string;
};

export type LlmModelCatalog = {
  text: string[];
  embedding: string[];
  image: string[];
};

const ENV_MODELS: LlmModels = {
  cheap: envValue("OPENAI_MODEL_CHEAP") || "gpt-5.5-pro",
  strong: envValue("OPENAI_MODEL_STRONG") || "gpt-5.5-pro",
  cluster: envValue("OPENAI_MODEL_CLUSTER") || envValue("OPENAI_MODEL_CHEAP") || "gpt-4.1",
  embedding: envValue("OPENAI_MODEL_EMBEDDING") || "text-embedding-3-small",
  image: envValue("OPENAI_MODEL_IMAGE") || "gpt-image-2",
};

const DEFAULT_MODEL_CATALOG: LlmModelCatalog = {
  text: ["gpt-5.5-pro", "gpt-5.1", "gpt-5-mini", "gpt-4.1", "gpt-4.1-mini"],
  embedding: ["text-embedding-3-small", "text-embedding-3-large"],
  image: ["gpt-image-2"],
};

export const MODELS: LlmModels = { ...ENV_MODELS };

const MODELS_CACHE_MS = 10_000;
let modelsCache: { expiresAt: number; value: LlmModels } | null = null;

const MODEL_CATALOG_CACHE_MS = 30_000;
let modelCatalogCache: { expiresAt: number; value: LlmModelCatalog } | null = null;

type OpenAiKeySource = "db" | "env" | "none";

const API_KEY_CACHE_MS = 10_000;
let apiKeyCache: { expiresAt: number; value: string; source: OpenAiKeySource } | null = null;

function normalizeOpenAiApiKey(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object") {
    const maybe = (value as Record<string, unknown>).api_key;
    if (typeof maybe === "string") return maybe.trim();
  }
  return "";
}

function maskSecret(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.length <= 10) return `${trimmed.slice(0, 2)}***`;
  return `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}`;
}

async function readOpenAiApiKeyFromDb(): Promise<string> {
  const row = await one<{ value: unknown }>(`SELECT value FROM seo.settings WHERE key = 'openai_key' LIMIT 1`);
  return normalizeOpenAiApiKey(row?.value);
}

async function resolveOpenAiApiKey(forceRefresh = false): Promise<{ value: string; source: OpenAiKeySource }> {
  if (!forceRefresh && apiKeyCache && Date.now() < apiKeyCache.expiresAt) {
    return { value: apiKeyCache.value, source: apiKeyCache.source };
  }

  const dbKey = await readOpenAiApiKeyFromDb().catch(() => "");
  if (dbKey) {
    apiKeyCache = { value: dbKey, source: "db", expiresAt: Date.now() + API_KEY_CACHE_MS };
    return { value: dbKey, source: "db" };
  }

  if (ENV_OPENAI_API_KEY) {
    apiKeyCache = { value: ENV_OPENAI_API_KEY, source: "env", expiresAt: Date.now() + API_KEY_CACHE_MS };
    return { value: ENV_OPENAI_API_KEY, source: "env" };
  }

  apiKeyCache = { value: "", source: "none", expiresAt: Date.now() + API_KEY_CACHE_MS };
  return { value: "", source: "none" };
}

async function currentOpenAiApiKey(forceRefresh = false): Promise<string> {
  const resolved = await resolveOpenAiApiKey(forceRefresh);
  return resolved.value;
}

export type OpenAiKeySettings = {
  hasKey: boolean;
  masked: string | null;
  source: OpenAiKeySource;
};

export async function getOpenAiKeySettings(forceRefresh = false): Promise<OpenAiKeySettings> {
  const resolved = await resolveOpenAiApiKey(forceRefresh);
  if (!resolved.value) return { hasKey: false, masked: null, source: "none" };
  return {
    hasKey: true,
    masked: maskSecret(resolved.value),
    source: resolved.source,
  };
}

export async function setOpenAiKey(apiKeyRaw: string): Promise<OpenAiKeySettings> {
  const apiKey = normalizeOpenAiApiKey(apiKeyRaw);
  if (!apiKey) throw new Error("openai_key_required");

  await run(
    `INSERT INTO seo.settings (key, value, updated_at)
     VALUES ('openai_key', $1::jsonb, NOW())
     ON CONFLICT (key)
     DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [JSON.stringify({ api_key: apiKey })],
  );

  apiKeyCache = { value: apiKey, source: "db", expiresAt: Date.now() + API_KEY_CACHE_MS };
  modelCatalogCache = null;
  client = null;
  clientKey = "";
  return getOpenAiKeySettings(true);
}

export async function clearOpenAiKey(): Promise<OpenAiKeySettings> {
  await run(`DELETE FROM seo.settings WHERE key = 'openai_key'`);
  apiKeyCache = null;
  modelCatalogCache = null;
  client = null;
  clientKey = "";
  return getOpenAiKeySettings(true);
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.map((item) => item.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function normalizeModelCatalogFromIds(ids: string[]): LlmModelCatalog {
  const normalized = uniqueSorted(ids);

  const embedding = normalized.filter((id) => /embedding/i.test(id));
  const image = normalized.filter((id) => /(image|dall-e)/i.test(id));
  const text = normalized.filter(
    (id) => /^(gpt|o\d)/i.test(id) && !/(embedding|image|dall-e|whisper|tts|transcrib|moderation|audio|realtime)/i.test(id),
  );

  return {
    text: text.length > 0 ? text : [...DEFAULT_MODEL_CATALOG.text],
    embedding: embedding.length > 0 ? embedding : [...DEFAULT_MODEL_CATALOG.embedding],
    image: image.length > 0 ? image : [...DEFAULT_MODEL_CATALOG.image],
  };
}

async function fetchOpenAiModelIds(client: OpenAI): Promise<string[]> {
  const ids: string[] = [];
  let page: unknown = await client.models.list();

  for (let guard = 0; guard < 20; guard += 1) {
    const rows = Array.isArray((page as { data?: unknown[] })?.data)
      ? ((page as { data?: unknown[] }).data as Array<{ id?: unknown }>)
      : [];

    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const id = typeof row.id === "string" ? row.id.trim() : "";
      if (id) ids.push(id);
    }

    const hasNextPage = typeof (page as { hasNextPage?: unknown }).hasNextPage === "function"
      ? Boolean((page as { hasNextPage: () => boolean }).hasNextPage())
      : false;
    if (!hasNextPage) break;

    const getNextPage = (page as { getNextPage?: unknown }).getNextPage;
    if (typeof getNextPage !== "function") break;
    page = await (getNextPage as () => Promise<unknown>)();
  }

  return uniqueSorted(ids);
}

export async function getAvailableOpenAiModels(forceRefresh = false): Promise<LlmModelCatalog> {
  if (!forceRefresh && modelCatalogCache && Date.now() < modelCatalogCache.expiresAt) {
    return modelCatalogCache.value;
  }

  const client = await getClient();
  if (!client) throw new Error("OPENAI_API_KEY is not configured (settings/env)");

  const ids = await fetchOpenAiModelIds(client);
  const catalog = normalizeModelCatalogFromIds(ids);
  modelCatalogCache = { value: catalog, expiresAt: Date.now() + MODEL_CATALOG_CACHE_MS };
  return catalog;
}

function cleanModelName(value: unknown, fallback: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  return text || fallback;
}

function normalizeLlmModels(value: unknown): LlmModels {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    cheap: cleanModelName(raw.cheap, ENV_MODELS.cheap),
    strong: cleanModelName(raw.strong, ENV_MODELS.strong),
    cluster: cleanModelName(raw.cluster, ENV_MODELS.cluster),
    embedding: cleanModelName(raw.embedding, ENV_MODELS.embedding),
    image: cleanModelName(raw.image, ENV_MODELS.image),
  };
}

export async function getLlmModelsConfig(forceRefresh = false): Promise<LlmModels> {
  if (!forceRefresh && modelsCache && Date.now() < modelsCache.expiresAt) {
    return modelsCache.value;
  }

  try {
    const row = await one<{ value: unknown }>(`SELECT value FROM seo.settings WHERE key = 'llm_models' LIMIT 1`);
    const models = normalizeLlmModels(row?.value);
    modelsCache = { value: models, expiresAt: Date.now() + MODELS_CACHE_MS };
    return models;
  } catch {
    const fallback = { ...ENV_MODELS };
    modelsCache = { value: fallback, expiresAt: Date.now() + MODELS_CACHE_MS };
    return fallback;
  }
}

export async function setLlmModelsConfig(value: Partial<LlmModels>): Promise<LlmModels> {
  const current = await getLlmModelsConfig(true);
  const next = normalizeLlmModels({ ...current, ...value });
  await run(
    `INSERT INTO seo.settings (key, value, updated_at)
     VALUES ('llm_models', $1::jsonb, NOW())
     ON CONFLICT (key)
     DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [JSON.stringify(next)],
  );
  modelsCache = { value: next, expiresAt: Date.now() + MODELS_CACHE_MS };
  return next;
}

let lastEmbeddingError: string | null = null;
let lastChatError: string | null = null;

function formatOpenAiError(error: unknown): string {
  const err = error as Error & { status?: number; code?: string; type?: string };
  return [
    err.status ? `status ${err.status}` : null,
    err.code ? `code ${err.code}` : null,
    err.type ? `type ${err.type}` : null,
    err.message,
  ]
    .filter(Boolean)
    .join("; ");
}

export function getLastEmbeddingError(): string | null {
  return lastEmbeddingError;
}

export function getLastChatError(): string | null {
  return lastChatError;
}

let client: OpenAI | null = null;
let clientKey = "";

async function getClient(): Promise<OpenAI | null> {
  const apiKey = await currentOpenAiApiKey();
  if (!apiKey) return null;
  if (!client || clientKey !== apiKey) {
    client = new OpenAI({ apiKey });
    clientKey = apiKey;
  }
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

function extractFirstJsonObject(text: string): string | null {
  const source = text.trim();
  const start = source.indexOf("{");
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < source.length; index += 1) {
    const ch = source[index];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") {
      depth += 1;
      continue;
    }
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1).trim();
      }
    }
  }

  return null;
}

type JsonParseResult =
  | { ok: true; value: unknown }
  | { ok: false; error: string };

function parseJsonPayload(text: string): JsonParseResult {
  const cleaned = stripFences(text);
  if (!cleaned) return { ok: false, error: "empty_json_payload" };

  const candidates = [cleaned];
  const extracted = extractFirstJsonObject(cleaned);
  if (extracted && extracted !== cleaned) candidates.push(extracted);

  let lastError = "invalid_json_payload";
  for (const candidate of candidates) {
    try {
      return { ok: true, value: JSON.parse(candidate) };
    } catch (error) {
      lastError = (error as Error).message || lastError;
    }
  }

  return { ok: false, error: lastError };
}

async function repairJsonPayloadWithLlm(
  client: OpenAI,
  model: string,
  invalidJson: string,
  parseError: string,
  maxTokens?: number,
): Promise<string | null> {
  const reasoning = isReasoningModel(model);
  const payload = {
    parse_error: parseError,
    invalid_json: invalidJson.slice(0, 120_000),
  };

  try {
    const response = await client.responses.create({
      model,
      instructions:
        "You repair broken JSON. Return only one valid JSON object and nothing else. " +
        "Preserve keys and values as accurately as possible, including Russian text and HTML. " +
        "Escape quotes and line breaks correctly.",
      input: JSON.stringify(payload),
      ...(reasoning ? {} : { temperature: 0 }),
      ...(maxTokens && !reasoning ? { max_output_tokens: maxTokens } : {}),
    });

    const repaired = extractTextFromResponse(response);
    return repaired ? stripFences(repaired) : null;
  } catch {
    return null;
  }
}

function extractTextFromResponse(response: unknown): string | null {
  if (!response || typeof response !== "object") return null;
  const root = response as { output_text?: unknown; output?: unknown[] };

  if (typeof root.output_text === "string" && root.output_text.trim()) {
    return root.output_text.trim();
  }

  if (!Array.isArray(root.output)) return null;

  const chunks: string[] = [];
  for (const item of root.output) {
    if (!item || typeof item !== "object") continue;
    const row = item as { content?: unknown[]; text?: unknown };
    if (typeof row.text === "string" && row.text.trim()) {
      chunks.push(row.text.trim());
    }
    if (!Array.isArray(row.content)) continue;

    for (const part of row.content) {
      if (!part || typeof part !== "object") continue;
      const node = part as { text?: unknown; type?: unknown };
      if (typeof node.text === "string" && node.text.trim()) {
        chunks.push(node.text.trim());
      }
      if (node.type === "output_text" && typeof node.text === "string" && node.text.trim()) {
        chunks.push(node.text.trim());
      }
    }
  }

  const merged = chunks.join("\n").trim();
  return merged || null;
}

type LlmModelSlot = "cheap" | "strong" | "cluster";

type ChatJsonOptions = {
  model?: string;
  modelSlot?: LlmModelSlot;
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
  const client = await getClient();
  if (!client) {
    lastChatError = "OPENAI_API_KEY is not configured (settings/env)";
    return null;
  }
  const models = await getLlmModelsConfig();
  const slot = options.modelSlot ?? "cheap";
  const model = options.model?.trim() || models[slot] || models.cheap;
  const reasoning = isReasoningModel(model);
  const maxOutputTokens = options.maxTokens && !reasoning ? options.maxTokens : undefined;
  try {
    const response = await client.responses.create({
      model,
      instructions: `${options.system}\n\nReturn only a single valid JSON object. No markdown, no commentary.`,
      input: options.user,
      ...(reasoning ? {} : { temperature: options.temperature ?? 0.2 }),
      ...(maxOutputTokens ? { max_output_tokens: maxOutputTokens } : {}),
    });
    const content = extractTextFromResponse(response);
    if (!content) {
      lastChatError = `model ${model} returned empty output`;
      return null;
    }

    const parsed = parseJsonPayload(content);
    if (parsed.ok) {
      lastChatError = null;
      return parsed.value as T;
    }

    const repairModels = [...new Set([models.cheap, model].map((item) => item.trim()).filter(Boolean))];
    for (const repairModel of repairModels) {
      const repairedText = await repairJsonPayloadWithLlm(
        client,
        repairModel,
        content,
        parsed.error,
        options.maxTokens,
      );
      if (!repairedText) continue;

      const repairedParsed = parseJsonPayload(repairedText);
      if (repairedParsed.ok) {
        lastChatError = null;
        return repairedParsed.value as T;
      }
    }

    lastChatError = `model ${model}; invalid_json: ${parsed.error}`;
    return null;
  } catch (error) {
    lastChatError = formatOpenAiError(error);
    console.error("[seo/openai] chatJson failed:", lastChatError);
    return null;
  }
}

/** Free-text completion (used for HTML article body). */
export async function chatText(options: ChatJsonOptions): Promise<string | null> {
  const client = await getClient();
  if (!client) {
    lastChatError = "OPENAI_API_KEY is not configured (settings/env)";
    return null;
  }
  const models = await getLlmModelsConfig();
  const slot = options.modelSlot ?? "strong";
  const model = options.model?.trim() || models[slot] || models.strong;
  const reasoning = isReasoningModel(model);
  const maxOutputTokens = options.maxTokens && !reasoning ? options.maxTokens : undefined;
  try {
    const response = await client.responses.create({
      model,
      instructions: options.system,
      input: options.user,
      ...(reasoning ? {} : { temperature: options.temperature ?? 0.5 }),
      ...(maxOutputTokens ? { max_output_tokens: maxOutputTokens } : {}),
    });
    const text = extractTextFromResponse(response);
    if (!text) {
      lastChatError = `model ${model} returned empty output`;
      return null;
    }
    lastChatError = null;
    return text;
  } catch (error) {
    lastChatError = formatOpenAiError(error);
    console.error("[seo/openai] chatText failed:", lastChatError);
    return null;
  }
}

/** Batch embeddings. Returns null on failure so callers can fall back to lexical clustering. */
export async function embed(texts: string[]): Promise<number[][] | null> {
  if (texts.length === 0) return null;
  const client = await getClient();
  if (!client) {
    lastEmbeddingError = "OPENAI_API_KEY is not configured (settings/env)";
    return null;
  }
  lastEmbeddingError = null;
  const models = await getLlmModelsConfig();
  const model = models.embedding;
  try {
    const response = await client.embeddings.create({
      model,
      input: texts,
    });
    return response.data.map((row) => row.embedding as number[]);
  } catch (error) {
    const err = error as Error & { status?: number; code?: string; type?: string };
    lastEmbeddingError = [
      `model ${model}`,
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

export type ResearchSource = {
  title: string;
  url: string;
  snippet?: string;
};

export type WebResearchResult = {
  summary: string;
  sources: ResearchSource[];
};

function normalizeUrl(value: unknown): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return "";
  if (!/^https?:\/\//i.test(text)) return "";
  return text;
}

function normalizeResearchSource(value: unknown): ResearchSource | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const url = normalizeUrl(raw.url ?? raw.link);
  if (!url) return null;
  const title = typeof raw.title === "string" && raw.title.trim() ? raw.title.trim() : url;
  const snippet = typeof raw.snippet === "string" ? raw.snippet.trim() : "";
  return { title, url, ...(snippet ? { snippet } : {}) };
}

/**
 * External web research for a topic. Uses OpenAI Responses API tool web_search_preview
 * and returns a compact summary plus deduplicated source list.
 */
export async function webResearch(topic: string, options?: { maxSources?: number }): Promise<WebResearchResult | null> {
  const client = await getClient();
  if (!client) return null;

  const query = topic.trim();
  if (!query) return null;

  const maxSources = Math.max(3, Math.min(options?.maxSources ?? 8, 12));
  const models = await getLlmModelsConfig().catch(() => ENV_MODELS);
  const model = models.cheap || "gpt-5-mini";
  const reasoning = isReasoningModel(model);

  try {
    const response = await client.responses.create({
      model,
      instructions:
        "Проведи веб-ресерч и верни один JSON-объект формата {summary, sources:[{title,url,snippet}]}. " +
        "summary: 6-10 тезисов по теме на русском, нейтрально и фактически. " +
        "sources: только реальные http/https URL, без дублей. Не выдумывай источники.",
      input: JSON.stringify({ topic: query, max_sources: maxSources }),
      tools: [{ type: "web_search_preview" }],
      ...(reasoning ? {} : { temperature: 0.2 }),
      max_output_tokens: 1400,
    });

    const content = extractTextFromResponse(response);
    if (!content) return null;

    const parsed = parseJsonPayload(content);
    if (!parsed.ok || !parsed.value || typeof parsed.value !== "object") return null;

    const raw = parsed.value as Record<string, unknown>;
    const summary = typeof raw.summary === "string" ? raw.summary.trim() : "";
    const sourcesRaw = Array.isArray(raw.sources) ? raw.sources : [];
    const seen = new Set<string>();
    const sources: ResearchSource[] = [];

    for (const item of sourcesRaw) {
      const source = normalizeResearchSource(item);
      if (!source) continue;
      if (seen.has(source.url)) continue;
      seen.add(source.url);
      sources.push(source);
      if (sources.length >= maxSources) break;
    }

    if (!summary && sources.length === 0) return null;
    return { summary, sources };
  } catch (error) {
    console.error("[seo/openai] webResearch failed:", (error as Error).message);
    return null;
  }
}

/** Generate one image with the configured image model (gpt-image-2 by default). */
export async function generateImage(prompt: string, size: "1024x1024" | "1536x1024" = "1536x1024"): Promise<GeneratedImage | null> {
  if (!prompt.trim()) return null;
  const client = await getClient();
  if (!client) return null;
  const models = await getLlmModelsConfig();
  const model = models.image;
  try {
    const response = await client.images.generate({
      model,
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
