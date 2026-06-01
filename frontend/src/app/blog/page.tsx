import { ArchiveListView } from "@/components/ContentViews";
import { getBlogCategories, getBlogPosts, getCategoryPage, getEquipmentTypesIndex } from "@/lib/content";
import { metadataFrom } from "@/lib/format";

type Props = {
  searchParams: Promise<{ category?: string | string[] }>;
};

export const revalidate = 300;

export function generateMetadata() {
  return metadataFrom(
    {
      title: "Блог — Катет",
      meta_description: "Материалы об аренде спецтехники, выборе машин и строительных работах.",
      url_path: "/blog/",
    },
    "Блог — Катет",
  );
}

function firstQueryValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] || "";
  return value || "";
}

export default async function BlogIndex({ searchParams }: Props) {
  const { category } = await searchParams;
  const requestedCategorySlug = decodeURIComponent(firstQueryValue(category)).trim();

  const [posts, types, categories, selectedCategory] = await Promise.all([
    getBlogPosts(100),
    getEquipmentTypesIndex(1),
    getBlogCategories(12),
    requestedCategorySlug ? getCategoryPage(requestedCategorySlug) : Promise.resolve(null),
  ]);

  const visiblePosts = selectedCategory?.posts || posts;
  const listTitle = selectedCategory ? `Рубрика: ${selectedCategory.name}` : "Все статьи";
  const description = "Разборы техники, подсказки по выбору и практические материалы для заказчиков.";

  return (
    <ArchiveListView
      eyebrow="Блог"
      title="Материалы о спецтехнике и строительных работах"
      breadcrumbs={[{ label: "Главная", href: "/" }, { label: "Блог" }]}
      description={description}
      image={types[0]?.image}
      posts={visiblePosts}
      listTitle={listTitle}
      categories={categories}
      activeCategorySlug={selectedCategory?.slug || null}
    />
  );
}