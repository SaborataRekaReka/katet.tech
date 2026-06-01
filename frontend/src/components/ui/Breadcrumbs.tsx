import Link from "next/link";
import { ChevronRightIcon, HomeIcon } from "@/components/ui/icons";

export type BreadcrumbItem = {
  label: string;
  href?: string | null;
};

type BreadcrumbsProps = {
  items: BreadcrumbItem[];
  className?: string;
  ariaLabel?: string;
};

export function Breadcrumbs({ items, className, ariaLabel = "Хлебные крошки" }: BreadcrumbsProps) {
  const visibleItems = items
    .map((item) => ({ ...item, label: item.label.trim() }))
    .filter((item) => item.label.length > 0);

  if (!visibleItems.length) return null;

  return (
    <nav className={`breadcrumbs${className ? ` ${className}` : ""}`} aria-label={ariaLabel}>
      <ol>
        {visibleItems.map((item, index) => {
          const isFirst = index === 0;
          const isLast = index === visibleItems.length - 1;
          const content = (
            <>
              {isFirst ? <HomeIcon className="breadcrumbs__home-icon" aria-hidden="true" focusable="false" /> : null}
              <span>{item.label}</span>
            </>
          );

          return (
            <li key={`${item.label}-${index}`}>
              {item.href && !isLast ? (
                <Link href={item.href}>{content}</Link>
              ) : (
                <span className="breadcrumbs__current" aria-current={isLast ? "page" : undefined}>{content}</span>
              )}
              {!isLast ? <ChevronRightIcon className="breadcrumbs__separator" aria-hidden="true" focusable="false" /> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}