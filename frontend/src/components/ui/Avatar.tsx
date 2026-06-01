import Image from "next/image";

export function Avatar({
  src,
  alt,
  fallback,
  className = "avatar",
  sizes = "64px",
}: {
  src?: string | null;
  alt: string;
  fallback: string;
  className?: string;
  sizes?: string;
}) {
  return (
    <span className={`${className} u-pos-rel`}>
      {src ? <Image src={src} alt={alt} fill sizes={sizes} /> : fallback}
    </span>
  );
}