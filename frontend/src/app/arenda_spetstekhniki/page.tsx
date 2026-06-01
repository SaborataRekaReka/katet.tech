import { EquipmentCatalogView } from "@/components/ContentViews";
import { getEquipmentIndex } from "@/lib/content";
import { metadataFrom } from "@/lib/format";

export const revalidate = 300;

export function generateMetadata() {
  return metadataFrom(
    {
      title: "Аренда спецтехники в Москве",
      meta_description: "Каталог спецтехники Катет с ценами, характеристиками и быстрым расчетом аренды.",
      url_path: "/arenda_spetstekhniki/",
    },
    "Аренда спецтехники в Москве",
  );
}

export default async function EquipmentIndex() {
  const equipment = await getEquipmentIndex(160);
  return <EquipmentCatalogView equipment={equipment} />;
}