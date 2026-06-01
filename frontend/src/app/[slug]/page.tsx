import { notFound } from "next/navigation";
import { ContentPageView } from "@/components/ContentViews";
import {
  getBlogCategories,
  getEquipmentIndexForCategorySidebar,
  getEquipmentTypesIndex,
  getPageOrPostByRootSlug,
} from "@/lib/content";
import { metadataFrom } from "@/lib/format";

type Props = { params: Promise<{ slug: string }> };

export const revalidate = 300;

function isCityLandingPath(path: string | null | undefined) {
  if (!path) return false;
  return /^\/arenda-specztehniki-v-[^/]+\/$/iu.test(path);
}

function toIsoDate(value?: string | null) {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const data = await getPageOrPostByRootSlug(decodeURIComponent(slug));
  const base = metadataFrom(data?.record, "Катет");

  if (!data || data.kind !== "post") return base;

  const iso = toIsoDate(data.record.wp_updated_at);

  return {
    ...base,
    openGraph: {
      ...base.openGraph,
      type: "article",
      publishedTime: iso,
      modifiedTime: iso,
    },
  };
}

export default async function RootSlugRoute({ params }: Props) {
  const { slug } = await params;
  const data = await getPageOrPostByRootSlug(decodeURIComponent(slug));

  if (!data) notFound();

  const [cityEquipment, cityCategories, blogCategories] = await Promise.all([
    data.kind === "page" && isCityLandingPath(data.record.url_path)
      ? getEquipmentIndexForCategorySidebar(160)
      : Promise.resolve(null),
    data.kind === "page" && isCityLandingPath(data.record.url_path)
      ? getEquipmentTypesIndex(120)
      : Promise.resolve(null),
    data.kind === "post" ? getBlogCategories(10) : Promise.resolve(null),
  ]);

  return (
    <ContentPageView
      record={data.record}
      kind={data.kind === "post" ? "Статья" : "Страница"}
      cityEquipment={cityEquipment}
      cityCategories={cityCategories}
      blogCategories={blogCategories}
    />
  );
}