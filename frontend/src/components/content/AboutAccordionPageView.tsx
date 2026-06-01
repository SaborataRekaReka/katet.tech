import Image from "next/image";
import type { RichPage } from "@/lib/content";
import { excerptFromHtml, stripHtml } from "@/lib/format";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { ActionLink } from "@/components/ui/Button";
import { CheckIcon, ClockIcon, RouteIcon, TruckIcon } from "@/components/ui/icons";
import { normalizeImportedBody } from "./importedHtml";

type AboutSection = {
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

type VideoExtractionResult = {
  html: string;
  videoUrl: string | null;
};

const ABOUT_VIDEO_FALLBACK_URL = "https://katet.tech/wp-content/uploads/2024/12/Untitled-1.mp4";
const ABOUT_VIDEO_POSTER = "/assets/katet/about-real/about-video-poster.jpg";

const ABOUT_STATS = [
  { value: "6+", label: "лет в строительной сфере" },
  { value: "100+", label: "видов спецтехники и машин" },
  { value: "24/7", label: "диспетчерская поддержка" },
  { value: "ТТК", label: "и Садовое кольцо в зоне допуска" },
] as const;

const ABOUT_MISSION_POINTS = [
  "Подбираем технику под задачу, грунт, габариты площадки и график работ.",
  "Отправляем проверенные машины с экипажами, которые знают строительные объекты Москвы и области.",
  "Держим связь на каждом этапе: от расчета смены до закрывающих документов.",
] as const;

const ABOUT_HISTORY_POINTS = [
  "Начинали с локальных строительных задач и выросли в сервис аренды с широким парком.",
  "Собрали партнерскую сеть, чтобы быстро закрывать редкие позиции и пиковые нагрузки.",
  "Выстроили контроль техники, операторов и логистики, чтобы клиенту не приходилось держать все в голове.",
] as const;

const ABOUT_PROCESS_STEPS = [
  {
    title: "Заявка",
    text: "Уточняем объект, сроки, подъезд, ограничения и нужный результат.",
    icon: ClockIcon,
  },
  {
    title: "Подбор",
    text: "Предлагаем технику, сменность, экипаж и понятную смету без лишних позиций.",
    icon: TruckIcon,
  },
  {
    title: "Выезд",
    text: "Координируем подачу машины, пропуска, маршрут и контакт на площадке.",
    icon: RouteIcon,
  },
  {
    title: "Контроль",
    text: "Остаемся на связи во время работ и помогаем быстро заменить технику при необходимости.",
    icon: CheckIcon,
  },
] as const;

const ABOUT_TEAM_CARDS = [
  {
    title: "Диспетчеры",
    text: "Быстро переводят задачу клиента в понятный набор техники, сроков и маршрутов.",
    image: "/assets/katet/about-real/about-team-dispatch.jpg",
  },
  {
    title: "Механики",
    text: "Следят за состоянием машин перед сменой и помогают держать парк готовым к выезду.",
    image: "/assets/katet/about-real/about-team-mechanics.jpg",
  },
  {
    title: "Операторы",
    text: "Работают на объектах аккуратно, с учетом техники безопасности и реальных условий площадки.",
    image: "/assets/katet/about-real/about-team-operators.jpg",
  },
  {
    title: "Логистика",
    text: "Планирует подачу, пропуска и замену техники, когда объект меняет темп.",
    image: "/assets/katet/about-real/about-team-logistics.jpg",
  },
] as const;

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

function removeAboutShortcodes(html: string) {
  return cleanupHtml(
    html
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
    .replaceAll("ё", "е")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");

  return slug ? `about-page-${slug}` : `about-page-section-${index + 1}`;
}

function normalizeComparableText(value: string) {
  return value
    .toLocaleLowerCase("ru-RU")
    .replaceAll("ё", "е")
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

function normalizeVideoUrl(url: string) {
  const normalized = url
    .replace(/&amp;/gi, "&")
    .replace(/^http:\/\/localhost:8081\/wp-content\/uploads\//i, "https://katet.tech/wp-content/uploads/")
    .trim();

  return /\/wp-content\/uploads\//i.test(normalized) ? null : normalized;
}

function stripTrailingPunctuation(url: string) {
  return url.replace(/[)\],.;]+$/g, "");
}

function extractAboutVideo(html: string): VideoExtractionResult {
  const firstH3Index = html.search(/<h3\b/i);
  const urlPattern = /https?:\/\/[^\s"'<>]+/gi;

  let preferred: { index: number; raw: string } | null = null;
  let fallback: { index: number; raw: string } | null = null;
  let result: RegExpExecArray | null;

  while ((result = urlPattern.exec(html)) !== null) {
    const raw = stripTrailingPunctuation(result[0]);
    const index = result.index;
    const isMediaExt = /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(raw);
    const isAssetLike = /\/assets\/[a-z0-9-]{20,}/i.test(raw) || /\/wp-content\/uploads\//i.test(raw);

    if (isMediaExt) {
      preferred = { index, raw };
      break;
    }

    if (isAssetLike && firstH3Index !== -1 && index < firstH3Index && !fallback) {
      fallback = { index, raw };
    }
  }

  const found = preferred || fallback;
  if (!found) {
    return {
      html: cleanupHtml(html),
      videoUrl: null,
    };
  }

  return {
    html: cleanupHtml(`${html.slice(0, found.index)}${html.slice(found.index + found.raw.length)}`),
    videoUrl: normalizeVideoUrl(found.raw),
  };
}

function sanitizeAboutSectionHtml(html: string) {
  let next = html
    .replace(/<(?:script|style|noscript|svg|iframe|object|embed|canvas|video|audio)\b[\s\S]*?<\/(?:script|style|noscript|svg|iframe|object|embed|canvas|video|audio)>/gi, "")
    .replace(/<figure\b[^>]*>[\s\S]*?<\/figure>/gi, "")
    .replace(/<a\b[^>]*\shref=("|')(?:https?:\/\/)?(?:localhost:\d+\/assets|[^"']*\/assets\/)[^"']*\1[^>]*>[\s\S]*?<\/a>/gi, "")
    .replace(/<a\b[^>]*>\s*<\/a>/gi, "")
    .replace(/<img\b[^>]*>/gi, "");

  let cutIndex = next.length;
  const cutMarkers = [
    /<button\b/i,
    /работаем\s+в\s+сфере\s+строительства\s+более\s+6\s+лет/iu,
    /внушительные\s+скидки\s+постоянным\s+клиентам/iu,
  ];

  for (const marker of cutMarkers) {
    const match = marker.exec(next);
    if (match?.index !== undefined && match.index < cutIndex) {
      cutIndex = match.index;
    }
  }

  next = next.slice(0, cutIndex);
  return cleanupHtml(next);
}

function buildSections(html: string, pageTitle: string) {
  const normalized = cleanupHtml(html);
  if (!stripHtml(normalized)) return [] as AboutSection[];

  const sections: AboutSection[] = [];

  const pushSection = (title: string, sectionHtml: string) => {
    const nextHtml = sanitizeAboutSectionHtml(sectionHtml);
    if (!stripHtml(nextHtml)) return;

    sections.push({
      id: sectionId(title, sections.length),
      title: title.replace(/\s+/g, " ").trim() || `Раздел ${sections.length + 1}`,
      summary: sectionSummary(nextHtml),
      html: nextHtml,
    });
  };

  const h2Sections = collectHeadings(normalized, 2);
  const h3Sections = collectHeadings(normalized, 3);

  if (h2Sections.length > 1) {
    const leadChunk = normalized.slice(0, h2Sections[0].start);
    if (stripHtml(leadChunk)) {
      const leadHeading = firstHeadingInChunk(leadChunk);
      if (leadHeading) {
        const withoutHeading = `${leadChunk.slice(0, leadHeading.start)}${leadChunk.slice(leadHeading.end)}`;
        pushSection(leadHeading.text, withoutHeading);
      } else {
        pushSection(pageTitle, leadChunk);
      }
    }

    h2Sections.forEach((heading, index) => {
      const nextStart = h2Sections[index + 1]?.start ?? normalized.length;
      const chunk = normalized.slice(heading.end, nextStart);
      pushSection(heading.text, chunk);
    });

    return sections;
  }

  if (h3Sections.length >= 2) {
    const introChunk = normalized.slice(0, h3Sections[0].start);
    if (stripHtml(introChunk)) {
      const introHeading = firstHeadingInChunk(introChunk);
      if (introHeading) {
        const withoutHeading = `${introChunk.slice(0, introHeading.start)}${introChunk.slice(introHeading.end)}`;
        pushSection(introHeading.text, withoutHeading);
      } else {
        pushSection(pageTitle, introChunk);
      }
    }

    h3Sections.forEach((heading, index) => {
      const nextStart = h3Sections[index + 1]?.start ?? normalized.length;
      const chunk = normalized.slice(heading.end, nextStart);
      pushSection(heading.text, chunk);
    });

    return sections;
  }

  if (h2Sections.length === 1) {
    const heading = h2Sections[0];
    const chunk = normalized.slice(heading.end);
    pushSection(heading.text, chunk);
    return sections;
  }

  pushSection(pageTitle, normalized);
  return sections;
}

export function AboutAccordionPageView({ record }: { record: RichPage }) {
  const lead = record.meta_description || excerptFromHtml(record.body, record.excerpt, 220);
  const sourceBody = removeAboutShortcodes(cleanPageBody(record));
  const videoExtracted = extractAboutVideo(sourceBody);
  const bodyHtml = videoExtracted.html;
  const sections = buildSections(bodyHtml, record.title);

  const leadText = stripHtml(lead || "").replace(/\s+/g, " ").trim();
  const introSection = sections[0] || null;
  const contentSections = introSection ? sections.slice(1) : sections;

  const cleanedIntroSection = introSection
    ? {
      ...introSection,
      title: isDuplicateText(introSection.title, record.title) ? "" : introSection.title,
      summary: isDuplicateText(introSection.summary, leadText) ? "" : introSection.summary,
      html: stripLeadingDuplicateParagraph(introSection.html, leadText),
    }
    : null;

  const cleanedContentSections = contentSections
    .map((section) => ({
      ...section,
      summary: isDuplicateText(section.summary, leadText) ? "" : section.summary,
      html: stripLeadingDuplicateParagraph(section.html, leadText),
    }))
    .filter((section) => Boolean(stripHtml(section.html)));

  const videoUrl = videoExtracted.videoUrl || (ABOUT_VIDEO_FALLBACK_URL.includes("/wp-content/uploads/") ? null : ABOUT_VIDEO_FALLBACK_URL);
  const heroDescription = "Подбираем машины, экипажи и логистику под объект: от земляных работ и демонтажа до перевозок, подъема грузов и вывоза материалов.";
  const introText = cleanedIntroSection ? compactText(stripHtml(cleanedIntroSection.html), 320) : "";
  const sourceHighlights = cleanedContentSections.slice(0, 3);

  return (
    <div className="archive-landing global-catalog-landing dispatcher-header-page static-landing about-page about-page--reference">
      <div className="about-reference">
        <section className="about-reference__hero" aria-labelledby="about-reference-title">
          <div className="container about-reference__hero-grid">
            <div className="about-reference__hero-copy">
              <Breadcrumbs className="about-reference__breadcrumbs" items={[{ label: "Главная", href: "/" }, { label: record.title }]} />
              <h1 id="about-reference-title">Катет — спецтехника для строительных объектов</h1>
              <p className="about-reference__lead">{heroDescription}</p>
              <div className="about-reference__actions">
                <ActionLink
                  href="/#lead"
                  variant="accent"
                  size="lg"
                  data-lead-modal="true"
                  data-lead-kind="consult"
                  data-lead-form-name="О нас — первый экран"
                  data-lead-title="Обсудить задачу со спецтехникой"
                  data-lead-submit="Жду звонка"
                >
                  Обсудить объект
                </ActionLink>
                <ActionLink href="/arenda/" variant="outline" size="lg">
                  Смотреть технику
                </ActionLink>
              </div>
            </div>

            <div className="about-reference__collage" aria-label="Спецтехника и строительные объекты Катет">
              <figure className="about-reference__photo about-reference__photo--main u-pos-rel-min-h-1">
                <Image
                  src="/assets/katet/about-real/about-hero-main.jpg"
                  alt="Строительная площадка со спецтехникой"
                  fill
                  priority
                  sizes="(max-width: 1020px) 92vw, 46vw"
                />
              </figure>
              <figure className="about-reference__photo about-reference__photo--side u-pos-rel-min-h-1">
                <Image
                  src="/assets/katet/about-real/about-hero-side.jpg"
                  alt="Работы спецтехники на объекте"
                  fill
                  sizes="(max-width: 1020px) 46vw, 20vw"
                />
              </figure>
              <figure className="about-reference__photo about-reference__photo--mini u-pos-rel-min-h-1">
                <Image
                  src="/assets/katet/about-real/about-hero-mini.jpg"
                  alt="Работы спецтехники на строительной площадке"
                  fill
                  sizes="(max-width: 1020px) 40vw, 16vw"
                />
              </figure>
              <div className="about-reference__seal" aria-label="Катет работает 24 часа в сутки">
                <span>24/7</span>
                <small>на связи</small>
              </div>
            </div>
          </div>
        </section>

        <section className="about-reference__stats" aria-label="Катет в цифрах">
          <div className="container about-reference__stats-grid">
            {ABOUT_STATS.map((item) => (
              <article className="about-reference__stat" key={item.label}>
                <strong>{item.value}</strong>
                <span>{item.label}</span>
              </article>
            ))}
          </div>
        </section>

        <section className="about-reference__statement" aria-label="Главный принцип работы">
          <div className="container about-reference__statement-inner">
            <p>
              {introText || "Мы помогаем заказчикам не просто найти машину, а собрать рабочее решение под объект: технику, экипаж, логистику, документы и понятный контакт на весь срок работ."}
            </p>
          </div>
        </section>

        <section className="about-reference__split about-reference__split--mission">
          <div className="container about-reference__split-grid">
            <div className="about-reference__image-stack" aria-label="Материалы и техника на объектах">
              <figure className="about-reference__stack-photo about-reference__stack-photo--wide u-pos-rel">
                <Image
                  src="/assets/katet/about-real/about-mission-wide.jpg"
                  alt="Земляные работы спецтехникой"
                  fill
                  sizes="(max-width: 1020px) 92vw, 40vw"
                />
              </figure>
              <figure className="about-reference__stack-photo about-reference__stack-photo--floating u-pos-rel">
                <Image
                  src="/assets/katet/about-real/about-mission-floating.jpg"
                  alt="Колесный экскаватор из парка Катет"
                  fill
                  sizes="(max-width: 1020px) 42vw, 18vw"
                />
              </figure>
            </div>

            <div className="about-reference__copy">
              <p className="about-reference__section-label">Наша миссия</p>
              <h2>Дать строителям технику, которая приезжает вовремя и работает без пауз</h2>
              <p>
                Катет закрывает аренду спецтехники как сервис: с подбором машины, экипажа, логистики и контролем смены. Так заказчик получает не список единиц, а понятный способ выполнить задачу на площадке.
              </p>
              <ul className="about-reference__checklist">
                {ABOUT_MISSION_POINTS.map((item) => (
                  <li key={item}>
                    <CheckIcon aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="about-reference__split about-reference__split--history">
          <div className="container about-reference__split-grid about-reference__split-grid--reverse">
            <div className="about-reference__copy">
              <p className="about-reference__section-label">История</p>
              <h2>Выросли из практики реальных строительных объектов</h2>
              <p>
                Мы знаем, как быстро меняется стройка: сегодня нужен экскаватор, завтра самосвалы, послезавтра трал или автокран. Поэтому внутри компании важны скорость ответа, честная оценка условий и возможность быстро перестроить подачу техники.
              </p>
              <ul className="about-reference__checklist about-reference__checklist--compact">
                {ABOUT_HISTORY_POINTS.map((item) => (
                  <li key={item}>
                    <CheckIcon aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="about-reference__history-media" aria-label="Рабочие направления компании">
              <figure className="u-pos-rel">
                <Image
                  src="/assets/katet/about-real/about-history.jpg"
                  alt="Перевозка негабаритного груза"
                  fill
                  sizes="(max-width: 1020px) 92vw, 42vw"
                />
              </figure>
              <div className="about-reference__history-note">
                <strong>от заявки до смены</strong>
                <span>один контакт отвечает за подбор, подачу и оперативные вопросы на объекте</span>
              </div>
            </div>
          </div>
        </section>

        <section className="about-reference__process" aria-labelledby="about-process-title">
          <div className="container about-reference__section-head about-reference__section-head--center">
            <p className="about-reference__section-label">Как работаем</p>
            <h2 id="about-process-title">Понятный маршрут от первой заявки до закрытия смены</h2>
            <p>Мы берем на себя подбор, подачу и координацию техники, чтобы на объекте оставался рабочий ритм.</p>
          </div>

          <div className="container about-reference__work-media">
            {videoUrl ? (
              <video className="about-reference__work-video" controls preload="metadata" playsInline poster={ABOUT_VIDEO_POSTER}>
                <source src={videoUrl} type="video/mp4" />
              </video>
            ) : (
              <Image className="about-reference__work-video" src={ABOUT_VIDEO_POSTER} alt="" width={1280} height={560} sizes="(max-width: 1080px) 100vw, 1080px" />
            )}
          </div>

          <div className="container about-reference__process-grid">
            {ABOUT_PROCESS_STEPS.map((item, index) => {
              const StepIcon = item.icon;
              return (
                <article className="about-reference__process-card" key={item.title}>
                  <span className="about-reference__process-number">0{index + 1}</span>
                  <StepIcon aria-hidden="true" />
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section className="about-reference__team" aria-labelledby="about-team-title">
          <div className="container about-reference__section-head">
            <div>
              <p className="about-reference__section-label">Команда</p>
              <h2 id="about-team-title">Люди, которые держат объект в движении</h2>
            </div>
            <ActionLink href="/contacty/" variant="outline" size="md">
              Контакты
            </ActionLink>
          </div>

          <div className="container about-reference__team-grid">
            {ABOUT_TEAM_CARDS.map((item) => (
              <article className="about-reference__team-card" key={item.title}>
                <figure className="u-pos-rel">
                  <Image src={item.image} alt={item.title} fill sizes="(max-width: 700px) 92vw, (max-width: 1020px) 42vw, 22vw" />
                </figure>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </section>

        {sourceHighlights.length ? (
          <section className="about-reference__source" aria-labelledby="about-source-title">
            <div className="container about-reference__section-head about-reference__section-head--center">
              <p className="about-reference__section-label">Подробности</p>
              <h2 id="about-source-title">Что важно для клиентов Катета</h2>
            </div>
            <div className="container about-reference__source-grid">
              {sourceHighlights.map((section) => (
                <article className="about-reference__source-card" key={section.id}>
                  <h3>{section.title}</h3>
                  <div className="content content--wide" dangerouslySetInnerHTML={{ __html: section.html }} />
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {!sections.length ? (
          <section className="about-reference__source" aria-label="Описание компании">
            <div className="container about-reference__source-grid about-reference__source-grid--single">
              <article className="about-reference__source-card">
                <div className="content content--wide" dangerouslySetInnerHTML={{ __html: bodyHtml }} />
              </article>
            </div>
          </section>
        ) : null}

        <section className="about-reference__cta" aria-label="Быстрый расчет">
          <div className="container about-reference__cta-inner">
            <div>
              <p className="about-reference__section-label">Готовы к объекту</p>
              <h2>Расскажите задачу, а мы подберем технику и смену</h2>
            </div>
            <ActionLink
              href="/#lead"
              variant="accent"
              size="lg"
              data-lead-modal="true"
              data-lead-kind="rent"
              data-lead-form-name="О нас — финальный блок"
              data-lead-title="Подобрать спецтехнику"
              data-lead-submit="Получить расчет"
            >
              Получить расчет
            </ActionLink>
          </div>
        </section>
      </div>
    </div>
  );
}
