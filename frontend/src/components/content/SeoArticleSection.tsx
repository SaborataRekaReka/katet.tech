import { SeoContentEnhanced } from "./SeoContentEnhanced";
import { SeoContent } from "./SeoContent";

type SeoArticleSectionVariant = "enhanced" | "plain";

type SeoArticleSectionProps = {
  title?: string | null;
  html?: string | null;
  wide?: boolean;
  variant?: SeoArticleSectionVariant;
  className?: string;
  showFacts?: boolean;
};

export function SeoArticleSection({
  title,
  html,
  wide = false,
  variant = "enhanced",
  className,
  showFacts = true,
}: SeoArticleSectionProps) {
  if (variant === "enhanced") {
    return <SeoContentEnhanced title={title} html={html} wide={wide} className={className} showFacts={showFacts} />;
  }

  return <SeoContent title={title} html={html} wide={wide} variant="article" className={className} />;
}