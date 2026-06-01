"use client";

import { Children, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/ui/icons";

type CarouselBreakpoints = {
  default: number;
  widescreen?: number;
  tablet?: number;
  mobile?: number;
};

type CarouselProps = {
  children: ReactNode;
  ariaLabel: string;
  className?: string;
  viewportClassName?: string;
  trackClassName?: string;
  slideClassName?: string;
  prevAriaLabel?: string;
  nextAriaLabel?: string;
  gap?: number;
  breakpoints?: CarouselBreakpoints;
  showDots?: boolean;
  dotsClassName?: string;
};

const DEFAULT_BREAKPOINTS: CarouselBreakpoints = {
  default: 4,
  widescreen: 3,
  tablet: 2,
  mobile: 1,
};

function joinClassNames(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(" ");
}

function resolveSlidesPerView(width: number, breakpoints: CarouselBreakpoints) {
  if (width <= 700) return Math.max(1, breakpoints.mobile ?? 1);
  if (width <= 1020) return Math.max(1, breakpoints.tablet ?? 2);
  if (width <= 1366) return Math.max(1, breakpoints.widescreen ?? breakpoints.default);
  return Math.max(1, breakpoints.default);
}

export function Carousel({
  children,
  ariaLabel,
  className,
  viewportClassName,
  trackClassName,
  slideClassName,
  prevAriaLabel = "Previous slide",
  nextAriaLabel = "Next slide",
  gap = 10,
  breakpoints = DEFAULT_BREAKPOINTS,
  showDots = false,
  dotsClassName,
}: CarouselProps) {
  const slides = useMemo(() => Children.toArray(children), [children]);
  const [visibleSlides, setVisibleSlides] = useState(Math.max(1, breakpoints.default));
  const [activeSlide, setActiveSlide] = useState(0);

  const maxSlide = Math.max(0, slides.length - visibleSlides);
  const currentSlide = Math.max(0, Math.min(activeSlide, maxSlide));
  const canGoPrev = currentSlide > 0;
  const canGoNext = currentSlide < maxSlide;

  useEffect(() => {
    const handleResize = () => {
      setVisibleSlides(resolveSlidesPerView(window.innerWidth, breakpoints));
    };

    handleResize();
    window.addEventListener("resize", handleResize);

    return () => window.removeEventListener("resize", handleResize);
  }, [breakpoints]);

  const trackStyle = useMemo(
    () =>
      ({
        "--carousel-visible": visibleSlides,
        "--carousel-index": currentSlide,
        "--carousel-gap": `${gap}px`,
      } as CSSProperties),
    [currentSlide, gap, visibleSlides],
  );

  return (
    <div className={joinClassNames("ui-carousel", className)}>
      {maxSlide > 0 ? (
        <button
          type="button"
          className="ui-carousel__arrow ui-carousel__arrow--prev"
          onClick={() => setActiveSlide((slide) => Math.max(0, Math.min(maxSlide, slide - 1)))}
          disabled={!canGoPrev}
          aria-label={prevAriaLabel}
        >
          <ChevronLeftIcon aria-hidden="true" />
        </button>
      ) : null}

      <div className={joinClassNames("ui-carousel__viewport", viewportClassName)} role="region" aria-roledescription="carousel" aria-label={ariaLabel}>
        <div className={joinClassNames("ui-carousel__track", trackClassName)} style={trackStyle}>
          {slides.map((slide, index) => (
            <div className={joinClassNames("ui-carousel__slide", slideClassName)} key={index}>
              {slide}
            </div>
          ))}
        </div>
      </div>

      {maxSlide > 0 ? (
        <button
          type="button"
          className="ui-carousel__arrow ui-carousel__arrow--next"
          onClick={() => setActiveSlide((slide) => Math.max(0, Math.min(maxSlide, slide + 1)))}
          disabled={!canGoNext}
          aria-label={nextAriaLabel}
        >
          <ChevronRightIcon aria-hidden="true" />
        </button>
      ) : null}

      {showDots && maxSlide > 0 ? (
        <div className={joinClassNames("ui-carousel__dots", dotsClassName)} aria-label={`${ariaLabel}: пагинация`}>
          {Array.from({ length: maxSlide + 1 }, (_, index) => {
            const isActive = index === currentSlide;

            return (
              <button
                key={index}
                type="button"
                className={joinClassNames("ui-carousel__dot", isActive ? "is-active" : undefined)}
                onClick={() => setActiveSlide(index)}
                aria-label={`Перейти к слайду ${index + 1}`}
                aria-current={isActive ? "true" : undefined}
              />
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
