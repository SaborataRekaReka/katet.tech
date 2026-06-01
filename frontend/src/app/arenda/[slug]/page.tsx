import { notFound } from "next/navigation";
import { LandingPageView } from "@/components/ContentViews";
import { getEquipmentTypePage } from "@/lib/content";
import { metadataFrom } from "@/lib/format";

type Props = { params: Promise<{ slug: string }> };

export const revalidate = 300;

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const data = await getEquipmentTypePage(slug);
  return metadataFrom(data?.page, "Аренда спецтехники — Катет");
}

export default async function EquipmentTypeRoute({ params }: Props) {
  const { slug } = await params;
  const data = await getEquipmentTypePage(slug);

  if (!data) notFound();

  return <LandingPageView label="Аренда" page={data.page} equipment={data.equipment} />;
}