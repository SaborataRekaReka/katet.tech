import { HomePageView } from "@/components/ContentViews";
import { getHomeData } from "@/lib/content";
import { metadataFrom } from "@/lib/format";

export const revalidate = 300;

export async function generateMetadata() {
  const { page } = await getHomeData();
  return metadataFrom(page, "Аренда спецтехники в Москве и области — Катет");
}

export default async function Home() {
  const { equipmentTypes, reviews } = await getHomeData();
  return <HomePageView equipmentTypes={equipmentTypes} reviews={reviews} />;
}
