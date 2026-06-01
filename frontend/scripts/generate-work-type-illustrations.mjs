import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const MANUAL_SLUGS = new Set([
  "vyvoz-grunta",
  "vyvoz-stroitelnogo-musora",
  "demontaj-zdaniy",
  "zemlyanye-raboty",
  "razrabotka-kotlovana",
  "razrabotka-karera",
  "negabaritnye-perevozki-tralom",
]);

const STYLE_REFERENCE_FILENAMES = [
  "Вывоз грунта.jpg",
  "Вывоз строительного мусора.jpg",
  "Земляные работы.jpg",
  "Разработка котлованов.jpg",
  "Демонтаж зданий.jpg",
  "Разработка карьеров.jpg",
  "Неабаритные перевозки.jpg",
];

const FALLBACK_SERVICE_NAMES_BY_SLUG = {
  "vyvoz-grunta": "Вывоз грунта",
  "vyvoz-stroitelnogo-musora": "Вывоз строительного мусора",
  "demontaj-zdaniy": "Демонтаж зданий",
  "zemlyanye-raboty": "Земляные работы",
  "razrabotka-kotlovana": "Разработка котлована",
  "razrabotka-karera": "Разработка карьера",
  "negabaritnye-perevozki-tralom": "Негабаритные перевозки тралом",
};

const IMAGE_MODEL_CANDIDATES = [
  { model: "gpt-image-2", size: "1536x1024" },
  { model: "gpt-image-1", size: "1536x1024" },
  { model: "dall-e-3", size: "1024x1024" },
  { model: "dall-e-2", size: "1024x1024" },
];

const OPENAI_REQUEST_TIMEOUT_MS = 240000;

const connectionString =
  process.env.DATABASE_URL ??
  "postgres://katet_directus:katet_directus_password@127.0.0.1:55432/katet_directus";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(scriptDirectory, "..");
const styleReferenceDir = join(projectRoot, "public", "assets", "katet", "services");
const outputDir = join(projectRoot, "public", "assets", "katet", "services", "generated");
const envCandidatePaths = [join(projectRoot, ".env.local"), join(projectRoot, ".env")];

function slugFromUrlPath(urlPath) {
  if (!urlPath) return null;
  const normalizedPath = String(urlPath).split("?")[0].replace(/\/+$/u, "");
  if (!normalizedPath) return null;
  const segments = normalizedPath.split("/").filter(Boolean);
  return segments[segments.length - 1] || null;
}

