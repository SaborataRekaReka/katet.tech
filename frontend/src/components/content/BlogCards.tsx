import Image from "next/image";
import Link from "next/link";
import type { RichPage } from "@/lib/content";
import { assetUrl, excerptFromHtml } from "@/lib/format";
import { Section, SectionHeader } from "@/components/layout/Section";

export function BlogCards({ title, posts }: { title: string; posts: RichPage[] }) {
  if (!posts.length) return null;

  return (
    <Section>
      <SectionHeader eyebrow="" title={title} />
      <div className="container blog-grid">
        {posts.map((post) => {
          const src = assetUrl(post.image);
          return (
            <article className="blog-card" key={post.id}>
              <Link className="blog-card__image u-pos-rel" href={post.url_path}>
                {src ? (
                  <Image
                    src={src}
                    alt={post.image?.title || post.title}
                    fill
                    sizes="(max-width: 760px) 88vw, (max-width: 1020px) 46vw, 360px"
                    quality={70}
                  />
                ) : null}
              </Link>
              <div>
                <h3>
                  <Link href={post.url_path}>{post.title}</Link>
                </h3>
                <p>{excerptFromHtml(post.body, post.excerpt, 150)}</p>
              </div>
            </article>
          );
        })}
      </div>
    </Section>
  );
}