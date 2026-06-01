import { Section } from "@/components/layout/Section";
import { stripHtml } from "@/lib/format";
import { normalizeImportedBody } from "./importedHtml";
import { SeoContentToc } from "./SeoContentToc";

type ParagraphMatch = {
  html: string;
  start: number;
  end: number;
  text: string;
};

type RelatedLink = {
  href: string;
  text: string;
};

function collectParagraphs(html: string) {
  const matches: ParagraphMatch[] = [];
  const paragraphPattern = /<p\b[^>]*>[\s\S]*?<\/p>/gi;
  let result: RegExpExecArray | null;

  while ((result = paragraphPattern.exec(html)) !== null) {
    const raw = result[0];
    const text = stripHtml(raw).replace(/\s+/g, " ").trim();
    if (!text) continue;

    matches.push({
      html: raw,
      start: result.index,
      end: result.index + raw.length,
      text,
    });
  }

  return matches;
}

function takeSummaryParagraphs(paragraphs: ParagraphMatch[], count = 3) {
  return paragraphs.slice(0, count);
}

function collectSummaryFallbackTexts(html: string, count = 3) {
  const results: string[] = [];
  const sectionPattern = /<h[23]\b[^>]*>[\s\S]*?<\/h[23]>\s*([\s\S]*?)(?=<h[23]\b|$)/gi;
  let match: RegExpExecArray | null;

  const compactLead = (value: string) => {
    const sentenceChunks = value.match(/[^.!?]+[.!?]+/g) || [];
    if (sentenceChunks.length) {
      const compact = sentenceChunks.slice(0, 2).join(" ").trim();
      if (compact.length >= 120) return compact;
    }

    if (value.length <= 520) return value;
    const clipped = value.slice(0, 520);
    const edge = Math.max(clipped.lastIndexOf("."), clipped.lastIndexOf(";"), clipped.lastIndexOf(","));
    if (edge > 220) return `${clipped.slice(0, edge + 1).trim()}…`;
    return `${clipped.trim()}…`;
  };

  const normalizeText = (value: string) =>
    value
      .replace(/&nbsp;|&#160;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, "\"")
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&laquo;/gi, "«")
      .replace(/&raquo;/gi, "»")
      .replace(/\s+/g, " ")
      .trim();

  while ((match = sectionPattern.exec(html)) !== null && results.length < count) {
    const rawSection = match[1] || "";
    const leadText = normalizeText(
      rawSection
        .replace(/<(?:ul|ol|table|figure)\b[^>]*>[\s\S]*?<\/(?:ul|ol|table|figure)>/gi, " ")
        .replace(/<br\s*\/?>/gi, " ")
        .replace(/<[^>]+>/g, " "),
    );

    if (leadText.length < 60) continue;
    if (/заказать\s+звонок|работаем\s+в\s+сфере\s+строительства|внушительные\s+скидки/iu.test(leadText)) continue;

    results.push(compactLead(leadText));
  }

  return results;
}

function removeParagraphRanges(html: string, ranges: Array<{ start: number; end: number }>) {
  if (!ranges.length) return html;

  let cursor = 0;
  let next = "";

  for (const range of ranges) {
    if (range.start < cursor) continue;
    next += html.slice(cursor, range.start);
    cursor = range.end;
  }

  next += html.slice(cursor);
  return next;
}

