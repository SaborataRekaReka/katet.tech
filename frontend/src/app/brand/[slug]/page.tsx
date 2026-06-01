import { notFound } from "next/navigation";
import { LandingPageView } from "@/components/ContentViews";
import { getBrandPage } from "@/lib/content";
import { metadataFrom } from "@/lib/format";

type Props = { params: Promise<{ slug: string }> };

export const revalidate = 300;

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const data = await getBrandPage(slug);
  return metadataFrom(data?.page, "Аренда техники по бренду — Катет");
}

export default async function BrandRoute({ params }: Props) {
  const { slug } = await params;
  const data = await getBrandPage(slug);

  if (!data) notFound();

  return <LandingPageView label="Бренд" page={data.page} equipment={data.equipment} />;
}