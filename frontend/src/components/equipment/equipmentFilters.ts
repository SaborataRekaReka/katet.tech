import type { EquipmentCardRecord } from "@/lib/content";

export type FilterOption = { key: string; label: string; options: string[] };
export type SelectedFilters = Record<string, string>;

export const FILTER_LABELS: Record<string, string> = {
  "razmer-platformyliulki": "Размер платформы/люльки",
  "kolesnaia-baza": "Колесная база",
  "kolesnaia-formula": "Колесная формула",
  "dlina-strely": "Длина стрелы",
  "maksimalnaia-vysota-podema": "Максимальная высота подъема",
  "gruzovoi-moment": "Грузовой момент",
  "dlina-guska": "Длина гуська",
  toplivo: "Топливо",
  "rabochaia-vysota": "Рабочая высота",
  "shirina-otvala": "Ширина отвала",
  "vysota-otvala": "Высота отвала",
  "vmestimost-tsisterny": "Вместимость цистерны",
  "rabochaia-shirina": "Рабочая ширина",
  "obem-kovsha": "Объем ковша",
  "vysota-vygruzki-pogruzchika": "Высота выгрузки погрузчика",
  "shirina-zony-moiki": "Ширина зоны мойки",
  "obiom-tsisterny": "Объем цистерны",
  oborudovanie: "Оборудование",
  "gruzopodemnost-strely": "Грузоподъемность стрелы",
  "maksimalnyi-vylet-strely": "Максимальный вылет стрелы",
  "dlina-kuzova": "Длина кузова",
  "shirina-kuzova": "Ширина кузова",
  "obem-kuzova": "Объем кузова",
  "glubina-ochishchaemoi-iamy": "Глубина очищаемой ямы",
  gabarity: "Габариты",
  gruzopodemnost: "Грузоподъемность",
  "dlina-borta": "Длина борта",
  "shirina-borta": "Ширина борта",
  "vysota-borta": "Высота платформы",
  massa: "Масса",
  "obiom-kovsha": "Объем ковша",
  "glubina-kopaniia": "Глубина копания",
  "moshchnost-dvigatelia": "Мощность двигателя",
  "vysota-podema": "Высота подъема",
};

const filterParam = (key: string) => `filter_${key}`;

function normalizeFilterValue(value: string) {
  return value
    .toLocaleLowerCase("ru-RU")
    .replaceAll("ё", "е")
    .replaceAll("x", "х")
    .replace(/м\s*[. ]?\s*куб|м³|м3/gi, "мкуб")
    .replace(/тонн(?:ы|а)?\b/gi, "т")
    .replace(/\bт\./gi, "т")
    .replace(/[^\p{L}\p{N},]+/gu, "")
    .replaceAll(",", "");
}

function specMatches(specValue: string, option: string) {
  return normalizeFilterValue(specValue) === normalizeFilterValue(option);
}

export function itemMatchesFilters(item: EquipmentCardRecord, selectedFilters: SelectedFilters) {
  const activeFilters = Object.entries(selectedFilters).filter(([, value]) => value);
  if (!activeFilters.length) return true;

  return activeFilters.every(([key, selectedValue]) =>
    (item.specs || []).some((spec) => spec.key === key && specMatches(spec.value, selectedValue)),
  );
}

export function buildFilters(items: EquipmentCardRecord[], filterKeys?: string[] | null): FilterOption[] {
  const allowedKeys = filterKeys?.length ? filterKeys : [];
  const allowedSet = new Set(allowedKeys);
  const labelByKey = new Map<string, string>();
  const valuesByKey = new Map<string, Set<string>>();

  for (const item of items) {
    for (const spec of item.specs || []) {
      if (!allowedSet.has(spec.key) || !spec.value) continue;
      if (!valuesByKey.has(spec.key)) valuesByKey.set(spec.key, new Set());
      valuesByKey.get(spec.key)?.add(spec.value);
      if (!labelByKey.has(spec.key)) labelByKey.set(spec.key, spec.label);
    }
  }

  return allowedKeys
    .map((key) => ({
      key,
      label: FILTER_LABELS[key] || labelByKey.get(key) || key,
      options: [...(valuesByKey.get(key) || [])].sort((left, right) => left.localeCompare(right, "ru-RU", { numeric: true })),
    }))
    .filter((filter) => filter.options.length > 0);
}

export function optionMatchCount(items: EquipmentCardRecord[], selectedFilters: SelectedFilters, key: string, option: string) {
  return items.filter((item) => itemMatchesFilters(item, { ...selectedFilters, [key]: option })).length;
}

export function filtersFromUrl(keys: string[]) {
  if (typeof window === "undefined") return {};

  const params = new URLSearchParams(window.location.search);
  const nextFilters: SelectedFilters = {};
  for (const key of keys) {
    const value = params.get(filterParam(key));
    if (value) nextFilters[key] = value;
  }

  return nextFilters;
}

export function writeFiltersToUrl(selectedFilters: SelectedFilters, keys: string[]) {
  if (typeof window === "undefined") return;

  const url = new URL(window.location.href);
  for (const key of keys) url.searchParams.delete(filterParam(key));
  for (const [key, value] of Object.entries(selectedFilters)) {
    if (value && keys.includes(key)) url.searchParams.set(filterParam(key), value);
  }

  window.history.replaceState(null, "", url);
}