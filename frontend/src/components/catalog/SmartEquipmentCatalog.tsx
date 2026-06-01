"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { EquipmentCard } from "@/components/equipment/EquipmentCard";
import { EquipmentSpecsFilters } from "@/components/equipment/EquipmentSpecsFilters";
import {
  buildFilters,
  itemMatchesFilters,
  type SelectedFilters,
} from "@/components/equipment/equipmentFilters";
import { Section } from "@/components/layout/Section";
import { Input } from "@/components/ui/Input";
import { CheckIcon, ChevronDownIcon, CloseIcon, SearchIcon } from "@/components/ui/icons";
import { Select } from "@/components/ui/Select";
import type { EquipmentCardRecord, NavLink, TaxonomyPageRecord } from "@/lib/content";
import { assetUrl } from "@/lib/format";

type EquipmentCategory = Pick<TaxonomyPageRecord, "slug" | "name" | "url_path" | "filter_keys"> & {
  count: number;
};

type WorkTypeOption = {
  slug: string;
  name: string;
  url_path: string | null;
  count: number;
};

type ParsedDimension = {
  unit: "ton" | "meter";
  value: number;
};

const CATEGORY_FAMILY_RULES: Array<{ key: string; pattern: RegExp }> = [
  { key: "excavator-loader", pattern: /экскаватор\s*[- ]\s*погрузчик|экскаватора\s*[- ]\s*погрузчика/u },
  { key: "autocrane", pattern: /автокран/u },
  { key: "aerial", pattern: /автовыш/u },
  { key: "excavator", pattern: /экскаватор/u },
  { key: "manipulator", pattern: /манипулятор/u },
  { key: "roller", pattern: /катк/u },
  { key: "lift", pattern: /подъемник|подъёмник/u },
  { key: "dump", pattern: /самосвал/u },
  { key: "trawl", pattern: /трал/u },
  { key: "bulldozer", pattern: /бульдозер/u },
  { key: "compressor", pattern: /компрессор/u },
  { key: "flatbed", pattern: /длинномер/u },
  { key: "mini-loader", pattern: /мини\s*[- ]\s*погрузчик/u },
];

const CATEGORY_NARROW_HINT =
  /\d|для\b|\bс\b|в москве|в раменском|в аренду|вездеход|гидромолот|копк|транше|карьер|снег|длиннорук|колесн|гусенич|мини|телескопическ|ножничн|коленчат/u;

const ROOT_CATEGORY_LABELS_BY_FAMILY: Record<string, string> = {
  "excavator-loader": "Экскаваторы-погрузчики",
  autocrane: "Автокраны",
  aerial: "Автовышки",
  excavator: "Экскаваторы",
  manipulator: "Манипуляторы",
  roller: "Катки",
  lift: "Подъемники",
  dump: "Самосвалы",
  trawl: "Тралы",
  bulldozer: "Бульдозеры",
  compressor: "Компрессоры",
  flatbed: "Длинномеры",
  "mini-loader": "Мини-погрузчики",
};

const CATEGORY_PARAM = "category";
const WORK_PARAM = "work";
const FILTER_PREFIX = "filter_";
const MAX_ARCHIVE_ROWS = 4;

function archiveGridColumnsForWidth(width: number) {
  if (width <= 700) return 1;
  if (width <= 1020) return 2;
  return 3;
}

function normalizePath(path: string | null | undefined) {
  if (!path) return null;
  const trimmed = path.trim();
  if (!trimmed) return null;
  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}

function slugFromPath(path: string) {
  const clean = path.replace(/^\/+|\/+$/g, "");
  if (!clean) return null;
  const parts = clean.split("/");
  return parts[parts.length - 1] || null;
}

function resolvePathSlug(path: string | null | undefined, slugByPath: Map<string, string>) {
  const normalized = normalizePath(path);
  if (!normalized) return null;
  return slugByPath.get(normalized) || slugFromPath(normalized);
}

function readInitialParam(param: string) {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get(param) || "";
}

function readInitialFilters() {
  if (typeof window === "undefined") return {};

  const params = new URLSearchParams(window.location.search);
  const nextFilters: SelectedFilters = {};

  for (const [key, value] of params.entries()) {
    if (!key.startsWith(FILTER_PREFIX) || !value) continue;
    nextFilters[key.slice(FILTER_PREFIX.length)] = value;
  }

  return nextFilters;
}

function writeSearchState(category: string, workType: string, selectedFilters: SelectedFilters) {
  if (typeof window === "undefined") return;

  const url = new URL(window.location.href);
  for (const key of Array.from(url.searchParams.keys())) {
    if (key === CATEGORY_PARAM || key === WORK_PARAM || key.startsWith(FILTER_PREFIX)) {
      url.searchParams.delete(key);
    }
  }

  if (category) {
    url.searchParams.set(CATEGORY_PARAM, category);
  }

  if (workType) {
    url.searchParams.set(WORK_PARAM, workType);
  }

  for (const [key, value] of Object.entries(selectedFilters)) {
    if (value) {
      url.searchParams.set(`${FILTER_PREFIX}${key}`, value);
    }
  }

  window.history.replaceState(null, "", url);
}

