import Image from "next/image";
import Link from "next/link";
import type { NavLink } from "@/lib/content";
import {
  workTypeIllustrationByUrlPath,
} from "@/lib/workTypeIllustrations";
import { HeroLead } from "@/components/marketing/HeroLead";
import { Section } from "@/components/layout/Section";

function resolveWorkTypeIllustration(link: NavLink) {
  return workTypeIllustrationByUrlPath(link.url_path);
}

export function DirectoryPage({
  title,
  description,
  links,
  showIllustrations = false,
}: {
  title: string;
  description: string;
  links: NavLink[];
  showIllustrations?: boolean;
}) {
  return (
    <div className="archive-landing global-catalog-landing dispatcher-header-page">
      <HeroLead
        eyebrow="Каталог"
        title={title}
        description={description}
        imageSrc="/assets/katet/home/hero-construction-site.jpg"
        layout="mainLike"
      />
      <Section>
        <div className="container directory-grid">
          {links.map((link) => {
            const imageSrc = showIllustrations ? resolveWorkTypeIllustration(link) : null;

            return (
              <Link
                key={link.url_path}
                className={showIllustrations ? "directory-link directory-link--illustrated" : "directory-link"}
                href={link.url_path}
              >
                {showIllustrations ? (
                  <span className="directory-link__image u-pos-rel" aria-hidden="true">
                    {imageSrc ? <Image src={imageSrc} alt="" fill sizes="(max-width: 760px) 92vw, (max-width: 1020px) 45vw, 30vw" quality={95} /> : null}
                  </span>
                ) : null}
                <strong>{link.name}</strong>
                {typeof link.item_count === "number" ? <span>{link.item_count} позиций</span> : null}
              </Link>
            );
          })}
        </div>
      </Section>
    </div>
  );
}