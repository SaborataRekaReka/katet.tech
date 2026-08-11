import type { EquipmentCardRecord } from "@/lib/content";

export type EquipmentMatchRule = {
  token: string;
  score: number;
};

type RequiredEquipmentRule = {
  predicate: (item: EquipmentCardRecord) => boolean;
  minimumCount: number;
};

type PickServiceEquipmentOptions = {
  maxItems?: number;
  required?: RequiredEquipmentRule[];
  fallbackPattern?: RegExp;
};

export function normalizeServiceText(value: string | null | undefined) {
  if (!value) return "";
  return value.toLocaleLowerCase("ru-RU").replace(/ё/g, "е").replace(/\s+/g, " ").trim();
}

export function equipmentSearchSource(item: EquipmentCardRecord) {
  const equipmentTypes = (item.equipment_types || []).map((entry) => normalizeServiceText(entry.name)).join(" ");
  const workTypes = (item.work_types || []).map((entry) => normalizeServiceText(entry.name)).join(" ");

  return `${normalizeServiceText(item.title)} ${normalizeServiceText(item.excerpt)} ${equipmentTypes} ${workTypes}`;
}

export function pickServiceEquipment(
  items: EquipmentCardRecord[],
  rules: EquipmentMatchRule[],
  options: PickServiceEquipmentOptions = {},
) {
  const maxItems = options.maxItems ?? 12;
  const ranked = items
    .map((item) => ({
      item,
      score: rules.reduce((total, rule) => total + (equipmentSearchSource(item).includes(rule.token) ? rule.score : 0), 0),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      const scoreDelta = right.score - left.score;
      if (scoreDelta !== 0) return scoreDelta;
      return left.item.title.localeCompare(right.item.title, "ru-RU");
    })
    .map((entry) => entry.item);

  if (!ranked.length) {
    const fallbackPattern = options.fallbackPattern ?? /экскаватор|погрузчик|бульдозер|самосвал|каток/iu;
    return items.filter((item) => fallbackPattern.test(equipmentSearchSource(item))).slice(0, maxItems);
  }

  const selected = ranked.slice(0, maxItems);
  const selectedIds = new Set(selected.map((item) => item.id));

  for (const required of options.required || []) {
    let currentCount = selected.filter(required.predicate).length;
    if (currentCount >= required.minimumCount) continue;

    const replaceableIndexes = selected
      .map((item, index) => ({ item, index }))
      .filter((entry) => !required.predicate(entry.item))
      .map((entry) => entry.index)
      .reverse();

    for (const candidate of ranked) {
      if (currentCount >= required.minimumCount) break;
      if (selectedIds.has(candidate.id) || !required.predicate(candidate)) continue;

      const replaceIndex = replaceableIndexes.shift();
      if (replaceIndex === undefined) break;

      selectedIds.delete(selected[replaceIndex].id);
      selected[replaceIndex] = candidate;
      selectedIds.add(candidate.id);
      currentCount += 1;
    }
  }

  return selected;
}
