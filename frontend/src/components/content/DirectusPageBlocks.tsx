import type { ReactNode } from "react";
import { ActionLink, type ButtonVariant } from "@/components/ui/Button";
import { stripHtml } from "@/lib/format";

type BlockType = "rich_text" | "cta" | "notice" | "checklist";

type BaseBlock = {
  id: string;
  type: BlockType;
};

type RichTextBlock = BaseBlock & {
  type: "rich_text";
  eyebrow?: string;
  title?: string;
  html: string;
};

type CtaBlock = BaseBlock & {
  type: "cta";
  title?: string;
  description?: string;
  buttonText: string;
  buttonHref: string;
  buttonVariant: ButtonVariant;
};

type NoticeBlock = BaseBlock & {
  type: "notice";
  title?: string;
  text: string;
  tone: "neutral" | "warning" | "success";
};

type ChecklistBlock = BaseBlock & {
  type: "checklist";
  title?: string;
  items: string[];
};

export type DirectusPageBlock = RichTextBlock | CtaBlock | NoticeBlock | ChecklistBlock;

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readString(source: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    return trimmed;
  }

  return null;
}

function readBoolean(source: Record<string, unknown>, keys: string[]): boolean | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "boolean") return value;

    if (typeof value === "number") {
      if (value === 1) return true;
      if (value === 0) return false;
    }

    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (["true", "1", "yes", "on"].includes(normalized)) return true;
      if (["false", "0", "no", "off"].includes(normalized)) return false;
    }
  }

  return null;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function plainTextToHtml(value: string | null) {
  if (!value) return null;

  const normalized = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("");

  return normalized || null;
}

function asButtonVariant(value: string | null): ButtonVariant {
  const normalized = value?.trim().toLowerCase().replace(/[\s-]+/g, "_");

  switch (normalized) {
    case "outline":
    case "light":
    case "neutral":
    case "accent":
      return normalized;
    default:
      return "accent";
  }
}

function normalizeBlockType(value: string | null): BlockType | null {
  const normalized = value?.trim().toLowerCase().replace(/[\s-]+/g, "_");

  switch (normalized) {
    case "rich_text":
    case "text":
    case "html":
    case "wysiwyg":
      return "rich_text";
    case "cta":
    case "call_to_action":
      return "cta";
    case "notice":
    case "alert":
    case "info":
      return "notice";
    case "checklist":
    case "list":
    case "bullets":
      return "checklist";
    default:
      return null;
  }
}

function normalizeNoticeTone(value: string | null): NoticeBlock["tone"] {
  const normalized = value?.trim().toLowerCase().replace(/[\s-]+/g, "_");

  if (normalized === "warning") return "warning";
  if (normalized === "success") return "success";
  return "neutral";
}

function readChecklistItems(source: Record<string, unknown>): string[] {
  const candidates = [source.items, source.values, source.list];

  for (const value of candidates) {
    if (Array.isArray(value)) {
      const items = value
        .map((entry) => {
          if (typeof entry === "string") return entry.trim();
          const object = asObject(entry);
          if (!object) return "";
          return readString(object, ["text", "label", "value", "title"]) || "";
        })
        .filter(Boolean);

      if (items.length) return items;
    }

    if (typeof value === "string") {
      const items = value
        .split(/\r?\n|;|\|/)
        .map((entry) => entry.trim())
        .filter(Boolean);
      if (items.length) return items;
    }
  }

  return [];
}

function normalizeBlock(entry: unknown, index: number): DirectusPageBlock | null {
  const source = asObject(entry);
  if (!source) return null;

  const enabled = readBoolean(source, ["enabled", "is_enabled", "active"]);
  if (enabled === false) return null;

  const type = normalizeBlockType(readString(source, ["type", "kind", "component", "block", "_type"]));
  if (!type) return null;

  const id = readString(source, ["id", "key", "slug", "name"]) || `block-${index + 1}`;

  if (type === "rich_text") {
    const html =
      readString(source, ["html", "body", "content"]) ||
      plainTextToHtml(readString(source, ["text", "description"]));

    if (!html || !stripHtml(html)) return null;

    return {
      id,
      type,
      eyebrow: readString(source, ["eyebrow", "kicker"]) ?? undefined,
      title: readString(source, ["title", "heading"]) ?? undefined,
      html,
    };
  }

  if (type === "cta") {
    const title = readString(source, ["title", "heading"]);
    const description = readString(source, ["description", "text", "subtitle"]);
    const buttonText = readString(source, ["button_text", "button_label", "cta_text", "button"]) || "Leave request";
    const buttonHref = readString(source, ["button_href", "button_link", "href", "url"]) || "/#lead";

    if (!title && !description) return null;

    return {
      id,
      type,
      title: title ?? undefined,
      description: description ?? undefined,
      buttonText,
      buttonHref,
      buttonVariant: asButtonVariant(readString(source, ["button_variant", "variant"])),
    };
  }

  if (type === "notice") {
    const text = readString(source, ["text", "description", "content", "body"]);
    if (!text) return null;

    return {
      id,
      type,
      title: readString(source, ["title", "heading"]) ?? undefined,
      text,
      tone: normalizeNoticeTone(readString(source, ["tone", "variant"])),
    };
  }

  const items = readChecklistItems(source);
  if (!items.length) return null;

  return {
    id,
    type: "checklist",
    title: readString(source, ["title", "heading"]) ?? undefined,
    items,
  };
}

export function parseDirectusPageBlocks(rawBlocks: unknown): DirectusPageBlock[] {
  if (!Array.isArray(rawBlocks)) return [];

  return rawBlocks
    .map((entry, index) => normalizeBlock(entry, index))
    .filter((entry): entry is DirectusPageBlock => entry !== null);
}

function renderBlock(block: DirectusPageBlock): ReactNode {
  if (block.type === "rich_text") {
    return (
      <section className="directus-block directus-block--rich-text" key={block.id}>
        {block.eyebrow ? <p className="directus-block__eyebrow">{block.eyebrow}</p> : null}
        {block.title ? <h3 className="directus-block__title">{block.title}</h3> : null}
        <div className="content content--wide directus-block__content" dangerouslySetInnerHTML={{ __html: block.html }} />
      </section>
    );
  }

  if (block.type === "cta") {
    return (
      <section className="directus-block directus-block--cta" key={block.id}>
        <div className="directus-block__cta-inner">
          {block.title ? <h3 className="directus-block__title">{block.title}</h3> : null}
          {block.description ? <p className="directus-block__description">{block.description}</p> : null}
          <ActionLink className="directus-block__button" href={block.buttonHref} variant={block.buttonVariant}>
            {block.buttonText}
          </ActionLink>
        </div>
      </section>
    );
  }

  if (block.type === "notice") {
    return (
      <section className={`directus-block directus-block--notice directus-block--notice-${block.tone}`} key={block.id}>
        {block.title ? <h3 className="directus-block__title">{block.title}</h3> : null}
        <p className="directus-block__description">{block.text}</p>
      </section>
    );
  }

  return (
    <section className="directus-block directus-block--checklist" key={block.id}>
      {block.title ? <h3 className="directus-block__title">{block.title}</h3> : null}
      <ul className="directus-block__list">
        {block.items.map((item, index) => (
          <li key={`${block.id}-item-${index}`}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

export function DirectusPageBlocks({ blocks }: { blocks: DirectusPageBlock[] }) {
  if (!blocks.length) return null;

  return <div className="directus-blocks">{blocks.map((block) => renderBlock(block))}</div>;
}
