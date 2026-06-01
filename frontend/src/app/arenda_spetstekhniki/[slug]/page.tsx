import { notFound } from "next/navigation";
import { EquipmentDetail } from "@/components/ContentViews";
import { getEquipmentItemPage } from "@/lib/content";
import { metadataFrom } from "@/lib/format";

type Props = { params: Promise<{ slug: string }> };

export const revalidate = 300;

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const item = await getEquipmentItemPage(slug);
  return metadataFrom(item, "Аренда спецтехники — Катет");
}

export default async function EquipmentItemRoute({ params }: Props) {
  const { slug } = await params;
  const item = await getEquipmentItemPage(slug);

  if (!item) notFound();

  return <EquipmentDetail item={item} />;
}