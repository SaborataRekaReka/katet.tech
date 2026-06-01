import type { HTMLAttributes, ReactNode } from "react";

export type BadgeTone = "neutral" | "success" | "promo" | "warning";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function Badge({
  className,
  tone = "neutral",
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { children: ReactNode; tone?: BadgeTone }) {
  return (
    <span className={cx("badge", `badge--${tone}`, className)} {...props}>
      {children}
    </span>
  );
}