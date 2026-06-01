import type {
  EquipmentCardRecord,
  EquipmentItemRecord,
  TaxonomyPageRecord,
} from "@/lib/content";
import { ArchiveListView } from "@/components/content/ArchiveListView";
import { BlogCards } from "@/components/content/BlogCards";
import { ContentPageView } from "@/components/content/ContentPageView";
import { DirectoryPage } from "@/components/content/DirectoryPage";
import { ReviewPageView } from "@/components/content/ReviewPageView";
import { SeoArticleSection } from "@/components/content/SeoArticleSection";
import { ReviewsBlock } from "@/components/content/ReviewsBlock";
import { SeoContent } from "@/components/content/SeoContent";
import { EquipmentCard } from "@/components/equipment/EquipmentCard";
import { DeliveryCostCalculator } from "@/components/equipment/DeliveryCostCalculator";
import { EquipmentGrid } from "@/components/equipment/EquipmentGrid";
import { ManagerContactCard } from "@/components/equipment/ManagerContactCard";
import { LeadCaptureForm } from "@/components/forms/LeadCaptureForm";
import { HomeAdvantages, HomePageView, HomeSeoText } from "@/components/home/HomePageView";
import { HeroLead } from "@/components/marketing/HeroLead";
import { TaxonomyShowcase } from "@/components/taxonomy/TaxonomyShowcase";
import { Badge } from "@/components/ui/Badge";
import { ActionLink } from "@/components/ui/Button";
import { assetUrl, excerptFromHtml, formatPrice, stripHtml } from "@/lib/format";
import {
  workTypeIllustrationByUrlPath,
} from "@/lib/workTypeIllustrations";

export {
  ArchiveListView,
  BlogCards,
  ContentPageView,
  DirectoryPage,
  EquipmentCard,
  EquipmentGrid,
  HeroLead,
  HomeAdvantages,
  HomePageView,
  HomeSeoText,
  ReviewPageView,
  ReviewsBlock,
  SeoContent,
  TaxonomyShowcase,
};

export function LeadForm({ compact = false }: { compact?: boolean }) {
  return (
    <LeadCaptureForm
      id="lead"
      className={compact ? "lead-form lead-form--compact" : "lead-form"}
      formName="Быстрый расчет"
      title="Быстрый расчет"
      fields={[
        { name: "phone", label: "Телефон", type: "tel", placeholder: "+7", required: true },
        { name: "message", label: "Что нужно", placeholder: "Автокран, экскаватор, самосвал" },
      ]}
      showConsent={false}
      buttonText="Получить расчет"
      buttonVariant="accent"
      footer={<p>Нажимая кнопку, вы соглашаетесь с политикой обработки персональных данных.</p>}
    />
  );
}

type TaxonomyLandingVariant = "equipment" | "work" | "brand";

type DetailSpecEntry = {
  id: string;
  label: string;
  value: string | null;
};

