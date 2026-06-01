import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "accent" | "outline" | "light" | "neutral";
export type ButtonSize = "sm" | "md" | "lg";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function buttonClassName(variant: ButtonVariant | null = "accent", className?: string) {
  if (variant === null) return className;

  const classes = className?.split(/\s+/).filter(Boolean) ?? [];
  const hasBase = classes.includes("button");
  const variantClass = `button--${variant}`;
  const hasVariant = classes.includes(variantClass);

  return cx(!hasBase && "button", !hasVariant && variantClass, className);
}

export function buttonSizeClassName(size: ButtonSize = "md", className?: string) {
  const classes = className?.split(/\s+/).filter(Boolean) ?? [];
  const hasSize = classes.some((value) => value.startsWith("button--size-"));
  return cx(!hasSize && `button--size-${size}`, className);
}

export function Button({
  variant = "accent",
  size = "md",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant | null; size?: ButtonSize }) {
  const sizedClassName = buttonSizeClassName(size, className);
  return <button className={buttonClassName(variant, sizedClassName)} type={type} {...props} />;
}

export function ActionLink({
  href,
  variant = "accent",
  size = "md",
  className,
  children,
  ...props
}: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string;
  variant?: ButtonVariant | null;
  size?: ButtonSize;
  children: ReactNode;
}) {
  const sizedClassName = buttonSizeClassName(size, className);
  const resolvedClassName = buttonClassName(variant, sizedClassName);
  const isRoutable = href.startsWith("/") && !href.startsWith("//");

  if (isRoutable) {
    return (
      <Link className={resolvedClassName} href={href} {...props}>
        {children}
      </Link>
    );
  }

  return (
    <a className={resolvedClassName} href={href} {...props}>
      {children}
    </a>
  );
}