function cleanupHtml(html: string) {
  return html
    .replace(/<p\b[^>]*>\s*(?:&nbsp;|<span[^>]*>\s*&nbsp;\s*<\/span>|\s)*<\/p>/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isLinkCloudChunk(chunk: string, minLinks = 6) {
  const links = chunk.match(/<a\b[^>]*>[\s\S]*?<\/a>/gi) ?? [];
  if (links.length < minLinks) return false;

  const internalLinks = links.filter((link) =>
    /href=("|')\/?(?:arenda|tipy-rabot|brand|category|arenda_spetstekhniki)\//i.test(link),
  ).length;
  if (internalLinks < Math.ceil(links.length * 0.6)) return false;

  const textWithoutLinks = stripHtml(chunk.replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, " "));
  return textWithoutLinks.length < 32;
}

function normalizeInternalHref(rawHref: string) {
  const next = rawHref
    .trim()
    .replace(/^https?:\/\/(?:www\.)?katet\.tech/iu, "")
    .replace(/^https?:\/\/localhost:\d+/iu, "");

  if (!next.startsWith("/")) return null;
  if (!/^\/(?:arenda|tipy-rabot|brand|category|arenda_spetstekhniki)\//iu.test(next)) return null;
  return next;
}

function collectRelatedLinks(chunk: string) {
  const links: RelatedLink[] = [];
  const seen = new Set<string>();
  const linkPattern = /<a\b[^>]*\shref=("|')([^"']+)\1[^>]*>([\s\S]*?)<\/a>/gi;
  let result: RegExpExecArray | null;

  while ((result = linkPattern.exec(chunk)) !== null) {
    const href = normalizeInternalHref(result[2]);
    if (!href || seen.has(href)) continue;

    const text = stripHtml(result[3]).replace(/\s+/g, " ").trim();
    if (!text || text.length < 4) continue;

    links.push({ href, text });
    seen.add(href);
  }

  return links;
}

function extractRelatedLinkCloud(html: string) {
  const collected: RelatedLink[] = [];
  const seen = new Set<string>();

  const absorb = (chunk: string) => {
    for (const link of collectRelatedLinks(chunk)) {
      if (seen.has(link.href)) continue;
      seen.add(link.href);
      collected.push(link);
    }
  };

  let next = html.replace(/<(p|div|section)\b[^>]*>[\s\S]*?<\/\1>/gi, (full) => {
    if (!isLinkCloudChunk(full, 4)) return full;
    absorb(full);
    return "";
  });

  next = next.replace(/<(ul|ol)\b[^>]*>[\s\S]*?<\/\1>/gi, (full) => {
    if (!isLinkCloudChunk(full, 4)) return full;
    absorb(full);
    return "";
  });

  next = next.replace(/(?:\s*(?:<br\s*\/?>|&nbsp;|,|;|\/|—|-))*\s*(?:<a\b[^>]*>[\s\S]*?<\/a>\s*(?:<br\s*\/?>|&nbsp;|\s|,|;|\.|\/|—|-){0,4}){4,}/gi, (full) => {
    if (!isLinkCloudChunk(full, 4)) return full;
    absorb(full);
    return "";
  });

  return {
    html: cleanupHtml(next),
    links: collected,
  };
}

function injectSectionAnchors(html: string) {
  const toc: Array<{ id: string; text: string; level: 2 | 3 }> = [];
  let sectionIndex = 0;

  const withAnchors = html.replace(/<h([23])([^>]*)>([\s\S]*?)<\/h\1>/gi, (full, levelRaw, attrs, inner) => {
    const text = stripHtml(inner).replace(/\s+/g, " ").trim();
    if (!text) return full;

    const idMatch = String(attrs).match(/\sid=("|')([^"']+)\1/i);
    const id = idMatch?.[2] || `seo-section-${sectionIndex + 1}`;
    sectionIndex += 1;

    const level = Number(levelRaw) === 3 ? 3 : 2;
    toc.push({ id, text, level });

    if (idMatch) return full;
    return `<h${level}${attrs} id="${id}">${inner}</h${level}>`;
  });

  return { html: withAnchors, toc };
}

function collectKeyFacts(html: string, limit = 4) {
  const facts: string[] = [];
  const seen = new Set<string>();

  const listPattern = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
  let result: RegExpExecArray | null;

  while ((result = listPattern.exec(html)) !== null) {
    const text = stripHtml(result[1]).replace(/\s+/g, " ").trim();
    if (!text || text.length < 12 || text.length > 120) continue;

    const normalized = text.toLocaleLowerCase("ru-RU");
    if (seen.has(normalized)) continue;

    if (/\d|москв|негабарит|груз|разрешен|высот|длина|ширина|вес/u.test(normalized)) {
      seen.add(normalized);
      facts.push(text.replace(/[;.,:]$/u, ""));
      if (facts.length >= limit) break;
    }
  }

  return facts;
}

export function SeoContentEnhanced({
  title,
  html,
  wide = false,
  className,
  showFacts = true,
}: {
  title?: string | null;
  html?: string | null;
  wide?: boolean;
  className?: string;
  showFacts?: boolean;
}) {
  if (!stripHtml(html)) return null;

  const sectionClassName = ["section", "section--seo-enhanced", className].filter(Boolean).join(" ");

  const normalized = normalizeImportedBody(html);
  const paragraphs = collectParagraphs(normalized);
  const summary = takeSummaryParagraphs(paragraphs, 3);
  const summaryFallback = summary.length ? [] : collectSummaryFallbackTexts(normalized, 1);
  const summaryTexts = summary.length ? summary.map((item) => item.text) : summaryFallback;

  const detailRaw = removeParagraphRanges(
    normalized,
    summary.map((item) => ({ start: item.start, end: item.end })),
  );
  const detailClean = cleanupHtml(detailRaw);
  const detailPrepared = extractRelatedLinkCloud(detailClean);
  const relatedLinks = detailPrepared.links;
  const relatedLinksPrimary = relatedLinks.slice(0, 10);
  const relatedLinksExtra = relatedLinks.slice(10);
  const detailWithAnchors = injectSectionAnchors(detailPrepared.html);
  const facts = collectKeyFacts(normalized, 4);

  return (
    <Section className={sectionClassName}>
      <div className={wide ? "container seo-enhanced seo-enhanced--wide" : "container seo-enhanced"}>
        <article className="seo-enhanced__card" aria-label="Расширенная информация по странице">
          <div className="seo-enhanced__analysis">
            {detailWithAnchors.toc.length ? <SeoContentToc items={detailWithAnchors.toc} /> : null}

            <div className="seo-enhanced__main">
              {title ? (
                <header className="seo-enhanced__head">
                  <h2>{title}</h2>
                </header>
              ) : null}

              {summaryTexts.length ? (
                <div className="seo-enhanced__intro">
                  {summaryTexts.map((text, index) => (
                    <p key={`${index}:${text.slice(0, 28)}`}>{text}</p>
                  ))}
                </div>
              ) : null}

              {showFacts && facts.length ? (
                <ul className="seo-enhanced__facts" aria-label="Ключевые факты">
                  {facts.map((fact) => (
                    <li key={fact}>{fact}</li>
                  ))}
                </ul>
              ) : null}

              {relatedLinks.length ? (
                <section className="seo-enhanced__related" aria-label="Похожие страницы по теме">
                  <h3 className="seo-enhanced__related-title">Смотрите также</h3>
                  <div className="seo-enhanced__related-list">
                    {relatedLinksPrimary.map((link) => (
                      <a className="seo-enhanced__related-chip" href={link.href} key={`${link.href}:${link.text}`}>
                        {link.text}
                      </a>
                    ))}
                  </div>

                  {relatedLinksExtra.length ? (
                    <details className="seo-enhanced__related-more">
                      <summary className="seo-enhanced__related-more-summary">Показать все ссылки</summary>
                      <div className="seo-enhanced__related-list seo-enhanced__related-list--expanded">
                        {relatedLinksExtra.map((link) => (
                          <a className="seo-enhanced__related-chip" href={link.href} key={`${link.href}:${link.text}`}>
                            {link.text}
                          </a>
                        ))}
                      </div>
                    </details>
                  ) : null}
                </section>
              ) : null}

              <details className="seo-enhanced__details">
                <summary className="seo-enhanced__summary">
                  <span className="seo-enhanced__summary-closed">Читать полный обзор</span>
                  <span className="seo-enhanced__summary-open">Свернуть полный обзор</span>
                </summary>

                {detailWithAnchors.html ? (
                  <div
                    className="content seo-enhanced__body"
                    dangerouslySetInnerHTML={{ __html: detailWithAnchors.html }}
                  />
                ) : null}
              </details>
            </div>
          </div>
        </article>
      </div>
    </Section>
  );
}