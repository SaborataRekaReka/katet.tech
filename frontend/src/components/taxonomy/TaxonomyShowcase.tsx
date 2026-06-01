import Image from "next/image";
import Link from "next/link";
import type { TaxonomyPageRecord } from "@/lib/content";
import { assetUrl } from "@/lib/format";
import { Section, SectionHeader } from "@/components/layout/Section";

export function TaxonomyShowcase({ title, items }: { title: string; items: TaxonomyPageRecord[] }) {
  if (!items.length) return null;

  return (
    <Section className="section section--muted">
      <SectionHeader eyebrow="Разделы" title={title} />
      <div className="container taxonomy-grid">
        {items.map((item) => {
          const src = assetUrl(item.image);
          return (
            <Link className="taxonomy-card" href={item.url_path} key={item.id}>
              <span className="taxonomy-card__image u-pos-rel">
                {src ? (
                  <Image
                    src={src}
                    alt={item.image?.title || item.name}
                    fill
                    sizes="(max-width: 760px) 88vw, (max-width: 1020px) 46vw, (max-width: 1440px) 24vw, 320px"
                    quality={68}
                  />
                ) : null}
              </span>
              <span className="taxonomy-card__title">{item.name}</span>
              {item.meta_description ? <span>{item.meta_description}</span> : null}
            </Link>
          );
        })}
      </div>
    </Section>
  );
}