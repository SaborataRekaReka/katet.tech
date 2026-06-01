import { notFound } from "next/navigation";
import { ArchiveListView } from "@/components/ContentViews";
import { getCategoryPage, getEquipmentTypesIndex } from "@/lib/content";
import { metadataFrom } from "@/lib/format";

type Props = { params: Promise<{ slug: string }> };

export const revalidate = 300;

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const decodedSlug = decodeURIComponent(slug);
  const category = await getCategoryPage(decodedSlug);

  if (!category) {
    return metadataFrom(
      {
        title: "Рубрика не найдена",
        url_path: `/category/${decodedSlug}/`,
        robots: "noindex",
      },
      "Рубрика не найдена",
    );
  }

  return metadataFrom(
    {
      title: category.seo_title || `${category.name} — Катет`,
      meta_description: category.meta_description || category.description || undefined,
      url_path: category.url_path,
      robots: category.robots || "index,follow",
    },
    `${category.name} — Катет`,
  );
}

export default async function CategoryRoute({ params }: Props) {
  const { slug } = await params;
  const decodedSlug = decodeURIComponent(slug);
  const [category, types] = await Promise.all([getCategoryPage(decodedSlug), getEquipmentTypesIndex(1)]);

  if (!category) notFound();

  return (
    <ArchiveListView
      eyebrow="Рубрика"
      title={category.name}
      description={category.meta_description || category.description || `Материалы из рубрики «${category.name}».`}
      image={types[0]?.image}
      posts={category.posts}
      listTitle="Материалы рубрики"
    />
  );
}