function normalizeSpecToken(value: string) {
  return value
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/[ъь]/giu, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function detailSpecValue(spec: EquipmentItemRecord["specs"][number], index: number): DetailSpecEntry {
  const value = `${spec.value}${spec.unit ? ` ${spec.unit}` : ""}`.trim();
  const labelNorm = normalizeSpecToken(spec.label);
  if (!value) {
    return {
      id: `${spec.key}-${index}`,
      label: spec.label,
      value: null,
    };
  }

  const splitByDash = value.match(/^(.+?)\s*[–-]\s*(.+)$/u);
  if (splitByDash) {
    const leftNorm = normalizeSpecToken(splitByDash[1]);
    if (leftNorm.includes(labelNorm) || labelNorm.includes(leftNorm)) {
      return {
        id: `${spec.key}-${index}`,
        label: spec.label,
        value: splitByDash[2].trim(),
      };
    }
  }

  const valueNorm = normalizeSpecToken(value);
  if (valueNorm.includes(labelNorm)) {
    const numericStart = value.search(/\d/u);
    if (numericStart !== -1) {
      return {
        id: `${spec.key}-${index}`,
        label: spec.label,
        value: value.slice(numericStart).trim(),
      };
    }

    return {
      id: `${spec.key}-${index}`,
      label: value,
      value: null,
    };
  }

  return {
    id: `${spec.key}-${index}`,
    label: spec.label,
    value,
  };
}

function detailShiftPrice(item: EquipmentItemRecord) {
  const value = item.price_raw || item.price_amount;
  const number = Number(value);
  if (Number.isFinite(number)) return `${Math.round(number)} р. / смена`;
  return formatPrice(value);
}

function detailHourlyPrice(item: EquipmentItemRecord) {
  const value = Number(item.price_raw || item.price_amount);
  const hours = item.hours_per_shift || 8;
  if (!Number.isFinite(value) || !hours) return null;
  return `${Math.round(value / hours).toLocaleString("ru-RU")} р. / час`;
}

export function EquipmentCatalogView({ equipment }: { equipment: EquipmentCardRecord[] }) {
  return (
    <div className="archive-landing global-catalog-landing dispatcher-header-page">
      <HeroLead
        eyebrow="Каталог"
        title="Спецтехника в аренду"
        description="Выберите технику из каталога или оставьте заявку, и мы подберем машину под объект, смену и бюджет."
        imageSrc="/assets/katet/home/hero-construction-site.jpg"
        layout="mainLike"
      />
      <HomeAdvantages />
      <EquipmentGrid title="Все позиции каталога" items={equipment} />
    </div>
  );
}

export function LandingPageView({
  page,
  equipment,
  label,
}: {
  page: TaxonomyPageRecord;
  equipment: EquipmentCardRecord[];
  label: string;
}) {
  const variant: TaxonomyLandingVariant = label === "Тип работ" ? "work" : label === "Бренд" ? "brand" : "equipment";
  return <TaxonomyLandingTemplate page={page} equipment={equipment} label={label} variant={variant} />;
}

function TaxonomyLandingTemplate({
  page,
  equipment,
  label,
  variant,
}: {
  page: TaxonomyPageRecord;
  equipment: EquipmentCardRecord[];
  label: string;
  variant: TaxonomyLandingVariant;
}) {
  if (variant === "brand") return <BrandLandingPage page={page} equipment={equipment} />;

  const isKamazCranePage = page.slug === "uslugi-kamaza-avtokrana";
  const isWorkPage = variant === "work";
  const archiveEquipment = isKamazCranePage ? equipment.filter((item) => item.slug !== "avtokran-klinczy-32-tonny") : equipment;
  const catalogTitle = isKamazCranePage ? "Услуги КамАЗа-автокрана в Москве и области" : page.name;
  const shouldShowFilters = variant === "equipment" ? Boolean(page.filter_keys?.length) : isWorkPage;
  const archiveSeoTitle = page.slug === "arenda-tralov-v-moskve" ? "Аренда трала в Москве: условия и особенности" : page.name;
  const workTypeIllustration = isWorkPage ? workTypeIllustrationByUrlPath(page.url_path) : null;
  const breadcrumbs = isWorkPage
    ? [{ label: "Главная", href: "/" }, { label: "Услуги спецтехники", href: "/tipy-rabot/" }, { label: page.name }]
    : [{ label: "Главная", href: "/" }, { label: "Каталог спецтехники", href: "/arenda/" }, { label: page.name }];

  return (
    <div className={isWorkPage ? "archive-landing global-catalog-landing dispatcher-header-page work-landing" : "archive-landing global-catalog-landing dispatcher-header-page"}>
      <HeroLead
        eyebrow={label}
        title={page.name}
        description={page.meta_description || page.description}
        image={page.image}
        imageSrc={isWorkPage ? "/assets/katet/work/scene-construction-site.jpg" : "/assets/katet/archive/archive-hero-crane.jpg"}
        sideImage={isWorkPage && workTypeIllustration ? { src: workTypeIllustration, alt: page.name } : null}
        breadcrumbs={breadcrumbs}
        showDescription={!isWorkPage && !isKamazCranePage}
        showOrderForm={!isWorkPage}
        layout="mainLike"
      />
      <HomeAdvantages />
      <EquipmentGrid
        title={catalogTitle}
        items={archiveEquipment}
        variant="archive"
        showEyebrow={false}
        showFilters={shouldShowFilters}
        filterKeys={variant === "equipment" ? page.filter_keys : null}
        consultationAfter={isKamazCranePage ? 3 : undefined}
      />
      <SeoArticleSection title={archiveSeoTitle} html={page.body || page.description} wide />
    </div>
  );
}

function BrandLandingPage({ page, equipment }: { page: TaxonomyPageRecord; equipment: EquipmentCardRecord[] }) {
  const summaryText = stripHtml(page.meta_description || page.description) || "Техника бренда доступна для аренды с экипажем по Москве и Московской области.";

  return (
    <div className="archive-landing global-catalog-landing dispatcher-header-page brand-landing">
      <HeroLead
        eyebrow="Бренд"
        title={page.name}
        description={summaryText}
        image={page.image}
        imageSrc="/assets/katet/archive/archive-hero-crane.jpg"
        breadcrumbs={[{ label: "Главная", href: "/" }, { label: "Бренды спецтехники", href: "/brand/" }, { label: page.name }]}
        layout="mainLike"
      />
      <section className="brand-landing__summary">
        <div className="container brand-landing__summary-inner">
          <div className="brand-landing__mark" aria-hidden="true" />
          <div>
            <h2>{page.name}</h2>
            <p>{summaryText}</p>
          </div>
        </div>
      </section>
      <EquipmentGrid title="Каталог техники" items={equipment} variant="archive" showEyebrow={false} />
      <SeoArticleSection title={page.name} html={page.body || page.description} wide />
    </div>
  );
}

export function EquipmentDetail({ item }: { item: EquipmentItemRecord }) {
  const src = assetUrl(item.image);
  const excerpt = excerptFromHtml(item.body, item.excerpt, 260) || "Техника доступна для аренды с экипажем по Москве и области.";
  const specs = item.specs.map(detailSpecValue);
  const hourlyPrice = detailHourlyPrice(item);

  return (
    <div className="archive-landing global-catalog-landing dispatcher-header-page equipment-detail-template">
      <HeroLead
        eyebrow="Спецтехника"
        title={item.title}
        description={excerpt}
        image={item.image}
        imageSrc="/assets/katet/archive/archive-hero-crane.jpg"
        sideImage={src ? { src, alt: item.image?.title || item.title } : null}
        showOrderForm={false}
        layout="mainLike"
      />
      <section className="equipment-detail-page">
        <div className="container">
          <div className="equipment-detail-template__top">
            <div className="equipment-detail-template__meta" aria-label="Описание и параметры">
              <section className="equipment-detail-template__specs" aria-labelledby="detail-specs-title">
                <h2 id="detail-specs-title">Характеристики</h2>
                {specs.length ? (
                  <ul>
                    {specs.map((spec) => (
                      <li key={spec.id}>
                        <span className="equipment-detail-template__spec-label">{spec.label}</span>
                        {spec.value ? (
                          <>
                            <span className="equipment-detail-template__spec-dots" aria-hidden="true" />
                            <span className="equipment-detail-template__spec-value">{spec.value}</span>
                          </>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>Параметры уточняются при заказе.</p>
                )}
              </section>
            </div>

            <aside className="equipment-detail-template__offer" aria-label="Стоимость аренды">
              <div className="equipment-detail-template__price-wrap">
                <div className="equipment-detail-template__price">{detailShiftPrice(item)}</div>
                {hourlyPrice ? <p className="equipment-detail-template__subprice">{hourlyPrice}</p> : null}
              </div>
              <Badge className="equipment-detail-template__stock" tone="success">Есть в наличии</Badge>
              <p>{excerpt}</p>
              <div className="equipment-detail-template__delivery-note">Доставка от 60 минут</div>
              <ActionLink
                className="equipment-detail-template__button"
                href="#detail-lead"
                variant="accent"
                size="md"
                data-lead-modal="true"
                data-lead-kind="rent"
                data-lead-form-name="Детальная страница техники — заказ"
                data-lead-title="Оформить заказ техники"
                data-lead-topic={item.title}
                data-lead-message={`Интересует аренда: ${item.title}`}
                data-lead-submit="Оформить заказ"
              >
                Оформить заказ
              </ActionLink>
              <ActionLink
                className="equipment-detail-template__button equipment-detail-template__button--secondary"
                href="#detail-lead"
                variant="outline"
                size="md"
                data-lead-modal="true"
                data-lead-kind="consult"
                data-lead-form-name="Детальная страница техники — консультация"
                data-lead-title="Получить консультацию по технике"
                data-lead-topic={item.title}
                data-lead-message={`Нужна консультация по технике: ${item.title}`}
                data-lead-submit="Получить консультацию"
              >
                Получить консультацию
              </ActionLink>
              <strong className="equipment-detail-template__availability-note">Принимаем заявки 24/7</strong>
              <p className="equipment-detail-template__fineprint">Цена на сайте может отличаться от реальной. Подробности уточняйте у менеджера.</p>
            </aside>
          </div>

          <div className="equipment-detail-template__bottom">
            <section className="equipment-detail-template__contact" aria-label="Контакты менеджера">
              <ManagerContactCard variant="detail" />
              <LeadCaptureForm
                id="detail-lead"
                className="equipment-detail-template__lead"
                formName="Вопрос со страницы техники"
                title="Остались вопросы?"
                titleLevel="h3"
                hiddenFields={[{ name: "message", value: item.title }]}
                fields={[{ name: "phone", label: "Телефон", type: "tel", placeholder: "+7", required: true }]}
                consentClassName="equipment-detail-template__consent"
                consentDefaultChecked={false}
                buttonText="Оставить заявку"
                buttonClassName="equipment-detail-template__button"
                buttonVariant="accent"
              />
            </section>

            <section className="equipment-detail-template__calculator" aria-label="Расчет стоимости доставки">
              <DeliveryCostCalculator equipmentTitle={item.title} />
            </section>
          </div>
        </div>
      </section>

      <SeoContent title="О транспорте" html={item.body} wide />
      <HomeAdvantages />
    </div>
  );
}


