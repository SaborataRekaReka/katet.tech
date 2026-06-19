import Link from "next/link";
import type { BlogCategoryRecord, EquipmentCardRecord, NavLink, RichPage, TaxonomyPageRecord } from "@/lib/content";
import { toDirectusVisualAttr } from "@/lib/directusVisual";
import { assetUrl, canonicalForPath, excerptFromHtml, siteUrl, stripHtml } from "@/lib/format";
import { siteContacts } from "@/lib/site";
import { EquipmentCard } from "@/components/equipment/EquipmentCard";
import { LeadCaptureForm } from "@/components/forms/LeadCaptureForm";
import { SmartEquipmentCatalog } from "@/components/catalog/SmartEquipmentCatalog";
import { HeroLead } from "@/components/marketing/HeroLead";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { ActionLink } from "@/components/ui/Button";
import { Carousel } from "@/components/ui/Carousel";
import { ContactLink } from "@/components/ui/ContactLinks";
import { CalendarIcon, ClockIcon, ListIcon, MailIcon, PhoneCallIcon, PinIcon, TelegramIcon, WhatsAppIcon } from "@/components/ui/icons";
import { AboutAccordionPageView } from "./AboutAccordionPageView";
import { DirectusPageBlocks, parseDirectusPageBlocks } from "./DirectusPageBlocks";
import { DeliveryPaymentPageView } from "./DeliveryPaymentPageView";
import { SeoArticleSection } from "./SeoArticleSection";
import { normalizeImportedBody } from "./importedHtml";

const CONTACT_ADDRESS = "г. Мытищи, Фуражный проезд, вл. 4, 403";
const CONTACT_MAP_SRC = "https://yandex.ru/map-widget/v1/?ll=37.753793%2C55.892375&mode=search&oid=58900577181&ol=biz&z=16";

type ArticleTocItem = {
  id: string;
  text: string;
  level: 2 | 3;
};

type ParagraphSlice = {
  html: string;
  start: number;
  end: number;
  text: string;
};

type CitySeoSplit = {
  introHtml: string;
  detailsHtml: string;
};

type ArticleEquipmentSection = {
  title: string;
  description?: string;
  items: EquipmentCardRecord[];
};

function ArticleMetaIcon({ kind }: { kind: "updated" | "reading" | "sections" }) {
  if (kind === "updated") {
    return <CalendarIcon aria-hidden="true" />;
  }

  if (kind === "sections") {
    return <ListIcon aria-hidden="true" />;
  }

  return <ClockIcon aria-hidden="true" />;
}

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

