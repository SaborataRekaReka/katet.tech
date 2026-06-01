"use client";

import { Children, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  optionMatchCount,
  type FilterOption,
  type SelectedFilters,
} from "@/components/equipment/equipmentFilters";
import { SlidersIcon } from "@/components/ui/icons";
import { Select } from "@/components/ui/Select";
import type { EquipmentCardRecord } from "@/lib/content";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const FALLBACK_QUICK_FILTER_MIN_WIDTH = 172;
const FALLBACK_QUICK_FILTER_GAP = 8;
const QUICK_FILTER_STRETCH_MAX_WIDTH = 260;

export function EquipmentSpecsFilters({
  filters,
  items,
  selectedFilters,
  onChange,
  onReset,
  expanded,
  onExpandedChange,
  quickLimit,
  resetLabel = "Сбросить все",
  className,
  children,
}: {
  filters: FilterOption[];
  items: EquipmentCardRecord[];
  selectedFilters: SelectedFilters;
  onChange: (key: string, value: string) => void;
  onReset: () => void;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  quickLimit?: number;
  resetLabel?: string;
  className?: string;
  children?: ReactNode;
}) {
  const rootRef = useRef<HTMLElement | null>(null);
  const quickRef = useRef<HTMLDivElement | null>(null);
  const actionsRef = useRef<HTMLDivElement | null>(null);
  const [autoQuickLimit, setAutoQuickLimit] = useState(() => (typeof quickLimit === "number" ? quickLimit : 3));

  useEffect(() => {
    if (typeof quickLimit === "number") return;

    const rootEl = rootRef.current;
    const quickEl = quickRef.current;
    const actionsEl = actionsRef.current;

    if (!rootEl || !quickEl) return;

    const recalcQuickLimit = () => {
      const computed = getComputedStyle(rootEl);
      const filterMinWidth = parseFloat(computed.getPropertyValue("--smart-filter-min-width")) || FALLBACK_QUICK_FILTER_MIN_WIDTH;
      const filterGap = parseFloat(computed.getPropertyValue("--smart-filter-gap")) || FALLBACK_QUICK_FILTER_GAP;
      const rootWidth = rootEl.clientWidth;
      const actionsWidth = actionsEl?.offsetWidth ?? 0;
      const actionsBelowQuick = actionsEl ? actionsEl.offsetTop > quickEl.offsetTop + 2 : false;
      const availableWidth = Math.max(actionsBelowQuick ? rootWidth : rootWidth - actionsWidth - filterGap, filterMinWidth);
      const fitCount = Math.max(1, Math.floor((availableWidth + filterGap) / (filterMinWidth + filterGap)));
      setAutoQuickLimit((current) => (current === fitCount ? current : fitCount));
    };

    recalcQuickLimit();

    const resizeObserver = new ResizeObserver(recalcQuickLimit);
    resizeObserver.observe(rootEl);
    resizeObserver.observe(quickEl);
    if (actionsEl) resizeObserver.observe(actionsEl);

    return () => resizeObserver.disconnect();
  }, [quickLimit, filters.length]);

  const resolvedQuickLimit = typeof quickLimit === "number" ? quickLimit : autoQuickLimit;
  const quickFilters = filters.slice(0, Math.max(1, resolvedQuickLimit));
  const hasExtraFilters = filters.length > quickFilters.length;
  const isShowingAllFilters = expanded && hasExtraFilters;
  const visibleFilters = isShowingAllFilters ? filters : quickFilters;
  const hasExtraContent = Children.count(children) > 0;
  const shouldStretchQuickFilters = !isShowingAllFilters && visibleFilters.length > 2;
  const quickGridStyle = {
    "--smart-filter-visible": String(Math.max(1, isShowingAllFilters ? resolvedQuickLimit : visibleFilters.length)),
    "--smart-filter-grid-max-width": `${
      Math.max(1, visibleFilters.length) * QUICK_FILTER_STRETCH_MAX_WIDTH +
      Math.max(0, visibleFilters.length - 1) * FALLBACK_QUICK_FILTER_GAP
    }px`,
  } as CSSProperties;

  return (
    <section className={cx("smart-catalog-specs", className)} aria-label="Фильтры характеристик" ref={rootRef}>
      <div
        className={cx(
          "smart-catalog-specs__quick",
          shouldStretchQuickFilters && "smart-catalog-specs__quick--stretch",
          isShowingAllFilters && "smart-catalog-specs__quick--expanded",
        )}
        aria-label="Быстрые фильтры характеристик"
        ref={quickRef}
        style={quickGridStyle}
      >
        {visibleFilters.map((filter) => (
          <label className="archive-filterbar__field" key={filter.key}>
            <span>{filter.label}</span>
            <Select
              value={selectedFilters[filter.key] || ""}
              onChange={(value) => onChange(filter.key, value)}
              options={[
                { value: "", label: "Все значения" },
                ...filter.options.map((option) => {
                  const count = optionMatchCount(items, selectedFilters, filter.key, option);
                  return {
                    value: option,
                    label: count ? `${option} (${count})` : option,
                    disabled: !count && selectedFilters[filter.key] !== option,
                  };
                }),
              ]}
            />
          </label>
        ))}
      </div>

      <div className="smart-catalog-specs__actions" aria-label="Действия фильтров" ref={actionsRef}>
        {hasExtraFilters ? (
          <button
            className={`smart-catalog-specs__open-all${expanded ? " is-active" : ""}`}
            type="button"
            onClick={() => onExpandedChange(!expanded)}
            aria-expanded={expanded}
          >
            <SlidersIcon className="smart-catalog-specs__open-all-icon" aria-hidden="true" />
            <span>Фильтры</span>
          </button>
        ) : null}

        <button
          className="smart-catalog-specs__reset-link smart-catalog-specs__reset-link--inline"
          type="button"
          onClick={() => {
            onExpandedChange(false);
            onReset();
          }}
        >
          {resetLabel}
        </button>
      </div>

      {expanded && hasExtraContent ? (
        <div className="smart-catalog-specs__extra-row" aria-label="Выбранные фильтры">
          {children}
        </div>
      ) : null}
    </section>
  );
}