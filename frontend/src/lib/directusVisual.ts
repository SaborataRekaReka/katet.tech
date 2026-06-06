export type DirectusVisualMode = "drawer" | "modal" | "popover";

export type DirectusVisualAttrInput = {
  collection: string;
  item: string | number | null | undefined;
  fields?: string | string[];
  mode?: DirectusVisualMode;
};

function normalizeFields(fields?: string | string[]) {
  const list = Array.isArray(fields)
    ? fields
    : typeof fields === "string"
      ? fields.split(",")
      : [];

  const normalized = list
    .map((field) => field.trim())
    .filter(Boolean);

  return Array.from(new Set(normalized));
}

export function toDirectusVisualAttr(input: DirectusVisualAttrInput): string | undefined {
  const collection = input.collection.trim();
  const item = input.item;

  if (!collection) return undefined;
  if (item === null || item === undefined || `${item}`.trim() === "") return undefined;

  const parts = [`collection:${collection}`, `item:${item}`];
  const fields = normalizeFields(input.fields);

  if (fields.length) {
    parts.push(`fields:${fields.join(",")}`);
  }

  if (input.mode) {
    parts.push(`mode:${input.mode}`);
  }

  return parts.join(";");
}
