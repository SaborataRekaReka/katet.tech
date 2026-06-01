import { ArchiveListView } from "@/components/ContentViews";
import { getBlogPosts, getEquipmentTypesIndex } from "@/lib/content";
import { metadataFrom } from "@/lib/format";

type Props = { params: Promise<{ slug: string }> };

export const revalidate = 300;

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  return metadataFrom(
    {
      title: `Автор ${slug} — Катет`,
      url_path: `/author/${slug}/`,
      robots: "noindex",
    },
    "Автор — Катет",
  );
}

export default async function AuthorRoute({ params }: Props) {
  const { slug } = await params;
  const [posts, types] = await Promise.all([getBlogPosts(100), getEquipmentTypesIndex(1)]);

  return (
    <ArchiveListView
      eyebrow="Автор"
      title={slug}
      description="Архив публикаций автора. На старом сайте этот URL присутствует в sitemap, но для SEO его лучше оставить noindex."
      image={types[0]?.image}
      posts={posts}
      listTitle="Публикации"
    />
  );
}