import type { HTMLAttributes, ReactNode } from "react";

type SectionProps = HTMLAttributes<HTMLElement> & {
  className?: string;
  children: ReactNode;
};

export function Section({ className = "section", children, ...props }: SectionProps) {
  return <section className={className} {...props}>{children}</section>;
}

export function SectionHeader({
  className = "container section__head",
  eyebrow,
  title,
  description,
  children,
}: {
  className?: string;
  eyebrow?: string;
  title: string;
  description?: string | null;
  children?: ReactNode;
}) {
  return (
    <div className={className}>
      {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
      {children}
    </div>
  );
}