function cleanupHtmlFragments(html: string) {
  return html
    .replace(/<p\b[^>]*>\s*(?:&nbsp;|<br\s*\/?>|\s)*<\/p>/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sanitizeCityLandingSeoHtml(html: string) {
  return cleanupHtmlFragments(
    html
      .replace(/<(?:script|style|noscript|svg|iframe|object|embed|canvas|video|audio)\b[\s\S]*?<\/(?:script|style|noscript|svg|iframe|object|embed|canvas|video|audio)>/gi, "")
      .replace(/<img\b[^>]*>/gi, "")
      .replace(/<a\b[^>]*\shref=("|')(?:https?:\/\/)?(?:t\.me|telegram\.me|api\.whatsapp\.com|wa\.me|vk\.com)[^"']*\1[^>]*>[\s\S]*?<\/a>/gi, "")
      .replace(/<(?:header|footer|nav|aside|form)\b[^>]*>[\s\S]*?<\/(?:header|footer|nav|aside|form)>/gi, "")
      .replace(/<p\b[^>]*>\s*(?:telegram|whatsapp)\s*<\/p>/giu, "")
      .replace(/<a\b[^>]*>\s*<\/a>/gi, ""),
  );
}

function collectParagraphSlices(html: string) {
  const matches: ParagraphSlice[] = [];
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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;|\u00A0/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&laquo;/gi, "«")
    .replace(/&raquo;/gi, "»");
}

function normalizeTextValue(value: string) {
  return decodeHtmlEntities(value).replace(/\s+/g, " ").trim();
}

function extractCityIntroSegment(value: string) {
  let text = normalizeTextValue(value);
  if (!text) return "";

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

function hasCityUiNoiseMarkers(text: string) {
  return /смотреть все|быстрый заказ|(?:^|\D)\d+\s*в наличии|категории техники|выберите категорию/iu.test(text);
}

function extractCityTextBlocks(html: string) {
  const text = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|section|article|li|h[1-6]|ul|ol|figure|figcaption|table|tr|td|th|blockquote)>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\r/g, "");

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

function isCityIntroNoise(text: string) {
  const normalized = text.toLocaleLowerCase("ru-RU").replace(/\s+/g, " ").trim();
  if (!normalized) return true;
  if (hasCityUiNoiseMarkers(normalized)) return true;

  const hasNoise = /оформляйте заявки через мессенджеры|telegram|whatsapp|категории техники|выберите категорию|смотреть все|быстрый заказ|(?:^|\D)\d+\s*в наличии|[сc]егодня|до конца сезона на всю спецтехнику|-?\d+% при заказе|более 100 видов спецмашин|допуск ростехнадзора|ттк и садовое кольцо|скидки постоянным клиентам|в нашем автопарке вы найдете спецтехнику для любых строительных работ|ростехнадзор дал разрешение на всю технику в нашем автопарке|вся спецтехника может производить работы в любой части москвы, в том числе ттк и садового кольца|предоставляем низкие цены при долгосрочном сотрудничестве/u.test(normalized);
  if (!hasNoise) return false;

  const mayBeSeoParagraph = /аренда спецтехники|если вы затрудняетесь|обратившись к нам|компания «?катет»?|мы предлагаем|специальная техника/u.test(normalized) && normalized.length >= 120;
  return !mayBeSeoParagraph;
}

function findCitySeoDetailsStart(html: string) {
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

  const anyHeadingIndex = html.search(/<h2\b/i);
  if (anyHeadingIndex !== -1) return anyHeadingIndex;

  return html.length;
}

function stripCityDetailsCatalogNoise(html: string) {
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

function trimCitySeoDetailsTail(html: string) {
  const stopMarkers = [
    /подберем спецтехнику под вашу задачу за 15 минут/iu,
    /<h[23]\b[^>]*>\s*меню\s*<\/h[23]>/iu,
    /©\s*\d{4}\s*катет/iu,
  ];

  let cutIndex = html.length;

  for (const marker of stopMarkers) {
    const match = marker.exec(html);
    if (match?.index !== undefined && match.index < cutIndex) {
      cutIndex = match.index;
    }
  }

  return html.slice(0, cutIndex);
}

function selectCityIntroParagraphs(primaryHtml: string, fallbackHtml: string) {
  const seen = new Set<string>();
  const candidates: string[] = [];

  const pushCandidate = (value: string) => {
    const variants = [extractCityIntroSegment(value), normalizeTextValue(value)];

    for (const text of variants) {
      if (!text) continue;
      const key = text.toLocaleLowerCase("ru-RU");
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push(text);
    }
  };

  for (const item of collectParagraphSlices(primaryHtml)) {
    pushCandidate(item.text);
  }

  for (const block of extractCityTextBlocks(primaryHtml)) {
    pushCandidate(block);
  }

  if (fallbackHtml) {
    for (const item of collectParagraphSlices(fallbackHtml)) {
      pushCandidate(item.text);
    }

    for (const block of extractCityTextBlocks(fallbackHtml)) {
      pushCandidate(block);
    }
  }

  const filtered = candidates.filter((text) => text.length >= 45 && !isCityIntroNoise(text) && !hasCityUiNoiseMarkers(text));
  if (!filtered.length) return [];

  const prioritized = filtered.filter((text) => {
    const normalized = text.toLocaleLowerCase("ru-RU");
    if (/аренда спецтехники|если вы затрудняетесь|обратившись к нам|компания «?катет»?|мы предлагаем/u.test(normalized)) {
      return true;
    }
    return text.length >= 170;
  });

  const selected = prioritized.length ? prioritized : filtered;
  return selected.slice(0, 2);
}

function splitCityLandingSeoHtml(html: string): CitySeoSplit {
  if (!stripHtml(html)) return { introHtml: "", detailsHtml: "" };

  const sanitized = sanitizeCityLandingSeoHtml(html);
  const detailsStart = findCitySeoDetailsStart(sanitized);
  const introRaw = detailsStart > 0 ? sanitized.slice(0, detailsStart) : "";
  const detailsRaw = detailsStart < sanitized.length ? sanitized.slice(detailsStart) : sanitized;

  const introParagraphs = selectCityIntroParagraphs(introRaw, sanitized);
  const introHtml = cleanupHtmlFragments(introParagraphs.map((item) => `<p>${escapeHtml(item)}</p>`).join(""));
  const detailsHtml = cleanupHtmlFragments(stripCityDetailsCatalogNoise(trimCitySeoDetailsTail(detailsRaw)));

  return {
    introHtml,
    detailsHtml,
  };
}

function CitySeoIntroSection({ html, className, dataDirectus }: { html: string; className?: string; dataDirectus?: string }) {
  if (!stripHtml(html)) return null;

  return (
    <section className={`section city-landing__seo${className ? ` ${className}` : ""}`} data-directus={dataDirectus}>
      <div className="container">
        <article className="city-landing__seo-main">
          <div className="content content--wide seo-enhanced__body city-landing__seo-body" dangerouslySetInnerHTML={{ __html: html }} />
        </article>
      </div>
    </section>
  );
}

function prepareArticleBody(html: string) {
  const toc: ArticleTocItem[] = [];
  let index = 0;

  const withAnchors = html.replace(/<h([23])([^>]*)>([\s\S]*?)<\/h\1>/gi, (full, levelRaw, attrs, inner) => {
    const text = stripHtml(inner).replace(/\s+/g, " ").trim();
    if (!text) return full;

    const idMatch = String(attrs).match(/\sid=("|')([^"']+)\1/i);
    const id = idMatch?.[2] || `article-section-${index + 1}`;
    const level = Number(levelRaw) === 3 ? 3 : 2;
    index += 1;

    toc.push({ id, text, level });

    if (idMatch) return full;
    return `<h${level}${attrs} id="${id}">${inner}</h${level}>`;
  });

  return { html: withAnchors, toc };
}

function readingMinutes(html: string) {
  const words = stripHtml(html).split(/\s+/u).filter(Boolean).length;
  return Math.max(1, Math.round(words / 180));
}

function toIsoDate(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function toRuDate(isoDate: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(isoDate));
}

function isDeliveryPaymentPath(path: string | null | undefined) {
  if (!path) return false;
  return /^\/dosta(?:v|b)ka-i-oplata\/?$/iu.test(path);
}

function contactIntro(record: RichPage) {
  return stripHtml(record.body)
    .replace(/^Контакты\s*/i, "")
    .split("24/7")[0]
    .trim() || "Свяжитесь с нами, чтобы заказать спецтехнику или получить консультацию по любым вопросам.";
}

function uniqueNavLinks(list: Array<NavLink | null | undefined>) {
  const seen = new Set<string>();
  const result: NavLink[] = [];

  for (const item of list) {
    if (!item?.name || !item.url_path) continue;
    if (seen.has(item.url_path)) continue;
    seen.add(item.url_path);
    result.push({ name: item.name, url_path: item.url_path });
  }

  return result;
}

function articleSidebarTopics(record: RichPage, blogCategories: BlogCategoryRecord[] | null | undefined) {
  const postCategories = uniqueNavLinks((record.categories || []).map((item) => ({ name: item.name, url_path: item.url_path })));
  const globalCategories = uniqueNavLinks((blogCategories || []).map((item) => ({ name: item.name, url_path: item.url_path })));

  return uniqueNavLinks([...postCategories, ...globalCategories]).slice(0, 8);
}

export function ContentPageView({
  record,
  kind = "Страница",
  cityEquipment,
  cityCategories,
  blogCategories,
  articleEquipmentSection,
}: {
  record: RichPage;
  kind?: string;
  cityEquipment?: EquipmentCardRecord[] | null;
  cityCategories?: TaxonomyPageRecord[] | null;
  blogCategories?: BlogCategoryRecord[] | null;
  articleEquipmentSection?: ArticleEquipmentSection | null;
}) {
  if (record.url_path === "/contacty/") return <ContactPageView record={record} />;
  if (record.url_path === "/o-nas/") return <AboutAccordionPageView record={record} />;
  if (isDeliveryPaymentPath(record.url_path)) return <DeliveryPaymentPageView record={record} />;
  if (kind === "Статья") {
    return <ArticlePageView record={record} blogCategories={blogCategories} articleEquipmentSection={articleEquipmentSection} />;
  }

  const lead = record.meta_description || excerptFromHtml(record.body, record.excerpt, 220);
  const isCityLanding = /^\/arenda-specztehniki-v-[^/]+\/$/iu.test(record.url_path || "");
  const bodyHtml = cleanPageBody(record);
  const directusBlocks = parseDirectusPageBlocks(record.content_blocks);
  const hasDirectusBlocks = directusBlocks.length > 0;
  const citySeo = isCityLanding ? splitCityLandingSeoHtml(bodyHtml || record.body || record.excerpt || "") : null;
  const recordCollection = "pages";
  const heroRootDirectus = toDirectusVisualAttr({
    collection: recordCollection,
    item: record.id,
    fields: ["title", "excerpt", "meta_description", "featured_file_id"],
    mode: "drawer",
  });
  const titleDirectus = toDirectusVisualAttr({ collection: recordCollection, item: record.id, fields: "title", mode: "popover" });
  const leadDirectus = toDirectusVisualAttr({
    collection: recordCollection,
    item: record.id,
    fields: ["meta_description", "excerpt"],
    mode: "popover",
  });
  const bodyDirectus = toDirectusVisualAttr({
    collection: recordCollection,
    item: record.id,
    fields: hasDirectusBlocks ? ["content_blocks", "body"] : "body",
    mode: "drawer",
  });

  return (
    <div className={`archive-landing global-catalog-landing dispatcher-header-page static-landing${isCityLanding ? " city-landing" : ""}`}>
      <HeroLead
        eyebrow={kind}
        title={record.title}
        description={lead}
        imageSrc="/assets/katet/archive/archive-hero-crane.jpg"
        layout="mainLike"
        rootDataDirectus={heroRootDirectus}
        titleDataDirectus={titleDirectus}
        descriptionDataDirectus={leadDirectus}
      />

      {isCityLanding ? <CitySeoIntroSection html={citySeo?.introHtml || ""} className="city-landing__seo--intro" dataDirectus={bodyDirectus} /> : null}

      {isCityLanding && cityEquipment?.length && cityCategories?.length ? (
        <SmartEquipmentCatalog
          items={cityEquipment}
          categories={cityCategories}
          showWorkTypeFilter={false}
        />
      ) : null}

      {isCityLanding ? (
        <div data-directus={bodyDirectus}>
          <SeoArticleSection
            title={record.title}
            html={citySeo?.detailsHtml || ""}
            wide
            showFacts={false}
            className="city-landing__seo city-landing__seo--tail"
          />
        </div>
      ) : (
        <section className="static-template">
          <div className="container static-template__layout">
            <article className="static-template__main">
              <h2 className="static-template__main-title" data-directus={titleDirectus}>{record.title}</h2>
              {lead ? <p className="article-lead" data-directus={leadDirectus}>{lead}</p> : null}
              {hasDirectusBlocks ? (
                <DirectusPageBlocks blocks={directusBlocks} collection={recordCollection} itemId={record.id} />
              ) : (
                <div className="content content--wide" data-directus={bodyDirectus} dangerouslySetInnerHTML={{ __html: bodyHtml }} />
              )}
            </article>
            <aside className="static-template__side">
              <h2>Катет</h2>
              <p>Аренда спецтехники с экипажем по Москве и Московской области.</p>
              <ActionLink href="/#lead" variant="accent">
                Заказать звонок
              </ActionLink>
            </aside>
          </div>
        </section>
      )}
    </div>
  );
}

function ContactPageView({ record }: { record: RichPage }) {
  const collection = "pages";
  const heroRootDirectus = toDirectusVisualAttr({
    collection,
    item: record.id,
    fields: ["title", "excerpt", "meta_description", "body"],
    mode: "drawer",
  });
  const titleDirectus = toDirectusVisualAttr({ collection, item: record.id, fields: "title", mode: "popover" });
  const descriptionDirectus = toDirectusVisualAttr({
    collection,
    item: record.id,
    fields: ["excerpt", "meta_description", "body"],
    mode: "popover",
  });

  return (
    <div className="archive-landing global-catalog-landing dispatcher-header-page static-landing contact-page">
      <HeroLead
        eyebrow="Контакты"
        title={record.title}
        description={contactIntro(record)}
        imageSrc="/assets/katet/work/scene-construction-site.jpg"
        layout="mainLike"
        showOrderForm={false}
        rootDataDirectus={heroRootDirectus}
        titleDataDirectus={titleDirectus}
        descriptionDataDirectus={descriptionDirectus}
        sideContent={(
          <div className="contact-hero__map contact-template__map">
            <p className="contact-template__map-title">
              <span className="contact-template__map-icon" aria-hidden="true"><PinIcon /></span>
              Как к нам добраться
            </p>
            <iframe
              title="Катет на карте"
              src={CONTACT_MAP_SRC}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        )}
        extraContent={(
          <div className="contact-hero" aria-label="Контакты компании">
            <ul className="contact-hero__list">
              <li className="contact-hero__item">
                <span className="contact-hero__icon" aria-hidden="true"><ClockIcon /></span>
                <span>24/7</span>
              </li>
              <li className="contact-hero__item">
                <span className="contact-hero__icon" aria-hidden="true"><PinIcon /></span>
                <span>{CONTACT_ADDRESS}</span>
              </li>
              <li className="contact-hero__item">
                <ContactLink className="contact-hero__link" kind="phone">
                  <span className="contact-hero__icon" aria-hidden="true"><PhoneCallIcon /></span>
                  <span>{siteContacts.phoneDisplay}</span>
                </ContactLink>
              </li>
              <li className="contact-hero__item">
                <ContactLink className="contact-hero__link" kind="email">
                  <span className="contact-hero__icon" aria-hidden="true"><MailIcon /></span>
                  <span>{siteContacts.email}</span>
                </ContactLink>
              </li>
              <li className="contact-hero__item">
                <ContactLink className="contact-hero__link" kind="telegram">
                  <span className="contact-hero__icon" aria-hidden="true"><TelegramIcon /></span>
                  <span>@katettech</span>
                </ContactLink>
              </li>
              <li className="contact-hero__item">
                <ContactLink className="contact-hero__link" kind="whatsapp">
                  <span className="contact-hero__icon" aria-hidden="true"><WhatsAppIcon /></span>
                  <span>+74994606567</span>
                </ContactLink>
              </li>
            </ul>
            <ActionLink className="contact-hero__button" href="/#lead" variant="accent" size="md">
              <PhoneCallIcon aria-hidden="true" focusable="false" />
              <span>Заказать звонок</span>
            </ActionLink>
          </div>
        )}
      />
    </div>
  );
}

function ArticlePageView({
  record,
  blogCategories,
  articleEquipmentSection,
}: {
  record: RichPage;
  blogCategories?: BlogCategoryRecord[] | null;
  articleEquipmentSection?: ArticleEquipmentSection | null;
}) {
  const lead = record.meta_description || excerptFromHtml(record.body, record.excerpt, 220);
  const cleanedBody = cleanPageBody(record);
  const prepared = prepareArticleBody(cleanedBody);
  const canonicalUrl = record.canonical_url || canonicalForPath(record.url_path);
  const imageUrl = assetUrl(record.image);
  const updatedIso = toIsoDate(record.wp_updated_at);
  const updatedLabel = updatedIso ? toRuDate(updatedIso) : null;
  const minutesToRead = readingMinutes(prepared.html);
  const topLevelSections = prepared.toc.filter((item) => item.level === 2).length;
  const sidebarTopics = articleSidebarTopics(record, blogCategories);
  const postCategorySet = new Set((record.categories || []).map((item) => item.url_path).filter(Boolean));
  const collection = "posts";
  const titleDirectus = toDirectusVisualAttr({ collection, item: record.id, fields: "title", mode: "popover" });
  const leadDirectus = toDirectusVisualAttr({ collection, item: record.id, fields: ["excerpt", "meta_description"], mode: "popover" });
  const bodyDirectus = toDirectusVisualAttr({ collection, item: record.id, fields: "body", mode: "drawer" });

  const articleSchema = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: record.title,
    description: lead || undefined,
    url: canonicalUrl,
    mainEntityOfPage: canonicalUrl,
    datePublished: updatedIso || undefined,
    dateModified: updatedIso || undefined,
    image: imageUrl || undefined,
    inLanguage: "ru-RU",
    author: {
      "@type": "Organization",
      name: "Катет",
    },
    publisher: {
      "@type": "Organization",
      name: "Катет",
      url: siteUrl(),
    },
  });

  const breadcrumbSchema = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Главная",
        item: siteUrl(),
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Блог",
        item: `${siteUrl()}/blog/`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: record.title,
        item: canonicalUrl,
      },
    ],
  });

  return (
    <div className="article-template">
      <section className="article-template__section">
        <div className="container article-template__layout">
          <article className="article-template__main" aria-label="Материал блога">
            <Breadcrumbs className="article-template__breadcrumbs" items={[{ label: "Главная", href: "/" }, { label: "Блог", href: "/blog/" }, { label: record.title }]} />

            <header className="article-template__header">
              <p className="article-template__eyebrow">Блог Катет</p>
              <h1 className="article-template__title" data-directus={titleDirectus}>{record.title}</h1>
              {lead ? <p className="article-template__lead" data-directus={leadDirectus}>{lead}</p> : null}

              <ul className="article-template__meta" aria-label="Параметры статьи">
                {updatedLabel ? (
                  <li className="article-template__meta-item article-template__meta-item--updated">
                    <span className="article-template__meta-icon" aria-hidden="true"><ArticleMetaIcon kind="updated" /></span>
                    <span className="article-template__meta-label">Обновлено</span>
                    <time dateTime={updatedIso || undefined}>{updatedLabel}</time>
                  </li>
                ) : null}
                <li className="article-template__meta-item article-template__meta-item--reading">
                  <span className="article-template__meta-icon" aria-hidden="true"><ArticleMetaIcon kind="reading" /></span>
                  <span className="article-template__meta-label">Чтение</span>
                  {minutesToRead} мин
                </li>
                {topLevelSections ? (
                  <li className="article-template__meta-item article-template__meta-item--sections">
                    <span className="article-template__meta-icon" aria-hidden="true"><ArticleMetaIcon kind="sections" /></span>
                    <span className="article-template__meta-label">Разделов</span>
                    {topLevelSections}
                  </li>
                ) : null}
              </ul>
            </header>

            {prepared.toc.length ? (
              <nav className="article-template__toc" aria-label="Содержание статьи">
                <h3>Содержание</h3>
                <div className="article-template__toc-list">
                  {prepared.toc.map((item) => (
                    <a
                      className={`article-template__toc-link${item.level === 3 ? " article-template__toc-link--sub" : ""}`}
                      href={`#${item.id}`}
                      key={item.id}
                    >
                      {item.text}
                    </a>
                  ))}
                </div>
              </nav>
            ) : null}

            <div className="content content--wide article-template__content" data-directus={bodyDirectus} dangerouslySetInnerHTML={{ __html: prepared.html }} />
          </article>

          <aside className="article-template__sidebar">
            <div className="article-template__side-card">
              <p className="article-template__side-title">Темы и услуги</p>
              {sidebarTopics.map((topic) => (
                <Link
                  key={topic.url_path}
                  className={postCategorySet.has(topic.url_path) ? "article-template__side-link is-current" : "article-template__side-link"}
                  href={topic.url_path}
                >
                  {topic.name}
                </Link>
              ))}
              {!sidebarTopics.length ? (
                <Link className="article-template__side-link" href="/blog/">Все статьи блога</Link>
              ) : null}
            </div>

            <div className="article-template__side-card article-template__side-card--cta">
              <h3>Подберем технику под вашу задачу</h3>
              <p>За 15 минут рассчитаем стоимость, закрепим машину и согласуем подачу на объект.</p>
              <ActionLink href="/#lead" variant="accent" size="md">Получить расчет</ActionLink>
            </div>
          </aside>
        </div>
      </section>

      {articleEquipmentSection?.items?.length ? (
        <section className="article-template__equipment" aria-label="Подходящая спецтехника">
          <div className="container article-template__equipment-head">
            <h2>{articleEquipmentSection.title}</h2>
            {articleEquipmentSection.description ? <p>{articleEquipmentSection.description}</p> : null}
          </div>

          <Carousel
            className="container article-template__equipment-carousel"
            ariaLabel="Подходящая спецтехника"
            prevAriaLabel="Предыдущая карточка техники"
            nextAriaLabel="Следующая карточка техники"
            breakpoints={{ default: 3, widescreen: 3, tablet: 2, mobile: 1 }}
            gap={14}
            showDots
          >
            {articleEquipmentSection.items.map((item) => (
              <EquipmentCard key={item.id} item={item} variant="archive" />
            ))}
          </Carousel>
        </section>
      ) : null}

      <section className="article-template__discount">
        <div className="container article-template__discount-inner">
          <div>
            <h2>Получите персональное предложение на аренду</h2>
            <p>Оставьте номер телефона, и менеджер подберет технику под ваш объект и бюджет.</p>
          </div>
          <LeadCaptureForm
            formName="Скидка из статьи"
            fields={[{ name: "phone", label: "Телефон", type: "tel", placeholder: "+7", required: true }]}
            showConsent={false}
            buttonText="Получить предложение"
          />
        </div>
      </section>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: articleSchema }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: breadcrumbSchema }} />
    </div>
  );
}