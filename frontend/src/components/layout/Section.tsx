import type { ReactNode } from "react";

export function Section({ className = "section", children }: { className?: string; children: ReactNode }) {
  return <section className={className}>{children}</section>;
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