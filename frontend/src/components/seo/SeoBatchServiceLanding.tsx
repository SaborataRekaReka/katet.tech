import { HomeAdvantages } from "@/components/ContentViews";
import { SeoArticleSection } from "@/components/content/SeoArticleSection";
import { EquipmentGrid } from "@/components/equipment/EquipmentGrid";
import { HeroLead } from "@/components/marketing/HeroLead";
import { type EquipmentCardRecord, getEquipmentIndex } from "@/lib/content";
import { metadataFrom, siteUrl } from "@/lib/format";
import { buildSeoBatchHtml, SEO_BATCH_SERVICES, type SeoBatchServiceKey } from "@/lib/seoBatch20260811";

function normalize(value: string | null | undefined) {
  return (value || "").toLocaleLowerCase("ru-RU").replace(/ё/g, "е").replace(/\s+/g, " ").trim();
}

function equipmentSearchText(item: EquipmentCardRecord) {
  return normalize([
    item.title,
    item.excerpt,
    ...(item.equipment_types || []).map((type) => type.name),
    ...(item.work_types || []).map((type) => type.name),
    ...(item.specs || []).flatMap((spec) => [spec.label, spec.value]),
  ].filter(Boolean).join(" "));
}

function pickEquipment(items: EquipmentCardRecord[], tokens: string[]) {
  const normalizedTokens = tokens.map(normalize);
  return items
    .map((item, index) => {
      const source = equipmentSearchText(item);
      const score = normalizedTokens.reduce((total, token, tokenIndex) => total + (source.includes(token) ? normalizedTokens.length - tokenIndex : 0), 0);
      return { item, index, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, 12)
    .map((entry) => entry.item);
}

export function metadataForSeoBatchService(serviceKey: SeoBatchServiceKey) {
  const service = SEO_BATCH_SERVICES[serviceKey];
  return metadataFrom({
    name: service.name,
    seo_title: service.seoTitle,
    meta_description: service.metaDescription,
    url_path: service.urlPath,
  }, service.seoTitle);
}

export async function SeoBatchServiceLanding({ serviceKey }: { serviceKey: SeoBatchServiceKey }) {
  const service = SEO_BATCH_SERVICES[serviceKey];
  const equipment = pickEquipment(await getEquipmentIndex(240), service.equipmentTokens);
  const host = siteUrl();
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Service",
        name: service.name,
        description: service.metaDescription,
        url: `${host}${service.urlPath}`,
        areaServed: ["Москва", "Московская область"],
        provider: { "@type": "Organization", name: "Катет", url: host },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Главная", item: host },
          { "@type": "ListItem", position: 2, name: "Услуги спецтехники", item: `${host}/tipy-rabot/` },
          { "@type": "ListItem", position: 3, name: service.name, item: `${host}${service.urlPath}` },
        ],
      },
      {
        "@type": "FAQPage",
        mainEntity: service.faq.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: { "@type": "Answer", text: item.answer },
        })),
      },
    ],
  };

  return (
    <div className="archive-landing global-catalog-landing dispatcher-header-page work-landing">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <HeroLead
        eyebrow="Тип работ"
        title={service.name}
        description={service.metaDescription}
        imageSrc="/assets/katet/work/scene-construction-site.jpg"
        sideImage={{ src: service.heroImage, alt: service.name }}
        breadcrumbs={[
          { label: "Главная", href: "/" },
          { label: "Услуги спецтехники", href: "/tipy-rabot/" },
          { label: service.name },
        ]}
        showDescription={false}
        showOrderForm={false}
        layout="mainLike"
      />
      <HomeAdvantages />
      <EquipmentGrid title={service.equipmentTitle} items={equipment} variant="archive" showEyebrow={false} />
      <SeoArticleSection title={service.seoTitle} html={buildSeoBatchHtml(service)} wide />
    </div>
  );
}