async function fileExists(filePath) {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function buildPrompt(serviceName) {
  return [
    `Иллюстрация для услуги спецтехники: ${serviceName}.`,
    "Сделай в едином визуальном стиле с приложенными референсами из каталога услуг.",
    "Строго 2D/векторная коммерческая иллюстрация: чистые контуры, мягкие тени, аккуратные формы техники.",
    "Палитра и композиция как в референсах: спокойный светлый фон, читаемый главный объект, без визуального шума.",
    "Без текста, без логотипов, без водяных знаков.",
    "Запрещено: фотореализм, фотографическая текстура, зерно, DOF, кинематографичный photo-look.",
  ].join(" ");
}

async function fetchWithTimeout(url, options = {}, timeoutMs = OPENAI_REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs}ms`);
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function collectStyleReferencePaths(limit = 4) {
  const selected = [];

  for (const fileName of STYLE_REFERENCE_FILENAMES) {
    const fullPath = join(styleReferenceDir, fileName);
    if (await fileExists(fullPath)) {
      selected.push(fullPath);
    }

    if (selected.length >= limit) break;
  }

  return selected;
}

async function callImagesGenerations(apiKey, candidate, prompt) {
  return fetchWithTimeout(
    "https://api.openai.com/v1/images/generations",
    {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: candidate.model,
      prompt,
      size: candidate.size,
    }),
    },
    OPENAI_REQUEST_TIMEOUT_MS,
  );
}

function mimeTypeByReferencePath(filePath) {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

async function callImagesEditsWithReferences(apiKey, candidate, prompt, styleReferencePaths) {
  const form = new FormData();
  form.set("model", candidate.model);
  form.set("prompt", prompt);
  form.set("size", candidate.size);

  let index = 1;
  for (const referencePath of styleReferencePaths) {
    const bytes = await readFile(referencePath);
    const mimeType = mimeTypeByReferencePath(referencePath);
    const extension = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
    form.append("image[]", new Blob([bytes], { type: mimeType }), `style-reference-${index}.${extension}`);
    index += 1;
  }

  return fetchWithTimeout(
    "https://api.openai.com/v1/images/edits",
    {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
    },
    OPENAI_REQUEST_TIMEOUT_MS,
  );
}

async function generateImageBuffer(apiKey, prompt, styleReferencePaths) {
  let lastError = null;

  for (const candidate of IMAGE_MODEL_CANDIDATES) {
    const useReferences = candidate.model.startsWith("gpt-image") && styleReferencePaths.length > 0;
    let response;

    try {
      response = useReferences
        ? await callImagesEditsWithReferences(apiKey, candidate, prompt, styleReferencePaths)
        : await callImagesGenerations(apiKey, candidate, prompt);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const requestTimedOut = /timeout|timed out|aborted/iu.test(message);

      if (requestTimedOut) {
        console.warn(`Model ${candidate.model} request timed out, trying next.`);
        lastError = new Error(`Model ${candidate.model} request timeout: ${message.slice(0, 220)}`);
        continue;
      }

      throw error;
    }

    if (!response.ok) {
      const text = await response.text();
      const noModelAccess =
        response.status === 403 ||
        response.status === 404 ||
        text.includes("model_not_found") ||
        text.includes("does not have access to model") ||
        text.includes("does not exist") ||
        text.includes('"param": "model"');

      if (noModelAccess) {
        console.warn(`Model ${candidate.model} is unavailable for this project, trying next.`);
        lastError = new Error(`Model ${candidate.model} unavailable: ${text.slice(0, 220)}`);
        continue;
      }

      throw new Error(`OpenAI image API error (${response.status}, ${candidate.model}): ${text.slice(0, 500)}`);
    }

    const payload = await response.json();
    const image = payload?.data?.[0];

    if (image?.b64_json) {
      return {
        buffer: Buffer.from(image.b64_json, "base64"),
        model: candidate.model,
        pipeline: useReferences ? "edits+refs" : "generations",
      };
    }

    if (image?.url) {
      const imageResponse = await fetchWithTimeout(
        image.url,
        {},
        OPENAI_REQUEST_TIMEOUT_MS,
      );
      if (!imageResponse.ok) {
        throw new Error(`Failed to download generated image (${imageResponse.status}, ${candidate.model})`);
      }

      return {
        buffer: Buffer.from(await imageResponse.arrayBuffer()),
        model: candidate.model,
        pipeline: useReferences ? "edits+refs" : "generations",
      };
    }

    throw new Error(`OpenAI response does not include an image payload for ${candidate.model}.`);
  }

  throw lastError || new Error("No available image model for this OpenAI project.");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeEnvValue(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function applyEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return;

  const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/u);
  if (!match) return;

  const [, key, valueRaw] = match;
  if (Object.prototype.hasOwnProperty.call(process.env, key)) return;

  process.env[key] = normalizeEnvValue(valueRaw);
}

async function loadEnvFromFiles() {
  for (const envPath of envCandidatePaths) {
    if (!(await fileExists(envPath))) continue;
    const content = await readFile(envPath, "utf8");
    for (const line of content.split(/\r?\n/u)) {
      applyEnvLine(line);
    }
  }
}

function fallbackServiceName(slug) {
  if (FALLBACK_SERVICE_NAMES_BY_SLUG[slug]) return FALLBACK_SERVICE_NAMES_BY_SLUG[slug];
  return slug
    .split("-")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ");
}

async function main() {
  await loadEnvFromFiles();
  await mkdir(outputDir, { recursive: true });

  const styleReferencePaths = await collectStyleReferencePaths(4);
  if (styleReferencePaths.length) {
    console.log(`Style references loaded: ${styleReferencePaths.length}`);
  } else {
    console.warn("Style references not found, generation will run without image examples.");
  }

  const pool = new pg.Pool({
    connectionString,
    max: 2,
  });

  const apiKey = process.env.OPENAI_API_KEY || "";
  const onlySlugs = new Set(
    String(process.env.ONLY_SLUGS || process.env.ONLY_SLUG || "")
      .split(",")
      .map((slug) => slug.trim())
      .filter(Boolean),
  );
  const shouldRegenerateExisting =
    process.env.REGENERATE_EXISTING === "1" ||
    String(process.env.REGENERATE_EXISTING || "").toLowerCase() === "true";
  const shouldGenerateManualSlugs =
    process.env.GENERATE_MANUAL_SLUGS === "1" ||
    String(process.env.GENERATE_MANUAL_SLUGS || "").toLowerCase() === "true";
  const pendingWithoutKey = [];
  const created = [];
  const skipped = [];
  const failed = [];

  try {
    let rows = [];

    try {
      const result = await pool.query(
        `
          SELECT name, url_path
          FROM work_types
          WHERE url_path IS NOT NULL
          ORDER BY name
        `,
      );
      rows = result.rows;
    } catch (error) {
      if (!onlySlugs.size) {
        throw error;
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn(`Database is unavailable (${errorMessage}). Falling back to ONLY_SLUGS list.`);
      rows = Array.from(onlySlugs, (slug) => ({
        name: fallbackServiceName(slug),
        url_path: `/tipy-rabot/${slug}/`,
      }));
    }

    for (const row of rows) {
      const name = String(row.name || "").trim();
      const urlPath = String(row.url_path || "").trim();
      const slug = slugFromUrlPath(urlPath);

      if (!name || !slug) {
        skipped.push({ name: name || urlPath || "<unknown>", reason: "no slug" });
        continue;
      }

      if (onlySlugs.size && !onlySlugs.has(slug)) {
        continue;
      }

      if (MANUAL_SLUGS.has(slug) && !shouldGenerateManualSlugs) {
        skipped.push({ name, reason: "has manual image" });
        continue;
      }

      const outputPath = join(outputDir, `${slug}.png`);
      if ((await fileExists(outputPath)) && !shouldRegenerateExisting) {
        skipped.push({ name, reason: "already generated" });
        continue;
      }

      if (!apiKey) {
        pendingWithoutKey.push({ name, slug });
        continue;
      }

      const prompt = buildPrompt(name);
      console.log(`Generating: ${name} (${slug})`);

      try {
        const generated = await generateImageBuffer(apiKey, prompt, styleReferencePaths);
        await writeFile(outputPath, generated.buffer);
        created.push({ name, slug, file: outputPath, model: generated.model, pipeline: generated.pipeline });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        failed.push({ name, slug, error: errorMessage });
        console.error(`Failed to generate ${slug}: ${errorMessage}`);
        continue;
      }

      await sleep(500);
    }
  } finally {
    await pool.end();
  }

  console.log(`Created images: ${created.length}`);
  console.log(`Skipped: ${skipped.length}`);

  if (created.length) {
    for (const item of created) {
      console.log(`  + ${item.slug}.png (${item.name}) via ${item.model} [${item.pipeline}]`);
    }
  }

  if (failed.length) {
    console.log(`\nFailed images: ${failed.length}`);
    for (const item of failed) {
      console.log(`  ! ${item.slug}: ${item.error}`);
    }
    process.exitCode = 1;
  }

  if (pendingWithoutKey.length) {
    console.log("\nOPENAI_API_KEY is not set. Pending image generation:");
    for (const item of pendingWithoutKey) {
      console.log(`  - ${item.slug} (${item.name})`);
    }
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
