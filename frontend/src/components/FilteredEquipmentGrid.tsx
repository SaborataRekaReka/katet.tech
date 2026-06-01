"use client";

import { Fragment, useMemo, useState } from "react";
import { ConsultationCard } from "@/components/equipment/ConsultationCard";
import { EquipmentCard, type EquipmentCardVariant } from "@/components/equipment/EquipmentCard";
import { EquipmentSpecsFilters } from "@/components/equipment/EquipmentSpecsFilters";
import {
  buildFilters,
  filtersFromUrl,
  itemMatchesFilters,
  writeFiltersToUrl,
  type SelectedFilters,
} from "@/components/equipment/equipmentFilters";
import { Section, SectionHeader } from "@/components/layout/Section";
import type { EquipmentCardRecord } from "@/lib/content";

function collectFilterKeys(items: EquipmentCardRecord[]) {
  const keys = new Set<string>();

  for (const item of items) {
    for (const spec of item.specs || []) {
      if (spec.key && spec.value) keys.add(spec.key);
    }
  }

  return Array.from(keys).sort((left, right) => left.localeCompare(right, "ru-RU"));
}

export function FilteredEquipmentGrid({
  title,
  items,
  home = false,
  variant = "default",
  showEyebrow = true,
  filterKeys,
  consultationAfter,
}: {
  title: string;
  items: EquipmentCardRecord[];
  home?: boolean;
  variant?: EquipmentCardVariant;
  showEyebrow?: boolean;
  filterKeys?: string[] | null;
  consultationAfter?: number;
}) {
  const allowedFilterKeys = useMemo(() => (filterKeys?.length ? filterKeys : collectFilterKeys(items)), [filterKeys, items]);
  const [selectedFilters, setSelectedFilters] = useState<SelectedFilters>(() => filtersFromUrl(allowedFilterKeys));
  const [allFiltersOpen, setAllFiltersOpen] = useState(false);
  const filters = useMemo(() => buildFilters(items, allowedFilterKeys), [items, allowedFilterKeys]);
  const filteredItems = useMemo(() => items.filter((item) => itemMatchesFilters(item, selectedFilters)), [items, selectedFilters]);

  function updateFilter(key: string, value: string) {
    setSelectedFilters((currentFilters) => {
      const nextFilters = { ...currentFilters };
      if (value) nextFilters[key] = value;
      else delete nextFilters[key];
      writeFiltersToUrl(nextFilters, allowedFilterKeys);
      return nextFilters;
    });
  }

  function resetFilters() {
    setAllFiltersOpen(false);
    setSelectedFilters({});
    writeFiltersToUrl({}, allowedFilterKeys);
  }

  return (
    <Section className={home ? "section section--fleet" : "section section--catalog"}>
      <SectionHeader eyebrow={showEyebrow ? "Каталог" : undefined} title={title} />
      {filters.length ? (
        <div className="container">
          <EquipmentSpecsFilters
            className="archive-specs-filters"
            filters={filters}
            items={items}
            selectedFilters={selectedFilters}
            onChange={updateFilter}
            onReset={resetFilters}
            expanded={allFiltersOpen}
            onExpandedChange={setAllFiltersOpen}
          />
        </div>
      ) : null}
      {filteredItems.length ? (
        <div className={home ? "container equipment-grid equipment-grid--home" : "container equipment-grid"}>
          {filteredItems.map((item, index) => (
            <Fragment key={item.id}>
              <EquipmentCard item={item} variant={variant} />
              {consultationAfter === index + 1 ? <ConsultationCard /> : null}
            </Fragment>
          ))}
        </div>
      ) : (
        <div className="container archive-filterbar__empty">По выбранным параметрам техника не найдена.</div>
      )}
    </Section>
  );
}
