import { Section } from "@/components/layout/Section";
import { stripHtml } from "@/lib/format";
import { normalizeImportedBody } from "./importedHtml";

type SeoContentVariant = "legacy" | "article";

type SeoContentProps = {
  title?: string | null;
  html?: string | null;
  wide?: boolean;
  variant?: SeoContentVariant;
  className?: string;
};

export function SeoContent({
  title,
  html,
  wide = false,
  variant = "legacy",
  className,
}: SeoContentProps) {
  if (!stripHtml(html)) return null;

  const normalizedHtml = normalizeImportedBody(html || "");

  if (variant === "article") {
    const sectionClassName = ["section", "section--seo-enhanced", "section--seo-article", className]
      .filter(Boolean)
      .join(" ");

    return (
      <Section className={sectionClassName}>
        <div className={wide ? "container seo-enhanced seo-enhanced--wide" : "container seo-enhanced"}>
          <article className="seo-enhanced__card seo-article__card" aria-label="SEO статья страницы">
            <div className="seo-enhanced__main seo-article__main">
              {title ? (
                <header className="seo-enhanced__head seo-article__head">
                  <h2>{title}</h2>
                </header>
              ) : null}

              <div className="content seo-enhanced__body seo-article__body" dangerouslySetInnerHTML={{ __html: normalizedHtml }} />
            </div>
          </article>
        </div>
      </Section>
    );
  }

  return (
    <Section>
      <div className={wide ? "container content content--wide" : "container content"}>
        {title ? <h2>{title}</h2> : null}
        <div dangerouslySetInnerHTML={{ __html: normalizedHtml }} />
      </div>
    </Section>
  );
}