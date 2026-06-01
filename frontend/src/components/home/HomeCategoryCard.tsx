import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";

type HomeCategoryImageTuning = {
  scale?: number;
  x?: number;
  y?: number;
};

type HomeCategoryCardProps = {
  availability: string;
  title: string;
  description: string;
  image: string;
  href: string;
  imageTuning?: HomeCategoryImageTuning;
};

export function HomeCategoryCard({ availability, title, description, image, href, imageTuning }: HomeCategoryCardProps) {
  const imageStyle = {
    "--home-category-image-scale": String(imageTuning?.scale ?? 1),
    "--home-category-image-shift-x": `${imageTuning?.x ?? 0}px`,
    "--home-category-image-shift-y": `${imageTuning?.y ?? 0}px`,
  } as CSSProperties;

  return (
    <article className="home-category-card">
      <Link className="home-category-card__link" href={href}>
        <span className="home-category-card__badge">
          <span className="home-category-card__dot" aria-hidden="true" />
          {availability}
        </span>
        <h3>{title}</h3>
        {description ? <p>{description}</p> : <p aria-hidden="true">&nbsp;</p>}
        <div className="home-category-card__image u-pos-rel" style={imageStyle}>
          <Image
            src={image}
            alt={title}
            fill
            sizes="(max-width: 760px) 83vw, (max-width: 1020px) 46vw, (max-width: 1440px) 23vw, 320px"
            quality={65}
          />
        </div>
      </Link>
    </article>
  );
}