import { DirectoryPage } from "@/components/ContentViews";
import { CITY_DIRECTORY_LINKS } from "@/lib/cityDirectory";
import { metadataFrom } from "@/lib/format";

export const revalidate = 300;

export function generateMetadata() {
  return metadataFrom(
    {
      title: "Города аренды спецтехники",
      meta_description: "Выберите город Московской области, чтобы перейти на страницу аренды спецтехники в нужной локации.",
      url_path: "/goroda/",
    },
    "Города аренды спецтехники",
  );
}

export default function CityDirectoryPage() {
  return (
    <DirectoryPage
      title="Города аренды спецтехники"
      description="Выберите город, чтобы перейти на локальную страницу аренды спецтехники Катет."
      links={CITY_DIRECTORY_LINKS}
    />
  );
}
