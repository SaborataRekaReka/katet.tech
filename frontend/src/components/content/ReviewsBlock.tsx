import Link from "next/link";
import type { ReviewRecord } from "@/lib/content";
import { toDirectusVisualAttr } from "@/lib/directusVisual";
import { assetUrl, excerptFromHtml } from "@/lib/format";
import { Section, SectionHeader } from "@/components/layout/Section";
import { Avatar } from "@/components/ui/Avatar";
import { ActionLink } from "@/components/ui/Button";
import { Carousel } from "@/components/ui/Carousel";

export function ReviewsBlock({ reviews }: { reviews: ReviewRecord[] }) {
  if (!reviews.length) return null;

  return (
    <Section className="section section--reviews">
      <SectionHeader
        className="container section__head section__head--reviews"
        title="Отзывы о нас"
        description="Оставьте отзыв на Яндекс.Картах или Google — и получите скидку на следующий заказ!"
      >
        <ActionLink
          href="https://yandex.com/maps/org/katet/58900577181/reviews/?ll=37.753793%2C55.892375&z=16"
          variant="outline"
          size="lg"
          target="_blank"
          rel="noopener noreferrer"
        >
          Перейти в Яндекс.Карты
        </ActionLink>
      </SectionHeader>
      <Carousel
        className="container reviews-carousel"
        ariaLabel="Отзывы клиентов"
        prevAriaLabel="Предыдущий отзыв"
        nextAriaLabel="Следующий отзыв"
        breakpoints={{ default: 4, widescreen: 3, tablet: 2, mobile: 1 }}
        gap={10}
      >
        {reviews.map((review) => {
          const src = assetUrl(review.photo || review.image);
          const rootDirectus = toDirectusVisualAttr({
            collection: "reviews",
            item: review.id,
            fields: ["title", "reviewer_name", "body", "photo_file_id", "featured_file_id"],
            mode: "drawer",
          });
          const titleDirectus = toDirectusVisualAttr({ collection: "reviews", item: review.id, fields: ["title", "reviewer_name"], mode: "popover" });
          const bodyDirectus = toDirectusVisualAttr({ collection: "reviews", item: review.id, fields: "body", mode: "modal" });

          return (
            <article className="review-card" key={review.id} data-directus={rootDirectus}>
              <div className="review-card__top">
                <Avatar src={src} alt={review.title} fallback={review.title.slice(0, 1)} />
                <div>
                  <h3 data-directus={titleDirectus}>{review.reviewer_name || review.title}</h3>
                  <p>Яндекс Карты</p>
                </div>
              </div>
              <p data-directus={bodyDirectus}>{excerptFromHtml(review.body, null, 220)}</p>
              <Link href={review.url_path} data-directus={rootDirectus}>Читать отзыв</Link>
            </article>
          );
        })}
      </Carousel>
    </Section>
  );
}