import { notFound } from "next/navigation";
import { LandingPageView } from "@/components/ContentViews";
import { getWorkTypePage } from "@/lib/content";
import { metadataFrom } from "@/lib/format";

type Props = { params: Promise<{ slug: string }> };

export const revalidate = 300;

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const data = await getWorkTypePage(slug);
  return metadataFrom(data?.page, "Услуги спецтехники — Катет");
}

export default async function WorkTypeRoute({ params }: Props) {
  const { slug } = await params;
  const data = await getWorkTypePage(slug);

  if (!data) notFound();

  return <LandingPageView label="Тип работ" page={data.page} equipment={data.equipment} />;
}