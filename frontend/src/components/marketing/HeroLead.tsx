import Image from "next/image";
import type { ReactNode } from "react";
import type { ImageFile } from "@/lib/format";
import { assetUrl, stripHtml } from "@/lib/format";
import { LeadCaptureForm } from "@/components/forms/LeadCaptureForm";
import { Breadcrumbs, type BreadcrumbItem } from "@/components/ui/Breadcrumbs";

const sectionLinks: Record<string, string> = {
  "аренда": "/arenda/",
  "блог": "/blog/",
  "бренд": "/brand/",
  "каталог": "/arenda/",
  "спецтехника": "/arenda_spetstekhniki/",
  "тип работ": "/tipy-rabot/",
};

const genericEyebrows = new Set(["страница"]);

function normalizeBreadcrumbLabel(value: string) {
  return value.toLocaleLowerCase("ru-RU").replaceAll("ё", "е").replace(/\s+/g, " ").trim();
}

function defaultHeroBreadcrumbs(eyebrow: string, title: string): BreadcrumbItem[] {
  const items: BreadcrumbItem[] = [{ label: "Главная", href: "/" }];
  const normalizedEyebrow = normalizeBreadcrumbLabel(eyebrow);
  const normalizedTitle = normalizeBreadcrumbLabel(title);

  if (normalizedEyebrow && normalizedEyebrow !== normalizedTitle && !genericEyebrows.has(normalizedEyebrow)) {
    items.push({ label: eyebrow, href: sectionLinks[normalizedEyebrow] });
  }

  items.push({ label: title });
  return items;
}

export function HeroLead({
  eyebrow,
  title,
  description,
  image,
  imageSrc,
  sideImage,
  sideContent,
  breadcrumbs,
  preTitleContent,
  showBreadcrumbs = true,
  showDescription = true,
  showOrderForm = true,
  layout = "mainLike",
  extraContent,
}: {
  eyebrow: string;
  title: string;
  description?: string | null;
  image?: ImageFile | null;
  imageSrc?: string;
  sideImage?: {
    src: string;
    alt?: string;
  } | null;
  sideContent?: ReactNode;
  breadcrumbs?: BreadcrumbItem[] | null;
  preTitleContent?: ReactNode;
  showBreadcrumbs?: boolean;
  showDescription?: boolean;
  showOrderForm?: boolean;
  layout?: "default" | "mainLike";
  extraContent?: ReactNode;
}) {
  const src = imageSrc || assetUrl(image) || "/assets/katet/home/hero-construction-site.jpg";
  const isMainLike = layout === "mainLike";
  const showBackgroundImage = !isMainLike;
  const hasSideContent = isMainLike && Boolean(sideContent);
  const showSideImage = isMainLike && !showOrderForm && !hasSideContent && Boolean(sideImage?.src);
  const heroBreadcrumbs = breadcrumbs ?? defaultHeroBreadcrumbs(eyebrow, title);

  return (
    <section className={`hero${isMainLike ? " hero--main-analog" : ""}`}>
      {showBackgroundImage && src ? <Image className="hero__image" src={src} alt="Спецтехника Катет" fill priority sizes="100vw" /> : null}
      <div className="hero__shade" />
      <div className={`container hero__inner${isMainLike ? " hero__inner--main-analog" : ""}`}>
        <div className={`hero__copy${isMainLike ? " hero__copy--main-analog" : ""}`}>
          {preTitleContent ? <div className="hero__pretitle">{preTitleContent}</div> : null}
          {!preTitleContent && showBreadcrumbs ? <Breadcrumbs className="hero__breadcrumbs breadcrumbs--hero" items={heroBreadcrumbs} /> : null}
          <h1>{title}</h1>
          {showDescription && description ? <p className="hero__description">{stripHtml(description)}</p> : null}
          {extraContent ? <div className="hero__extra">{extraContent}</div> : null}
          {!isMainLike && showOrderForm ? <HeroQuickOrderForm /> : null}
        </div>

        {showSideImage ? (
          <div className="hero__media" aria-label="Фото техники">
            <div className="hero__mediaImage u-pos-rel">
              <Image
                src={sideImage!.src}
                alt={sideImage?.alt || title}
                fill
                priority
                sizes="(max-width: 1020px) 92vw, (max-width: 1366px) 42vw, 36vw"
              />
            </div>
          </div>
        ) : null}

        {isMainLike && hasSideContent ? (
          <aside className="hero__panel hero__panel--custom" aria-label="Дополнительный блок">
            {sideContent}
          </aside>
        ) : null}

        {isMainLike && !hasSideContent && showOrderForm ? (
          <aside className="hero__panel" aria-label="Быстрый заказ">
            <HeroQuickOrderForm />
          </aside>
        ) : null}
      </div>
    </section>
  );
}

function HeroQuickOrderForm() {
  return (
    <LeadCaptureForm
      id="lead"
      className="hero-order"
      formName="Быстрый заказ"
      fields={[
        {
          name: "phone",
          label: "Телефон",
          type: "tel",
          placeholder: "+7 (___) ___-____",
          required: true,
          labelClassName: "hero-order__phone",
          srOnlyLabel: true,
        },
      ]}
      consentClassName="hero-order__consent"
      buttonText="Быстрый заказ"
      buttonClassName="hero-order__button"
      buttonVariant="accent"
      showMessengers
      messengerClassName="hero-order__messengers"
    />
  );
}