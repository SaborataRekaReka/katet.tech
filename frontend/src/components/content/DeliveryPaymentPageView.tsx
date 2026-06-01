import type { RichPage } from "@/lib/content";
import { excerptFromHtml, stripHtml } from "@/lib/format";
import { DeliveryCostCalculator } from "@/components/equipment/DeliveryCostCalculator";
import { HeroLead } from "@/components/marketing/HeroLead";
import { normalizeImportedBody } from "./importedHtml";

type DeliveryPaymentSection = {
  id: string;
  title: string;
  summary: string;
  html: string;
};

type HeadingMatch = {
  start: number;
  end: number;
  text: string;
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanPageBody(record: RichPage) {
  const html = normalizeImportedBody(record.body);
  const title = escapeRegExp(record.title.trim());

  return html
    .replace(new RegExp(`^\\s*<h[1-3][^>]*>\\s*${title}\\s*</h[1-3]>`, "i"), "")
    .replace(new RegExp(`^\\s*<p[^>]*>\\s*${title}\\s*</p>`, "i"), "")
    .replace(new RegExp(`^\\s*${title}\\s*`, "i"), "")
    .trim();
}

function cleanupHtml(html: string) {
  return html
    .replace(/<hr\b[^>]*\/?>(?:\s|&nbsp;)*?/gi, "")
    .replace(/<p\b[^>]*>\s*(?:&nbsp;|<br\s*\/?>|\s)*<\/p>/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function removeDeliveryShortcodes(html: string) {
  return cleanupHtml(
    html
      .replace(/\[delivery_calculator\]/gi, "")
      .replace(/^\s*\[[a-z0-9_-]+(?:\s+[^\]]+)?\]\s*$/gim, "")
      .trim(),
  );
}

function collectHeadings(html: string, level: 2 | 3) {
  const matches: HeadingMatch[] = [];
  const pattern = new RegExp(`<h${level}\\b[^>]*>([\\s\\S]*?)<\\/h${level}>`, "gi");
  let result: RegExpExecArray | null;

  while ((result = pattern.exec(html)) !== null) {
    const text = stripHtml(result[1]).replace(/\s+/g, " ").trim();
    if (!text) continue;

    matches.push({
      start: result.index,
      end: result.index + result[0].length,
      text,
    });
  }

  return matches;
}

function firstHeadingInChunk(html: string) {
  const match = /<h([2-4])\b[^>]*>([\s\S]*?)<\/h\1>/i.exec(html);
  if (!match) return null;

  const text = stripHtml(match[2]).replace(/\s+/g, " ").trim();
  if (!text) return null;

  return {
    text,
    start: match.index,
    end: match.index + match[0].length,
  };
}

function compactText(value: string, maxLength = 150) {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;

  const clipped = text.slice(0, maxLength);
  const edge = Math.max(clipped.lastIndexOf("."), clipped.lastIndexOf(";"), clipped.lastIndexOf(","));
  if (edge > maxLength * 0.55) return `${clipped.slice(0, edge + 1).trim()}…`;

  return `${clipped.trim()}…`;
}

function sectionSummary(html: string) {
  const paragraph = /<p\b[^>]*>([\s\S]*?)<\/p>/i.exec(html);
  if (paragraph) {
    const text = stripHtml(paragraph[1]).replace(/\s+/g, " ").trim();
    if (text.length >= 40) return compactText(text, 180);
  }

  const listItem = /<li\b[^>]*>([\s\S]*?)<\/li>/i.exec(html);
  if (listItem) {
    const text = stripHtml(listItem[1]).replace(/\s+/g, " ").trim();
    if (text.length >= 24) return compactText(text, 140);
  }

  return "";
}

function sectionId(title: string, index: number) {
  const slug = title
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");

  return slug ? `delivery-payment-${slug}` : `delivery-payment-section-${index + 1}`;
}

function normalizeComparableText(value: string) {
  return value
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function isDuplicateText(candidate: string, source: string) {
  const left = normalizeComparableText(candidate);
  const right = normalizeComparableText(source);
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.length >= 36 && right.includes(left)) return true;
  if (right.length >= 36 && left.includes(right)) return true;
  return false;
}

function stripLeadingDuplicateParagraph(html: string, source: string) {
  if (!source) return html;

  const firstParagraph = /^\s*<p\b[^>]*>([\s\S]*?)<\/p>/i.exec(html);
  if (!firstParagraph) return html;

  const paragraphText = stripHtml(firstParagraph[1]).replace(/\s+/g, " ").trim();
  if (!isDuplicateText(paragraphText, source)) return html;

  return cleanupHtml(`${html.slice(0, firstParagraph.index)}${html.slice(firstParagraph.index + firstParagraph[0].length)}`);
}

function buildSections(html: string) {
  const normalized = cleanupHtml(html);
  if (!stripHtml(normalized)) return [] as DeliveryPaymentSection[];

  const sections: DeliveryPaymentSection[] = [];

  const pushSection = (title: string, sectionHtml: string) => {
    const nextHtml = cleanupHtml(sectionHtml);
    if (!stripHtml(nextHtml)) return;

    sections.push({
      id: sectionId(title, sections.length),
      title: title.replace(/\s+/g, " ").trim() || `Раздел ${sections.length + 1}`,
      summary: sectionSummary(nextHtml),
      html: nextHtml,
    });
  };

  const h2Sections = collectHeadings(normalized, 2);

  if (h2Sections.length) {
    const leadChunk = normalized.slice(0, h2Sections[0].start);
    if (stripHtml(leadChunk)) {
      const leadHeading = firstHeadingInChunk(leadChunk);
      if (leadHeading) {
        const withoutHeading = `${leadChunk.slice(0, leadHeading.start)}${leadChunk.slice(leadHeading.end)}`;
        pushSection(leadHeading.text, withoutHeading);
      } else {
        pushSection("Условия доставки", leadChunk);
      }
    }

    h2Sections.forEach((heading, index) => {
      const nextStart = h2Sections[index + 1]?.start ?? normalized.length;
      const chunk = normalized.slice(heading.end, nextStart);
      pushSection(heading.text, chunk);
    });

    return sections;
  }

  const h3Sections = collectHeadings(normalized, 3);

  if (h3Sections.length >= 2) {
    h3Sections.forEach((heading, index) => {
      const nextStart = h3Sections[index + 1]?.start ?? normalized.length;
      const chunk = normalized.slice(heading.end, nextStart);
      pushSection(heading.text, chunk);
    });

    return sections;
  }

  pushSection("Доставка и оплата", normalized);
  return sections;
}

export function DeliveryPaymentPageView({ record }: { record: RichPage }) {
  const lead = record.meta_description || excerptFromHtml(record.body, record.excerpt, 220);
  const bodyHtml = removeDeliveryShortcodes(cleanPageBody(record));
  const sections = buildSections(bodyHtml);
  const leadText = stripHtml(lead || "").replace(/\s+/g, " ").trim();

  const cleanedSections = sections
    .map((section, index) => ({
      ...section,
      title: index === 0 && isDuplicateText(section.title, record.title) ? "" : section.title,
      summary: isDuplicateText(section.summary, leadText) ? "" : section.summary,
      html: stripLeadingDuplicateParagraph(section.html, leadText),
    }))
    .filter((section) => Boolean(stripHtml(section.html)));

  return (
    <div className="archive-landing global-catalog-landing dispatcher-header-page static-landing delivery-payment-page">
      <HeroLead
        eyebrow="Страница"
        title={record.title}
        description={lead}
        imageSrc="/assets/katet/archive/archive-hero-crane.jpg"
        layout="mainLike"
        showOrderForm={false}
        breadcrumbs={[{ label: "Главная", href: "/" }, { label: record.title }]}
        sideContent={
          <section className="delivery-payment-page__hero-calculator equipment-detail-template__calculator" aria-label="Расчет стоимости доставки">
            <DeliveryCostCalculator equipmentTitle={record.title} />
          </section>
        }
      />

      <section className="static-template static-template--delivery-payment">
        <div className="container static-template__layout delivery-payment-page__layout">
          <article className="static-template__main delivery-payment-page__main">
            {cleanedSections.length ? (
              <section className="delivery-payment-page__accordion-wrap" aria-label="Условия доставки и оплаты по разделам">
                <div className="delivery-payment-page__accordion">
                  {cleanedSections.map((section, index) => (
                    <details className="delivery-payment-page__item" key={section.id}>
                      <summary className="delivery-payment-page__trigger">
                        <span className="delivery-payment-page__trigger-text">
                          <span className="delivery-payment-page__trigger-title">{section.title || `Раздел ${index + 1}`}</span>
                          {section.summary ? <span className="delivery-payment-page__trigger-summary">{section.summary}</span> : null}
                        </span>
                        <span className="delivery-payment-page__trigger-icon" aria-hidden="true" />
                      </summary>

                      <div className="delivery-payment-page__content">
                        <div className="content content--wide" dangerouslySetInnerHTML={{ __html: section.html }} />
                      </div>
                    </details>
                  ))}
                </div>
              </section>
            ) : (
              <div className="content content--wide" dangerouslySetInnerHTML={{ __html: bodyHtml }} />
            )}
          </article>
        </div>
      </section>
    </div>
  );
}