function dedupeFiltersByLabel(filters: ReturnType<typeof buildFilters>) {
  const byLabel = new Map<string, (typeof filters)[number]>();

  for (const filter of filters) {
    const normalizedLabel = filter.label.trim().toLocaleLowerCase("ru-RU");
    const current = byLabel.get(normalizedLabel);

    if (!current || filter.options.length > current.options.length) {
      byLabel.set(normalizedLabel, filter);
    }
  }

  return Array.from(byLabel.values()).sort((left, right) => left.label.localeCompare(right.label, "ru-RU"));
}

function setIncludesAll(parent: Set<string>, child: Set<string>) {
  for (const value of child) {
    if (!parent.has(value)) return false;
  }
  return true;
}

function categoryFamilyKey(name: string) {
  const source = name.toLocaleLowerCase("ru-RU");
  for (const rule of CATEGORY_FAMILY_RULES) {
    if (rule.pattern.test(source)) return rule.key;
  }
  return null;
}

function categorySpecificityScore(name: string) {
  const source = name.toLocaleLowerCase("ru-RU");
  let score = source.length / 120;
  if (/\d/u.test(source)) score += 4;
  if (CATEGORY_NARROW_HINT.test(source)) score += 2;
  if (source.includes("-")) score += 0.5;
  return score;
}

