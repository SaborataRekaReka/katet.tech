import { DirectoryPage } from "@/components/ContentViews";
import { getWorkTypesIndex } from "@/lib/content";
import { metadataFrom } from "@/lib/format";
import { ALL_FALLBACK_SERVICE_LINKS } from "@/lib/staticServices";

export const revalidate = 300;

export function generateMetadata() {
  return metadataFrom({ title: "Услуги спецтехники", url_path: "/tipy-rabot/" }, "Услуги спецтехники");
}

export default async function WorkTypesIndex() {
  const links = await getWorkTypesIndex(100);
  const fallbackLinks = ALL_FALLBACK_SERVICE_LINKS.filter(
    (item) => !links.some((link) => link.url_path === item.url_path || link.name === item.name),
  );

  return (
    <DirectoryPage
      title="Услуги спецтехники"
      description="Задачи, для которых можно заказать технику Катет с экипажем."
      links={[...links, ...fallbackLinks]}
      showIllustrations
    />
  );
}
