import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { getWpConfig, loadMigrationEnv } from './env.mjs';

loadMigrationEnv();

const limitArgument = process.argv.find((argument) => argument.startsWith('--limit='));
const rowLimit = limitArgument ? Number.parseInt(limitArgument.split('=')[1], 10) : 0;

const wp = {
  ...getWpConfig(),
};

const outputDir = path.resolve(process.cwd(), 'output');
const outputPath = path.join(outputDir, 'city-seo-export.json');

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function limitClause() {
  return rowLimit > 0 ? ` LIMIT ${rowLimit}` : '';
}

function ensureTrailingSlash(value) {
  if (!value || value === '/') return '/';
  const normalized = value.startsWith('/') ? value : `/${value}`;
  return normalized.endsWith('/') ? normalized : `${normalized}/`;
}

function normalizePath(permalink, fallbackPath) {
  const source = permalink || fallbackPath;
  if (!source) return null;
  try {
    const url = new URL(source);
    return ensureTrailingSlash(decodeURIComponent(url.pathname));
  } catch {
    return ensureTrailingSlash(decodeURIComponent(source));
  }
}

function wpJsonRows(sql) {
  const output = execFileSync(
    'docker',
    [
      'exec',
      wp.container,
      'mariadb',
      `-u${wp.user}`,
      `-p${wp.password}`,
      '--default-character-set=utf8mb4',
      '--batch',
      '--raw',
      '--skip-column-names',
      wp.database,
      '-e',
      sql,
    ],
    { encoding: 'utf8', maxBuffer: 1024 * 1024 * 200 },
  );

  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function cityPagesSelect() {
  return `
    SELECT JSON_OBJECT(
      'legacy_id', p.ID,
      'status', p.post_status,
      'title', p.post_title,
      'slug', p.post_name,
      'body', p.post_content,
      'wp_updated_at', DATE_FORMAT(p.post_modified_gmt, '%Y-%m-%dT%H:%i:%sZ'),
      'permalink', yi.permalink
    ) AS doc
    FROM wp_posts p
    LEFT JOIN wp_yoast_indexable yi ON yi.object_type = 'post' AND yi.object_id = p.ID
    WHERE p.post_type = 'page'
      AND p.post_status IN ('publish', 'pending')
      AND p.post_name REGEXP ${sqlString('^arenda-specztehniki-v-')}
    ORDER BY p.ID
    ${limitClause()}
  `;
}

function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanupHtml(html) {
  return (html || '')
    .replace(/\r/g, '')
    .replace(/<p\b[^>]*>\s*(?:&nbsp;|<br\s*\/?>|\s)*<\/p>/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeBodyForSplit(html) {
  return cleanupHtml(
    String(html || '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, ''),
  );
}

function collectParagraphs(html) {
  const results = [];
  const pattern = /<p\b[^>]*>[\s\S]*?<\/p>/gi;
  let match;

  while ((match = pattern.exec(html)) !== null) {
    const chunk = match[0];
    const text = stripHtml(chunk);
    if (!text) continue;

    results.push({
      html: chunk,
      text,
      start: match.index,
      end: match.index + chunk.length,
    });
  }

  return results;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function decodeHtmlEntities(value) {
  return String(value)
    .replace(/&nbsp;|\u00A0/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&laquo;/gi, '«')
    .replace(/&raquo;/gi, '»');
}

function normalizeTextValue(value) {
  return decodeHtmlEntities(value).replace(/\s+/g, ' ').trim();
}

function extractIntroSegment(value) {
  let text = normalizeTextValue(value);
  if (!text) return '';

  const startMatch = /аренда спецтехники|специальная техника|компания «?катет»?|город\s+[а-яё\-\s]+/iu.exec(text);
  if (startMatch?.index && startMatch.index > 0) {
    text = text.slice(startMatch.index).trim();
  }

  const endMatch = /(?:^|\D)\d+\s*в наличии|[сc]егодня|смотреть все|быстрый заказ|категории техники|выберите категорию/iu.exec(text);
  if (endMatch?.index !== undefined && endMatch.index > 0) {
    text = text.slice(0, endMatch.index).trim();
  }

  return text;
}

function hasUiNoiseMarkers(text) {
  return /смотреть все|быстрый заказ|(?:^|\D)\d+\s*в наличии|категории техники|выберите категорию/iu.test(text);
}

function extractTextBlocks(html) {
  const text = String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|section|article|li|h[1-6]|ul|ol|figure|figcaption|table|tr|td|th|blockquote)>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\r/g, '');

  const blocks = text
    .split(/\n{2,}/)
    .map((item) => normalizeTextValue(item))
    .filter(Boolean);

  const lines = text
    .split(/\n+/)
    .map((item) => normalizeTextValue(item))
    .filter(Boolean);

  return [...blocks, ...lines];
}

function isIntroNoise(text) {
  const normalized = String(text).toLocaleLowerCase('ru-RU').replace(/\s+/g, ' ').trim();
  if (!normalized) return true;
  if (hasUiNoiseMarkers(normalized)) return true;

  const hasNoise = /оформляйте заявки через мессенджеры|telegram|whatsapp|категории техники|выберите категорию|смотреть все|быстрый заказ|(?:^|\D)\d+\s*в наличии|[сc]егодня|до конца сезона на всю спецтехнику|-?\d+% при заказе|более 100 видов спецмашин|допуск ростехнадзора|ттк и садовое кольцо|скидки постоянным клиентам|в нашем автопарке вы найдете спецтехнику для любых строительных работ|ростехнадзор дал разрешение на всю технику в нашем автопарке|вся спецтехника может производить работы в любой части москвы, в том числе ттк и садового кольца|предоставляем низкие цены при долгосрочном сотрудничестве/u.test(normalized);
  if (!hasNoise) return false;

  const mayBeSeoParagraph = /аренда спецтехники|если вы затрудняетесь|обратившись к нам|компания «?катет»?|мы предлагаем|специальная техника/u.test(normalized) && normalized.length >= 120;
  return !mayBeSeoParagraph;
}

function findDetailsStart(html) {
  const byHeading = /<h2\b[^>]*>[^<]*Ассортимент[\s\u00A0]+спецтехники[^<]*<\/h2>/iu.exec(html);
  if (byHeading?.index !== undefined) return byHeading.index;

  const phrase = /Ассортимент[\s\u00A0]+спецтехники/iu.exec(html);
  if (phrase?.index !== undefined) {
    const before = html.slice(0, phrase.index).toLowerCase();
    const nearestH2 = before.lastIndexOf('<h2');
    if (nearestH2 !== -1) return nearestH2;
    return phrase.index;
  }

  const semanticHeading = /<h2\b[^>]*>[^<]*(?:Почему\s+выбирают\s+нас|Почему\s+с\s+нами\s+выгодно|Преимущества|Наши\s+преимущества|Условия\s+аренды|Как\s+заказать|Часто\s+задаваемые\s+вопросы)[^<]*<\/h2>/iu.exec(html);
  if (semanticHeading?.index !== undefined) return semanticHeading.index;

  const firstHeading = html.search(/<h2\b/i);
  if (firstHeading !== -1) return firstHeading;

  return html.length;
}

function stripDetailsCatalogNoise(html) {
  const noiseStart = /смотреть\s+все|быстрый\s+заказ|(?:^|\D)\d+\s*в\s*наличии/iu.exec(html);
  if (noiseStart?.index === undefined) return html;

  const rest = html.slice(noiseStart.index);
  const nextSemanticHeading = /<h[23]\b[^>]*>[^<]*(?:Почему\s+выбирают\s+нас|Почему\s+с\s+нами\s+выгодно|Преимущества|Наши\s+преимущества|Ассортимент[\s\u00A0]+спецтехники|Условия\s+аренды|Как\s+заказать|Часто\s+задаваемые\s+вопросы|FAQ)[^<]*<\/h[23]>/iu.exec(rest);

  if (nextSemanticHeading?.index !== undefined && nextSemanticHeading.index > 0) {
    return `${html.slice(0, noiseStart.index)}${rest.slice(nextSemanticHeading.index)}`;
  }

  const noiseCount = (html.match(/смотреть\s+все|быстрый\s+заказ|(?:^|\D)\d+\s*в\s*наличии/giu) || []).length;
  if (noiseCount >= 4) {
    return html.slice(0, noiseStart.index);
  }

  return html;
}

function selectIntroParagraphs(primaryHtml, fallbackHtml) {
  const seen = new Set();
  const candidates = [];

  const pushCandidate = (value) => {
    const variants = [extractIntroSegment(value), normalizeTextValue(value)];

    for (const text of variants) {
      if (!text) continue;
      const key = text.toLocaleLowerCase('ru-RU');
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push(text);
    }
  };

  for (const item of collectParagraphs(primaryHtml)) {
    pushCandidate(item.text);
  }

  for (const block of extractTextBlocks(primaryHtml)) {
    pushCandidate(block);
  }

  if (fallbackHtml) {
    for (const item of collectParagraphs(fallbackHtml)) {
      pushCandidate(item.text);
    }

    for (const block of extractTextBlocks(fallbackHtml)) {
      pushCandidate(block);
    }
  }

  const filtered = candidates.filter((text) => text.length >= 45 && !isIntroNoise(text) && !hasUiNoiseMarkers(text));
  if (!filtered.length) return [];

  const prioritized = filtered.filter((text) => {
    const normalized = text.toLocaleLowerCase('ru-RU');
    if (/аренда спецтехники|если вы затрудняетесь|обратившись к нам|компания «?катет»?|мы предлагаем/u.test(normalized)) {
      return true;
    }
    return text.length >= 170;
  });

  const selected = prioritized.length ? prioritized : filtered;
  return selected.slice(0, 2);
}

function trimDetailsTail(html) {
  const markers = [
    /подберем спецтехнику под вашу задачу за 15 минут/iu,
    /<h[23]\b[^>]*>\s*меню\s*<\/h[23]>/iu,
    /©\s*\d{4}\s*катет/iu,
  ];

  let cutIndex = html.length;

  for (const marker of markers) {
    const found = marker.exec(html);
    if (found?.index !== undefined && found.index < cutIndex) {
      cutIndex = found.index;
    }
  }

  return html.slice(0, cutIndex);
}

function splitCitySeo(bodyHtml) {
  const normalized = normalizeBodyForSplit(bodyHtml);
  if (!stripHtml(normalized)) {
    return { intro_html: '', details_html: '' };
  }

  const detailsStart = findDetailsStart(normalized);
  const introRaw = detailsStart > 0 ? normalized.slice(0, detailsStart) : '';
  const detailsRaw = detailsStart < normalized.length ? normalized.slice(detailsStart) : normalized;

  const introTexts = selectIntroParagraphs(introRaw, normalized);
  const introHtml = cleanupHtml(introTexts.map((item) => `<p>${escapeHtml(item)}</p>`).join('\n'));
  const detailsHtml = cleanupHtml(stripDetailsCatalogNoise(trimDetailsTail(detailsRaw)));

  return {
    intro_html: introHtml,
    details_html: detailsHtml,
  };
}

async function main() {
  console.log(`WordPress source: ${wp.container}/${wp.database}`);
  if (rowLimit > 0) console.log(`Row limit per query: ${rowLimit}`);

  const rows = wpJsonRows(cityPagesSelect());
  const payload = rows.map((row) => {
    const split = splitCitySeo(row.body || '');
    const urlPath = normalizePath(row.permalink, `/${row.slug}/`);

    return {
      legacy_id: row.legacy_id,
      status: row.status,
      title: row.title,
      slug: row.slug,
      url_path: urlPath,
      wp_updated_at: row.wp_updated_at || null,
      intro_html: split.intro_html,
      details_html: split.details_html,
      intro_text: stripHtml(split.intro_html),
      details_text: stripHtml(split.details_html),
    };
  });

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(
    outputPath,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        source: `${wp.container}/${wp.database}`,
        total: payload.length,
        rows: payload,
      },
      null,
      2,
    ),
    'utf8',
  );

  console.log(`Exported ${payload.length} city pages -> ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
