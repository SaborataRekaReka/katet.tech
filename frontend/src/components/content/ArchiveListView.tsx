import Link from "next/link";
import type { BlogCategoryRecord, RichPage } from "@/lib/content";
import type { ImageFile } from "@/lib/format";
import { HeroLead } from "@/components/marketing/HeroLead";
import type { BreadcrumbItem } from "@/components/ui/Breadcrumbs";
import { BlogCards } from "./BlogCards";

type ArchiveListViewProps = {
  eyebrow: string;
  title: string;
  description: string;
  posts: RichPage[];
  listTitle: string;
  image?: ImageFile | null;
  categories?: BlogCategoryRecord[] | null;
  activeCategorySlug?: string | null;
  breadcrumbs?: BreadcrumbItem[] | null;
};

function blogCategoryHref(slug: string) {
  return `/blog/?category=${encodeURIComponent(slug)}`;
}

export function ArchiveListView({
  eyebrow,
  title,
  description,
  posts,
  listTitle,
  image,
  categories,
  activeCategorySlug,
  breadcrumbs,
}: ArchiveListViewProps) {
  return (
    <div className="archive-landing global-catalog-landing dispatcher-header-page">
      <HeroLead eyebrow={eyebrow} title={title} description={description} image={image} breadcrumbs={breadcrumbs} layout="mainLike" />

      {categories?.length ? (
        <section className="blog-archive-filter" aria-label="Фильтр по рубрикам">
          <div className="container blog-archive-filter__inner">
            <nav className="blog-archive-filter__tabs" aria-label="Рубрики блога">
              <Link className={`blog-archive-filter__tab${!activeCategorySlug ? " is-active" : ""}`} href="/blog/">
                <span>Все статьи</span>
              </Link>

              {categories.map((category) => (
                <Link
                  key={category.id}
                  className={`blog-archive-filter__tab${activeCategorySlug === category.slug ? " is-active" : ""}`}
                  href={blogCategoryHref(category.slug)}
                >
                  <span>{category.name}</span>
                  {typeof category.item_count === "number" ? (
                    <span className="blog-archive-filter__count" aria-label={`Статей: ${category.item_count}`}>
                      {category.item_count}
                    </span>
                  ) : null}
                </Link>
              ))}
            </nav>
          </div>
        </section>
      ) : null}

      <BlogCards title={listTitle} posts={posts} />
    </div>
  );
}