function compactCategoryTitle(name: string) {
  const cleaned = name
    .replace(/^\s*(аренда|услуги)\s+/iu, "")
    .replace(/\s+в\s+москве(?:\s+и\s+области)?\s*$/iu, "")
    .trim();
  if (!cleaned) return name;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function parseDimensionFromCategoryName(value: string): ParsedDimension | null {
  const source = value.toLocaleLowerCase("ru-RU").replaceAll(",", ".");

  const tonMatch = source.match(/(\d+(?:\.\d+)?)\s*(?:тонн|тонны|тонна|т)\b/u);
  if (tonMatch) {
    const parsed = Number(tonMatch[1]);
    if (Number.isFinite(parsed)) {
      return { unit: "ton", value: parsed };
    }
  }

  const meterMatch = source.match(/(\d+(?:\.\d+)?)\s*(?:метр(?:ов|а)?|м)\b/u);
  if (meterMatch) {
    const parsed = Number(meterMatch[1]);
    if (Number.isFinite(parsed)) {
      return { unit: "meter", value: parsed };
    }
  }

  return null;
}

function compactChildCategoryLabel(name: string) {
  return name
    .replace(/^\s*(аренда|услуги)\s+/iu, "")
    .replace(/\s+в\s+москве(?:\s+и\s+области)?\s*$/iu, "")
    .replace(/\s+в\s+аренду\s*$/iu, "")
    .trim();
}

export function SmartEquipmentCatalog({
  items,
  categories,
  workTypes = [],
  showWorkTypeFilter = false,
}: {
  items: EquipmentCardRecord[];
  categories: TaxonomyPageRecord[];
  workTypes?: NavLink[];
  showWorkTypeFilter?: boolean;
}) {
  const categorySlugByPath = useMemo(() => {
    const next = new Map<string, string>();
    for (const category of categories) {
      const normalized = normalizePath(category.url_path);
      if (normalized) {
        next.set(normalized, category.slug);
      }
    }
    return next;
  }, [categories]);

  const workSlugByPath = useMemo(() => {
    if (!showWorkTypeFilter) {
      return new Map<string, string>();
    }

    const next = new Map<string, string>();
    const registerPath = (path: string | null | undefined) => {
      const normalized = normalizePath(path);
      if (!normalized) return;
      const slug = slugFromPath(normalized);
      if (!slug) return;
      next.set(normalized, slug);
    };

    for (const workType of workTypes) {
      registerPath(workType.url_path);
    }

    for (const item of items) {
      for (const workType of item.work_types || []) {
        registerPath(workType.url_path);
      }
    }

    return next;
  }, [items, showWorkTypeFilter, workTypes]);

  const workMetaBySlug = useMemo(() => {
    if (!showWorkTypeFilter) {
      return new Map<string, { name: string; url_path: string | null }>();
    }

    const next = new Map<string, { name: string; url_path: string | null }>();

    const register = (name: string, urlPath: string | null | undefined) => {
      const slug = resolvePathSlug(urlPath, workSlugByPath);
      if (!slug) return;

      if (!next.has(slug)) {
        next.set(slug, {
          name,
          url_path: normalizePath(urlPath),
        });
      }
    };

    for (const workType of workTypes) {
      register(workType.name, workType.url_path);
    }

    for (const item of items) {
      for (const workType of item.work_types || []) {
        register(workType.name, workType.url_path);
      }
    }

    return next;
  }, [items, showWorkTypeFilter, workSlugByPath, workTypes]);

  const itemCategorySlugsById = useMemo(() => {
    const next = new Map<string, Set<string>>();

    for (const item of items) {
      const slugs = new Set<string>();
      for (const type of item.equipment_types || []) {
        const slug = resolvePathSlug(type.url_path, categorySlugByPath);
        if (slug) {
          slugs.add(slug);
        }
      }
      next.set(item.id, slugs);
    }

    return next;
  }, [items, categorySlugByPath]);

  const itemWorkSlugsById = useMemo(() => {
    const next = new Map<string, Set<string>>();

    if (!showWorkTypeFilter) {
      return next;
    }

    for (const item of items) {
      const slugs = new Set<string>();
      for (const workType of item.work_types || []) {
        const slug = resolvePathSlug(workType.url_path, workSlugByPath);
        if (slug) {
          slugs.add(slug);
        }
      }
      next.set(item.id, slugs);
    }

    return next;
  }, [items, showWorkTypeFilter, workSlugByPath]);

  const categoryOptions = useMemo<EquipmentCategory[]>(() => {
    const counts = new Map<string, number>();

    for (const slugs of itemCategorySlugsById.values()) {
      for (const slug of slugs) {
        counts.set(slug, (counts.get(slug) || 0) + 1);
      }
    }

    return categories
      .map((category) => ({
        slug: category.slug,
        name: category.name,
        url_path: category.url_path,
        filter_keys: category.filter_keys,
        count: counts.get(category.slug) || 0,
      }))
      .filter((category) => category.count > 0)
      .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, "ru-RU"));
  }, [categories, itemCategorySlugsById]);

  const categoryItemIdsBySlug = useMemo(() => {
    const next = new Map<string, Set<string>>();

    for (const item of items) {
      const slugs = itemCategorySlugsById.get(item.id);
      if (!slugs?.size) continue;

      for (const slug of slugs) {
        if (!next.has(slug)) {
          next.set(slug, new Set());
        }

        next.get(slug)?.add(item.id);
      }
    }

    return next;
  }, [items, itemCategorySlugsById]);

  const {
    rootCategoryOptions,
    childrenByParentSlug,
    parentByCategorySlug,
    rootByCategorySlug,
  } = useMemo(() => {
    const parentByCategorySlug = new Map<string, string>();
    const familyBySlug = new Map<string, string | null>();

    for (const category of categoryOptions) {
      familyBySlug.set(category.slug, categoryFamilyKey(category.name));
    }

    const sortedBySpecificity = [...categoryOptions].sort(
      (left, right) => left.count - right.count || left.name.localeCompare(right.name, "ru-RU"),
    );

    for (const child of sortedBySpecificity) {
      const childSet = categoryItemIdsBySlug.get(child.slug);
      if (!childSet?.size) continue;

      let parentCandidate: EquipmentCategory | null = null;

      for (const candidate of categoryOptions) {
        if (candidate.slug === child.slug || candidate.count <= child.count) continue;

        const candidateSet = categoryItemIdsBySlug.get(candidate.slug);
        if (!candidateSet?.size) continue;
        if (!setIncludesAll(candidateSet, childSet)) continue;

        if (
          !parentCandidate ||
          candidate.count < parentCandidate.count ||
          (candidate.count === parentCandidate.count && candidate.name.localeCompare(parentCandidate.name, "ru-RU") < 0)
        ) {
          parentCandidate = candidate;
        }
      }

      if (parentCandidate) {
        parentByCategorySlug.set(child.slug, parentCandidate.slug);
      }
    }

    // Fallback for flattened WP taxonomy: group narrow SEO categories under a broader family root.
    for (const child of sortedBySpecificity) {
      if (parentByCategorySlug.has(child.slug)) continue;

      const family = familyBySlug.get(child.slug);
      if (!family) continue;

      const childScore = categorySpecificityScore(child.name);
      const familyCandidates = categoryOptions
        .filter((candidate) => candidate.slug !== child.slug && familyBySlug.get(candidate.slug) === family)
        .sort((left, right) => {
          const scoreDiff = categorySpecificityScore(left.name) - categorySpecificityScore(right.name);
          if (scoreDiff) return scoreDiff;
          if (right.count !== left.count) return right.count - left.count;
          return left.name.localeCompare(right.name, "ru-RU");
        });

      const candidate = familyCandidates[0];
      if (!candidate) continue;

      const candidateScore = categorySpecificityScore(candidate.name);
      if (candidateScore < childScore) {
        parentByCategorySlug.set(child.slug, candidate.slug);
      }
    }

    const rootByCategorySlug = new Map<string, string>();

    for (const category of categoryOptions) {
      let current = category.slug;
      const seen = new Set<string>();

      while (parentByCategorySlug.has(current) && !seen.has(current)) {
        seen.add(current);
        current = parentByCategorySlug.get(current) || current;
      }

      rootByCategorySlug.set(category.slug, current);
    }

    const childrenByParentSlug = new Map<string, EquipmentCategory[]>();

    for (const category of categoryOptions) {
      const parent = parentByCategorySlug.get(category.slug);
      if (!parent) continue;

      if (!childrenByParentSlug.has(parent)) {
        childrenByParentSlug.set(parent, []);
      }

      childrenByParentSlug.get(parent)?.push(category);
    }

    for (const children of childrenByParentSlug.values()) {
      children.sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, "ru-RU"));
    }

    const rootCategoryOptions = categoryOptions.filter((category) => !parentByCategorySlug.has(category.slug));

    return {
      rootCategoryOptions,
      childrenByParentSlug,
      parentByCategorySlug,
      rootByCategorySlug,
    };
  }, [categoryItemIdsBySlug, categoryOptions]);

  const validCategorySlugs = useMemo(() => new Set(categoryOptions.map((category) => category.slug)), [categoryOptions]);

  const [selectedCategoryState, setSelectedCategoryState] = useState<string>(() => readInitialParam(CATEGORY_PARAM));
  const [selectedWorkTypeState, setSelectedWorkTypeState] = useState<string>(() => (showWorkTypeFilter ? readInitialParam(WORK_PARAM) : ""));
  const [selectedFilters, setSelectedFilters] = useState<SelectedFilters>(() => readInitialFilters());
  const [workComboboxValue, setWorkComboboxValue] = useState("");
  const [workComboboxOpen, setWorkComboboxOpen] = useState(false);
  const [allSpecsOpen, setAllSpecsOpen] = useState(false);
  const [gridColumns, setGridColumns] = useState(() => {
    if (typeof window === "undefined") return 3;
    return archiveGridColumnsForWidth(window.innerWidth);
  });
  const [expandedScopeKey, setExpandedScopeKey] = useState("");
  const workComboboxRef = useRef<HTMLDivElement | null>(null);

  const selectedCategory = validCategorySlugs.has(selectedCategoryState) ? selectedCategoryState : "";

  const activeRootCategorySlug = selectedCategory ? rootByCategorySlug.get(selectedCategory) || selectedCategory : "";

  const categoryScopedItems = useMemo(() => {
    if (!selectedCategory) return items;

    return items.filter((item) => itemCategorySlugsById.get(item.id)?.has(selectedCategory));
  }, [itemCategorySlugsById, items, selectedCategory]);

  const workOptions = useMemo<WorkTypeOption[]>(() => {
    if (!showWorkTypeFilter) {
      return [];
    }

    const counts = new Map<string, number>();

    for (const item of items) {
      const slugs = itemWorkSlugsById.get(item.id);
      if (!slugs?.size) continue;

      for (const slug of slugs) {
        counts.set(slug, (counts.get(slug) || 0) + 1);
      }
    }

    return Array.from(counts.entries())
      .map(([slug, count]) => {
        const meta = workMetaBySlug.get(slug);
        return {
          slug,
          name: meta?.name || slug.replaceAll("-", " "),
          url_path: meta?.url_path || null,
          count,
        };
      })
      .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, "ru-RU"));
  }, [itemWorkSlugsById, items, showWorkTypeFilter, workMetaBySlug]);

  const validWorkSlugs = useMemo(() => new Set(workOptions.map((workType) => workType.slug)), [workOptions]);

  const selectedWorkType = showWorkTypeFilter && validWorkSlugs.has(selectedWorkTypeState) ? selectedWorkTypeState : "";

  const scopedItems = useMemo(() => {
    if (!selectedWorkType) return categoryScopedItems;

    return categoryScopedItems.filter((item) => itemWorkSlugsById.get(item.id)?.has(selectedWorkType));
  }, [categoryScopedItems, itemWorkSlugsById, selectedWorkType]);

  const selectedCategoryInfo = useMemo(
    () => categoryOptions.find((category) => category.slug === selectedCategory) || null,
    [categoryOptions, selectedCategory],
  );

  const activeRootCategoryInfo = useMemo(
    () => categoryOptions.find((category) => category.slug === activeRootCategorySlug) || null,
    [activeRootCategorySlug, categoryOptions],
  );

  const childCategoryOptions = useMemo(
    () => (activeRootCategorySlug ? childrenByParentSlug.get(activeRootCategorySlug) || [] : []),
    [activeRootCategorySlug, childrenByParentSlug],
  );

  const rootCategoryTitleBySlug = useMemo(() => {
    const next = new Map<string, string>();

    for (const category of rootCategoryOptions) {
      const family = categoryFamilyKey(category.name);
      const byFamily = family ? ROOT_CATEGORY_LABELS_BY_FAMILY[family] : null;
      next.set(category.slug, byFamily || compactCategoryTitle(category.name));
    }

    return next;
  }, [rootCategoryOptions]);

  const rootCategoryPreviewBySlug = useMemo(() => {
    const next = new Map<string, { src: string; alt: string }>();

    for (const item of items) {
      const src = assetUrl(item.image);
      if (!src) continue;

      const rootsForItem = new Set<string>();
      const categorySlugs = itemCategorySlugsById.get(item.id);
      if (!categorySlugs?.size) continue;

      for (const slug of categorySlugs) {
        const rootSlug = rootByCategorySlug.get(slug) || slug;
        rootsForItem.add(rootSlug);
      }

      for (const rootSlug of rootsForItem) {
        if (!next.has(rootSlug)) {
          next.set(rootSlug, {
            src,
            alt: item.image?.title || item.title,
          });
        }
      }
    }

    return next;
  }, [itemCategorySlugsById, items, rootByCategorySlug]);

  const rootCategoryCards = useMemo(
    () =>
      rootCategoryOptions.map((category) => ({
        slug: category.slug,
        title: rootCategoryTitleBySlug.get(category.slug) || category.name,
        count: category.count,
        preview: rootCategoryPreviewBySlug.get(category.slug) || null,
      })),
    [rootCategoryOptions, rootCategoryPreviewBySlug, rootCategoryTitleBySlug],
  );

  const isChildCategorySelected = Boolean(selectedCategory && parentByCategorySlug.has(selectedCategory));

  const childCategorySelectModel = useMemo(() => {
    if (!childCategoryOptions.length) {
      return {
        mode: null as "ton" | "meter" | null,
        label: "Характеристика",
        options: [] as Array<{ slug: string; label: string; count: number; order: number | null }>,
      };
    }

    const parsed = childCategoryOptions.map((category) => ({
      category,
      dimension: parseDimensionFromCategoryName(category.name),
    }));

    const tonCount = parsed.filter((entry) => entry.dimension?.unit === "ton").length;
    const meterCount = parsed.filter((entry) => entry.dimension?.unit === "meter").length;

    const mode: "ton" | "meter" | null =
      tonCount >= 3 && tonCount >= meterCount ? "ton" : meterCount >= 3 ? "meter" : null;

    const label = mode === "ton" ? "Грузоподъемность" : mode === "meter" ? "Высота" : "Характеристика";

    const options = parsed
      .map(({ category, dimension }) => {
        if (mode === "ton" && dimension?.unit === "ton") {
          return {
            slug: category.slug,
            label: `${new Intl.NumberFormat("ru-RU").format(dimension.value)} т`,
            count: category.count,
            order: dimension.value,
          };
        }

        if (mode === "meter" && dimension?.unit === "meter") {
          return {
            slug: category.slug,
            label: `${new Intl.NumberFormat("ru-RU").format(dimension.value)} м`,
            count: category.count,
            order: dimension.value,
          };
        }

        return {
          slug: category.slug,
          label: compactChildCategoryLabel(category.name),
          count: category.count,
          order: null,
        };
      })
      .sort((left, right) => {
        if (typeof left.order === "number" && typeof right.order === "number") {
          return left.order - right.order;
        }

        if (typeof left.order === "number") return -1;
        if (typeof right.order === "number") return 1;

        return right.count - left.count || left.label.localeCompare(right.label, "ru-RU");
      });

    return { mode, label, options };
  }, [childCategoryOptions]);

  const selectedCharacteristicOption = useMemo(() => {
    if (!activeRootCategorySlug || selectedCategory === activeRootCategorySlug) return null;
    return childCategorySelectModel.options.find((option) => option.slug === selectedCategory) || null;
  }, [activeRootCategorySlug, childCategorySelectModel.options, selectedCategory]);

  const selectedWorkInfo = useMemo(
    () => workOptions.find((workType) => workType.slug === selectedWorkType) || null,
    [workOptions, selectedWorkType],
  );

  const filteredWorkOptions = useMemo(() => {
    const query = workComboboxValue.trim().toLocaleLowerCase("ru-RU");
    if (!query) return workOptions;

    return workOptions.filter((workType) => workType.name.toLocaleLowerCase("ru-RU").includes(query));
  }, [workComboboxValue, workOptions]);

  const workComboboxInputValue = selectedWorkType && !workComboboxOpen
    ? selectedWorkInfo?.name || ""
    : workComboboxValue;

  const availableFilterKeys = useMemo(() => {
    if (!selectedCategory) {
      return [];
    }

    const preferRootFilters = isChildCategorySelected;
    const filterSource =
      preferRootFilters
        ? activeRootCategoryInfo?.filter_keys?.length
          ? activeRootCategoryInfo
          : selectedCategoryInfo?.filter_keys?.length
            ? selectedCategoryInfo
            : null
        : selectedCategoryInfo?.filter_keys?.length
          ? selectedCategoryInfo
          : activeRootCategoryInfo?.filter_keys?.length
            ? activeRootCategoryInfo
            : null;

    if (filterSource?.filter_keys?.length) {
      return filterSource.filter_keys;
    }

    const keys = new Set<string>();
    for (const item of categoryScopedItems) {
      for (const spec of item.specs || []) {
        if (spec.key) keys.add(spec.key);
      }
    }

    return Array.from(keys).sort((left, right) => left.localeCompare(right, "ru-RU"));
  }, [activeRootCategoryInfo, categoryScopedItems, isChildCategorySelected, selectedCategory, selectedCategoryInfo]);

  const filters = useMemo(() => {
    if (!selectedCategory) {
      return [];
    }

    const builtFilters = buildFilters(scopedItems, availableFilterKeys);
    return dedupeFiltersByLabel(builtFilters);
  }, [availableFilterKeys, scopedItems, selectedCategory]);

  const activeFilters = useMemo(() => {
    const optionsByKey = new Map(filters.map((filter) => [filter.key, new Set(filter.options)]));
    const next: SelectedFilters = {};

    for (const [key, value] of Object.entries(selectedFilters)) {
      const options = optionsByKey.get(key);
      if (value && options?.has(value)) {
        next[key] = value;
      }
    }

    return next;
  }, [filters, selectedFilters]);

  const activeFilterChips = useMemo(() => {
    const labelsByKey = new Map(filters.map((filter) => [filter.key, filter.label]));

    return Object.entries(activeFilters)
      .filter(([, value]) => Boolean(value))
      .map(([key, value]) => ({
        key,
        value,
        label: labelsByKey.get(key) || key,
      }));
  }, [activeFilters, filters]);

  const shouldShowWorkTypeFilter = showWorkTypeFilter && workOptions.length > 0;
  const shouldShowSubcategoryFilter = Boolean(activeRootCategorySlug && childCategoryOptions.length && !filters.length);
  const shouldShowPrimaryFilters = shouldShowWorkTypeFilter || shouldShowSubcategoryFilter;

  useEffect(() => {
    writeSearchState(selectedCategory, showWorkTypeFilter ? selectedWorkType : "", activeFilters);
  }, [activeFilters, selectedCategory, selectedWorkType, showWorkTypeFilter]);

  useEffect(() => {
    const syncGridColumns = () => {
      setGridColumns(archiveGridColumnsForWidth(window.innerWidth));
    };

    syncGridColumns();
    window.addEventListener("resize", syncGridColumns);

    return () => {
      window.removeEventListener("resize", syncGridColumns);
    };
  }, []);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (workComboboxRef.current && !workComboboxRef.current.contains(target)) {
        setWorkComboboxOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setWorkComboboxOpen(false);
        setAllSpecsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const activeFiltersKey = useMemo(() => {
    return JSON.stringify(
      Object.entries(activeFilters)
        .filter(([, value]) => Boolean(value))
        .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey, "ru-RU")),
    );
  }, [activeFilters]);

  const visibleScopeKey = useMemo(
    () => `${selectedCategory}|${selectedWorkType}|${activeFiltersKey}`,
    [activeFiltersKey, selectedCategory, selectedWorkType],
  );

  const filteredItems = useMemo(
    () => scopedItems.filter((item) => itemMatchesFilters(item, activeFilters)),
    [scopedItems, activeFilters],
  );

  const isGridExpanded = expandedScopeKey === visibleScopeKey;
  const maxVisibleItems = Math.max(gridColumns * MAX_ARCHIVE_ROWS, MAX_ARCHIVE_ROWS);
  const canExpandGrid = filteredItems.length > maxVisibleItems;
  const visibleItems = isGridExpanded || !canExpandGrid ? filteredItems : filteredItems.slice(0, maxVisibleItems);

  function handleCategoryChange(nextCategory: string) {
    setSelectedCategoryState(nextCategory);
    setSelectedFilters({});
    setAllSpecsOpen(false);
    if (nextCategory) {
      setSelectedWorkTypeState("");
    }
  }

  function handleWorkTypeChange(nextWorkType: string) {
    setSelectedWorkTypeState(nextWorkType);
    setAllSpecsOpen(false);
    if (nextWorkType) {
      setSelectedCategoryState("");
      setSelectedFilters({});
    }
  }

  function handleWorkComboboxInput(nextValue: string) {
    setWorkComboboxValue(nextValue);
    setWorkComboboxOpen(true);

    if (
      selectedWorkType &&
      nextValue.trim().toLocaleLowerCase("ru-RU") !== (selectedWorkInfo?.name || "").toLocaleLowerCase("ru-RU")
    ) {
      handleWorkTypeChange("");
    }
  }

  function applyWorkComboboxSelection(nextSlug: string, nextName: string) {
    handleWorkTypeChange(nextSlug);
    setWorkComboboxValue(nextName);
    setWorkComboboxOpen(false);
  }

  function handleFilterChange(key: string, value: string) {
    setSelectedFilters((currentFilters) => {
      const nextFilters = { ...currentFilters };
      if (value) nextFilters[key] = value;
      else delete nextFilters[key];
      return nextFilters;
    });
  }

  function resetAllFilters() {
    setSelectedCategoryState("");
    setSelectedWorkTypeState("");
    setSelectedFilters({});
    setAllSpecsOpen(false);
  }

  return (
    <Section className="section section--catalog section--catalog-global">
      <div className="container smart-catalog-layout">
        <aside className="smart-catalog-sidebar" aria-label="Категории техники">
          <p className="smart-catalog-sidebar__title">Категории техники</p>
          <div className="smart-catalog-sidebar__list">
            <button
              className={`smart-catalog-sidebar__item${selectedCategory ? "" : " is-active"}`}
              type="button"
              onClick={() => handleCategoryChange("")}
            >
              <span className="smart-catalog-sidebar__thumb smart-catalog-sidebar__thumb--all u-pos-rel" aria-hidden="true">
                <span className="smart-catalog-sidebar__thumb-fallback">Все</span>
              </span>
              <span className="smart-catalog-sidebar__content">
                <span className="smart-catalog-sidebar__name">Все категории</span>
                <span className="smart-catalog-sidebar__count">{items.length} ед. техники</span>
              </span>
            </button>
            {rootCategoryCards.map((category) => (
              <button
                className={`smart-catalog-sidebar__item${activeRootCategorySlug === category.slug ? " is-active" : ""}`}
                type="button"
                onClick={() => handleCategoryChange(category.slug)}
                key={category.slug}
              >
                <span className="smart-catalog-sidebar__thumb u-pos-rel" aria-hidden="true">
                  {category.preview ? (
                    <Image src={category.preview.src} alt="" fill sizes="72px" />
                  ) : (
                    <span className="smart-catalog-sidebar__thumb-fallback">{category.title.slice(0, 1)}</span>
                  )}
                </span>
                <span className="smart-catalog-sidebar__content">
                  <span className="smart-catalog-sidebar__name">{category.title}</span>
                  <span className="smart-catalog-sidebar__count">{category.count} ед. техники</span>
                </span>
              </button>
            ))}
          </div>
        </aside>

        <div className="smart-catalog-main">
          <div className="smart-catalog-toolbar">
            {selectedCharacteristicOption ? (
              <div className="smart-catalog__summary" aria-live="polite">
                <p>
                  Характеристика: <strong>{selectedCharacteristicOption.label}</strong>
                </p>
              </div>
            ) : null}

            {shouldShowPrimaryFilters ? (
              <div className="smart-catalog-primary">
                {shouldShowWorkTypeFilter ? (
                  <div className="smart-catalog-work" aria-label="Фильтр по типам работ">
                  <p className="smart-catalog-work__title">Услуги спецтехники</p>
                  <div className="smart-catalog-work__combobox" ref={workComboboxRef}>
                    <div className="smart-catalog-work__field">
                      <SearchIcon className="smart-catalog-work__search-icon" aria-hidden="true" />
                      <Input
                        className="smart-catalog-work__input"
                        type="text"
                        role="combobox"
                        aria-autocomplete="list"
                        aria-expanded={workComboboxOpen}
                        aria-controls="smart-work-types-list"
                        placeholder="Начните вводить тип работ"
                        value={workComboboxInputValue}
                        onFocus={() => {
                          setWorkComboboxOpen(true);
                          if (selectedWorkType && selectedWorkInfo?.name) {
                            setWorkComboboxValue(selectedWorkInfo.name);
                          }
                        }}
                        onChange={(event) => handleWorkComboboxInput(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && workComboboxInputValue.trim() && filteredWorkOptions.length) {
                            event.preventDefault();
                            const firstOption = filteredWorkOptions[0];
                            applyWorkComboboxSelection(firstOption.slug, firstOption.name);
                          }
                        }}
                      />
                      {workComboboxInputValue ? (
                        <button
                          className="smart-catalog-work__clear"
                          type="button"
                          aria-label="Очистить поиск типов работ"
                          onClick={() => {
                            setWorkComboboxValue("");
                            handleWorkTypeChange("");
                            setWorkComboboxOpen(true);
                          }}
                        >
                          <CloseIcon aria-hidden="true" />
                        </button>
                      ) : null}
                      <button
                        className={`smart-catalog-work__toggle${workComboboxOpen ? " is-open" : ""}`}
                        type="button"
                        aria-label="Открыть список типов работ"
                        aria-expanded={workComboboxOpen}
                        aria-controls="smart-work-types-list"
                        onClick={() => setWorkComboboxOpen((current) => !current)}
                      >
                        <ChevronDownIcon aria-hidden="true" />
                      </button>
                    </div>

                    {workComboboxOpen ? (
                      <div className="smart-catalog-work__popover" id="smart-work-types-list" role="listbox">
                        <button
                          className={`smart-catalog-work__option${selectedWorkType ? "" : " is-active"}`}
                          type="button"
                          onClick={() => {
                            handleWorkTypeChange("");
                            setWorkComboboxValue("");
                            setWorkComboboxOpen(false);
                          }}
                        >
                          <span className="smart-catalog-work__option-name">Все типы работ</span>
                        </button>

                        {filteredWorkOptions.length ? (
                          filteredWorkOptions.map((workType) => (
                            <button
                              className={`smart-catalog-work__option${selectedWorkType === workType.slug ? " is-active" : ""}`}
                              type="button"
                              onClick={() => applyWorkComboboxSelection(workType.slug, workType.name)}
                              key={workType.slug}
                            >
                              <span className="smart-catalog-work__option-name">{workType.name}</span>
                              <span className="smart-catalog-work__option-meta">
                                <span className="smart-catalog-work__option-count">{workType.count}</span>
                                {selectedWorkType === workType.slug ? (
                                  <CheckIcon className="smart-catalog-work__option-check" aria-hidden="true" />
                                ) : null}
                              </span>
                            </button>
                          ))
                        ) : (
                          <p className="smart-catalog-work__empty">Ничего не найдено</p>
                        )}
                      </div>
                    ) : null}
                  </div>
                  </div>
                ) : null}

                {shouldShowSubcategoryFilter ? (
                  <div className="smart-catalog-subcategories" aria-label="Подкатегории">
                    <p className="smart-catalog-subcategories__title">Характеристика категории</p>
                    <label className="archive-filterbar__field smart-catalog-subcategories__field" key="subcategory-select">
                      <span>{childCategorySelectModel.label}</span>
                      <Select
                        value={selectedCategory === activeRootCategorySlug ? "" : selectedCategory}
                        onChange={(value) => handleCategoryChange(value || activeRootCategorySlug)}
                        options={[
                          { value: "", label: "Все значения" },
                          ...childCategorySelectModel.options.map((option) => ({
                            value: option.slug,
                            label: `${option.label} (${option.count})`,
                          })),
                        ]}
                      />
                    </label>
                  </div>
                ) : null}
              </div>
            ) : null}

            {selectedCategory ? (
              filters.length ? (
                <EquipmentSpecsFilters
                  filters={filters}
                  items={scopedItems}
                  selectedFilters={activeFilters}
                  onChange={handleFilterChange}
                  onReset={resetAllFilters}
                  expanded={allSpecsOpen}
                  onExpandedChange={setAllSpecsOpen}
                >
                  {activeFilterChips.map((chip) => (
                    <button
                      className="smart-catalog__chip"
                      type="button"
                      key={chip.key}
                      onClick={() => handleFilterChange(chip.key, "")}
                      title={`Убрать фильтр ${chip.label}`}
                    >
                      <span className="smart-catalog__chip-text">
                        {chip.label}: <strong>{chip.value}</strong>
                      </span>
                      <CloseIcon className="smart-catalog__chip-remove" aria-hidden="true" />
                    </button>
                  ))}
                </EquipmentSpecsFilters>
              ) : (
                <p className="archive-filterbar__note">Для этой категории характеристики пока заполнены не полностью.</p>
              )
            ) : (
              <p className="smart-catalog__hint">
                Выберите категорию слева, чтобы открыть фильтры характеристик этого вида техники.
              </p>
            )}

          </div>

          {filteredItems.length ? (
            <>
              <div className="equipment-grid">
                {visibleItems.map((item) => (
                  <EquipmentCard item={item} variant="archive" key={item.id} />
                ))}
              </div>
              {canExpandGrid && !isGridExpanded ? (
                <div className="smart-catalog__more">
                  <button
                    className="smart-catalog__show-more"
                    type="button"
                    onClick={() => setExpandedScopeKey(visibleScopeKey)}
                  >
                    Показать еще
                  </button>
                </div>
              ) : null}
            </>
          ) : (
            <div className="archive-filterbar__empty">По выбранным параметрам техника не найдена.</div>
          )}
        </div>
      </div>
    </Section>
  );
}
