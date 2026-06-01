import { notFound } from "next/navigation";
import { ReviewPageView } from "@/components/ContentViews";
import { getReviewBySlug } from "@/lib/content";
import { metadataFrom } from "@/lib/format";

type Props = { params: Promise<{ slug: string }> };

export const revalidate = 300;

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const review = await getReviewBySlug(slug);
  return metadataFrom(review, "Отзыв — Катет");
}

export default async function ReviewRoute({ params }: Props) {
  const { slug } = await params;
  const review = await getReviewBySlug(slug);

  if (!review) notFound();

  return <ReviewPageView review={review} />;
}