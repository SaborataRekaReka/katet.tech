import { DirectoryPage } from "@/components/ContentViews";
import { getBrandsIndex } from "@/lib/content";
import { metadataFrom } from "@/lib/format";

export const revalidate = 300;

export function generateMetadata() {
  return metadataFrom({ title: "Бренды спецтехники", url_path: "/brand/" }, "Бренды спецтехники");
}

export default async function BrandIndex() {
  const links = await getBrandsIndex(100);
  return <DirectoryPage title="Бренды спецтехники" description="Страницы аренды техники по производителям и моделям." links={links} />;
}