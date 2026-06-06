import type { ReviewRecord } from "@/lib/content";
import { toDirectusVisualAttr } from "@/lib/directusVisual";
import { assetUrl, excerptFromHtml, rewriteWordPressHtml } from "@/lib/format";
import { HeroLead } from "@/components/marketing/HeroLead";
import { Section } from "@/components/layout/Section";
import { ActionLink } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";

export function ReviewPageView({ review }: { review: ReviewRecord }) {
  const src = assetUrl(review.photo || review.image);
  const title = review.reviewer_name || review.title;
  const lead = excerptFromHtml(review.body, null, 220);
  const rootDirectus = toDirectusVisualAttr({
    collection: "reviews",
    item: review.id,
    fields: ["title", "reviewer_name", "body", "photo_file_id", "featured_file_id", "source_url"],
    mode: "drawer",
  });
  const titleDirectus = toDirectusVisualAttr({ collection: "reviews", item: review.id, fields: ["title", "reviewer_name"], mode: "popover" });
  const bodyDirectus = toDirectusVisualAttr({ collection: "reviews", item: review.id, fields: "body", mode: "modal" });

  return (
    <div className="archive-landing global-catalog-landing dispatcher-header-page review-page-template">
      <HeroLead
        eyebrow="Отзывы"
        title={title}
        description={lead}
        imageSrc="/assets/katet/archive/archive-hero-crane.jpg"
        layout="mainLike"
        rootDataDirectus={rootDirectus}
        titleDataDirectus={titleDirectus}
        descriptionDataDirectus={bodyDirectus}
      />
      <Section className="section review-page" data-directus={rootDirectus}>
        <div className="container review-detail">
          <Avatar src={src} alt={review.title} fallback={review.title.slice(0, 1)} className="avatar avatar--large" sizes="120px" />
          <div>
            <p className="eyebrow">Отзыв</p>
            <h2 className="review-detail__title" data-directus={titleDirectus}>{title}</h2>
            <div className="content" data-directus={bodyDirectus} dangerouslySetInnerHTML={{ __html: rewriteWordPressHtml(review.body) }} />
            {review.source_url ? (
              <ActionLink href={review.source_url} target="_blank" rel="noreferrer" variant="outline" data-directus={rootDirectus}>
                Источник
              </ActionLink>
            ) : null}
          </div>
        </div>
      </Section>
    </div>
  );
}