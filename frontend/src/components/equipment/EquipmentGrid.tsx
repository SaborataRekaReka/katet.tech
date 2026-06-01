import { Fragment } from "react";
import type { EquipmentCardRecord } from "@/lib/content";
import { FilteredEquipmentGrid } from "@/components/FilteredEquipmentGrid";
import { ConsultationCard } from "./ConsultationCard";
import { EquipmentCard } from "./EquipmentCard";
import { Section, SectionHeader } from "@/components/layout/Section";

export function EquipmentGrid({
  title,
  items,
  home = false,
  variant = "archive",
  showEyebrow = true,
  showFilters = false,
  filterKeys,
  consultationAfter,
}: {
  title: string;
  items: EquipmentCardRecord[];
  home?: boolean;
  variant?: "default" | "archive";
  showEyebrow?: boolean;
  showFilters?: boolean;
  filterKeys?: string[] | null;
  consultationAfter?: number;
}) {
  if (!items.length) return null;

  if (showFilters) {
    return (
      <FilteredEquipmentGrid
        title={title}
        items={items}
        home={home}
        variant={variant}
        showEyebrow={showEyebrow}
        filterKeys={filterKeys}
        consultationAfter={consultationAfter}
      />
    );
  }

  return (
    <Section className={home ? "section section--fleet" : "section section--catalog"}>
      <SectionHeader eyebrow={showEyebrow ? "Каталог" : undefined} title={title} />
      <div className={home ? "container equipment-grid equipment-grid--home" : "container equipment-grid"}>
        {items.map((item, index) => (
          <Fragment key={item.id}>
            <EquipmentCard item={item} variant={variant} />
            {consultationAfter === index + 1 ? <ConsultationCard /> : null}
          </Fragment>
        ))}
      </div>
    </Section>
  );
}