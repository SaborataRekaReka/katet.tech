import { SmartEquipmentCatalog } from "@/components/catalog/SmartEquipmentCatalog";
import { HeroLead } from "@/components/marketing/HeroLead";
import { getEquipmentIndex, getEquipmentTypesIndex, getWorkTypesIndex } from "@/lib/content";
import { metadataFrom } from "@/lib/format";

export const revalidate = 300;

export function generateMetadata() {
  return metadataFrom({ title: "Аренда спецтехники", url_path: "/arenda/" }, "Аренда спецтехники");
}

export default async function ArendaIndex() {
  const [equipment, categories, workTypes] = await Promise.all([
    getEquipmentIndex(260),
    getEquipmentTypesIndex(120),
    getWorkTypesIndex(140),
  ]);

  return (
    <div className="archive-landing global-catalog-landing dispatcher-header-page">
      <HeroLead
        eyebrow="Каталог"
        title="Каталог спецтехники Катет"
        description="Подберите технику по базовой категории, типу работ и ключевым характеристикам. Быстрый фильтр помогает сразу увидеть нужные позиции."
        imageSrc="/assets/katet/home/hero-construction-site.jpg"
        showDescription
        layout="mainLike"
      />
      <SmartEquipmentCatalog items={equipment} categories={categories} workTypes={workTypes} showWorkTypeFilter />
    </div>
  );
}