import Image from "next/image";

const ILLUSTRATION_SIZE = {
  sm: { width: 42, height: 42 },
  md: { width: 62, height: 72 },
} as const;

type IllustrationSize = keyof typeof ILLUSTRATION_SIZE;

export function IllustrationIcon({
  src,
  alt = "",
  size = "sm",
  className,
}: {
  src: string;
  alt?: string;
  size?: IllustrationSize;
  className?: string;
}) {
  const dimensions = ILLUSTRATION_SIZE[size];

  return (
    <Image
      className={className}
      src={src}
      alt={alt}
      width={dimensions.width}
      height={dimensions.height}
      loading="lazy"
    />
  );
}