"use client";

import { useEffect, useMemo, useState } from "react";

type SeoContentTocItem = {
  id: string;
  text: string;
  level: 2 | 3;
};

const ACTIVE_LINE_OFFSET = 124;

export function SeoContentToc({ items }: { items: SeoContentTocItem[] }) {
  const [activeId, setActiveId] = useState(items[0]?.id ?? "");
  const ids = useMemo(() => items.map((item) => item.id), [items]);
  const currentActiveId = ids.includes(activeId) ? activeId : ids[0] ?? "";

  useEffect(() => {
    if (!ids.length) return;

    const headings = ids
      .map((id) => document.getElementById(id))
      .filter((node): node is HTMLElement => Boolean(node));

    if (!headings.length) return;

    const updateByScroll = () => {
      let nextActive = headings[0].id;

      for (const heading of headings) {
        if (heading.getBoundingClientRect().top <= ACTIVE_LINE_OFFSET) {
          nextActive = heading.id;
          continue;
        }

        break;
      }

      setActiveId((current) => (current === nextActive ? current : nextActive));
    };

    const updateByHash = () => {
      const hashRaw = window.location.hash.replace(/^#/, "");
      if (!hashRaw) return;

      let hash = hashRaw;
      try {
        hash = decodeURIComponent(hashRaw);
      } catch {
        hash = hashRaw;
      }

      if (ids.includes(hash)) {
        setActiveId(hash);
      }
    };

    const frame = window.requestAnimationFrame(() => {
      updateByHash();
      updateByScroll();
    });

    window.addEventListener("scroll", updateByScroll, { passive: true });
    window.addEventListener("resize", updateByScroll);
    window.addEventListener("hashchange", updateByHash);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", updateByScroll);
      window.removeEventListener("resize", updateByScroll);
      window.removeEventListener("hashchange", updateByHash);
    };
  }, [ids]);

  return (
    <nav className="seo-enhanced__toc" aria-label="Оглавление раздела">
      <p className="seo-enhanced__toc-title">Содержание</p>
      {items.map((item) => {
        const isActive = currentActiveId === item.id;
        const className = [
          "seo-enhanced__toc-link",
          item.level === 3 ? "seo-enhanced__toc-link--sub" : "",
          isActive ? "is-active" : "",
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <a
            className={className}
            href={`#${item.id}`}
            key={item.id}
            aria-current={isActive ? "true" : undefined}
          >
            {item.text}
          </a>
        );
      })}
    </nav>
  );
}