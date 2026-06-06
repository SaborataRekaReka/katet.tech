import Image from "next/image";
import Link from "next/link";
import type { ComponentType } from "react";
import type { EquipmentCardRecord } from "@/lib/content";
import { toDirectusVisualAttr } from "@/lib/directusVisual";
import { assetUrl, excerptFromHtml, formatPrice } from "@/lib/format";
import { Badge } from "@/components/ui/Badge";
import { ActionLink } from "@/components/ui/Button";
import { ActivityIcon, ClockIcon, DropletIcon, MoveIcon, TruckIcon, type IconProps } from "@/components/ui/icons";

export type EquipmentCardVariant = "default" | "archive";

export function archiveShiftPrice(item: EquipmentCardRecord) {
  const value = item.price_raw || item.price_amount;
  const number = Number(value);
  if (Number.isFinite(number)) {
    return {
      main: `${Math.round(number)} р./`,
      period: "смена",
    };
  }

  return {
    main: formatPrice(value),
    period: "",
  };
}

export function archiveHourlyPrice(item: EquipmentCardRecord) {
  const value = Number(item.price_amount || item.price_raw);
  const hours = item.hours_per_shift || 8;
  if (!Number.isFinite(value) || !hours) return null;
  return `${new Intl.NumberFormat("ru-RU").format(Math.round(value / hours)).replace(/\s/g, ".")} р. / час`;
}

export function archiveTitle(title: string) {
  return title.replace(" - ", " — ");
}

function capitalizeFirst(value: string) {
  const text = value.trim();
  if (!text) return text;
  return text.charAt(0).toLocaleUpperCase("ru-RU") + text.slice(1);
}

function archiveTitleParts(title: string) {
  const normalized = archiveTitle(title).trim();
  const [kind, ...rest] = normalized.split(/\s+/);
  if (!kind || !rest.length) {
    return { kind: null as string | null, model: capitalizeFirst(normalized) };
  }

  return {
    kind: capitalizeFirst(kind),
    model: capitalizeFirst(rest.join(" ")),
  };
}

type MetricIcon = ComponentType<IconProps>;

type ArchiveMetric = {
  key: string;
  value: string;
  Icon: MetricIcon;
};

const ARCHIVE_METRIC_PATTERNS: Array<{ pattern: RegExp; Icon: MetricIcon }> = [
  { pattern: /грузопод|тонн|\bт\b/u, Icon: TruckIcon },
  { pattern: /об[ъе]м|куб|м3|литр|\bл\b/u, Icon: DropletIcon },
  { pattern: /мощност|двигател|квт|л\.?с/u, Icon: ActivityIcon },
  { pattern: /длин|ширин|высот|глубин|вылет|габарит/u, Icon: MoveIcon },
  { pattern: /час|смен/u, Icon: ClockIcon },
];

function compactMetricValue(value: string, unit: string | null | undefined) {
  const raw = `${value || ""}${unit ? ` ${unit}` : ""}`.replace(/\s+/g, " ").trim();
  if (!raw || !/\d/u.test(raw)) return null;

  const numericChunk = raw.match(/\d+(?:[.,]\d+)?\s*[a-zа-я%./]+/iu);
  if (numericChunk?.[0]) {
    return numericChunk[0].trim();
  }

  return raw.length > 14 ? `${raw.slice(0, 14).trim()}…` : raw;
}

function metricIconForSpec(key: string, label: string) {
  const source = `${key} ${label}`.toLocaleLowerCase("ru-RU");
  const found = ARCHIVE_METRIC_PATTERNS.find((entry) => entry.pattern.test(source));
  return found?.Icon || ActivityIcon;
}

function archiveMetrics(item: EquipmentCardRecord) {
  const metrics: ArchiveMetric[] = [];

  for (const spec of item.specs || []) {
    const compactValue = compactMetricValue(spec.value, spec.unit);
    if (!compactValue) continue;

    metrics.push({
      key: spec.key,
      value: compactValue,
      Icon: metricIconForSpec(spec.key, spec.label),
    });
  }

  const unique = new Map<string, ArchiveMetric>();
  for (const metric of metrics) {
    if (!unique.has(metric.value)) {
      unique.set(metric.value, metric);
    }
  }

  const result = Array.from(unique.values()).slice(0, 4);

  if (!result.length && item.hours_per_shift) {
    result.push({ key: "hours", value: `${item.hours_per_shift} ч`, Icon: ClockIcon });
  }

  return result;
}

function archiveSpecsSummary(item: EquipmentCardRecord) {
  const specs = (item.specs || [])
    .filter((spec) => spec.value)
    .slice(0, 3)
    .map((spec) => {
      const value = `${spec.value}${spec.unit ? ` ${spec.unit}` : ""}`.trim();
      return `${spec.label} - ${value}`;
    });

  if (specs.length) {
    return specs.join(" / ");
  }

  return excerptFromHtml(item.excerpt, null, 120) || "Техника доступна для аренды с экипажем.";
}

export function EquipmentCard({ item, variant = "default" }: { item: EquipmentCardRecord; variant?: EquipmentCardVariant }) {
  const src = assetUrl(item.image);
  const shiftLabel = item.hours_per_shift ? `${item.hours_per_shift} ч/смена` : "Смена 8 ч";
  const price = formatPrice(item.price_raw || item.price_amount);
  const shiftPrice = archiveShiftPrice(item);
  const hourlyPrice = archiveHourlyPrice(item);
  const isArchive = variant === "archive";
  const title = archiveTitleParts(item.title);
  const metrics = archiveMetrics(item);
  const description = isArchive
    ? archiveSpecsSummary(item)
    : excerptFromHtml(item.excerpt, null, 120) || "Техника доступна для аренды с экипажем.";
  const rootDirectus = toDirectusVisualAttr({
    collection: "equipment_items",
    item: item.id,
    fields: ["title", "excerpt", "price_raw", "price_amount", "hours_per_shift", "featured_file_id", "specs"],
    mode: "drawer",
  });
  const titleDirectus = toDirectusVisualAttr({ collection: "equipment_items", item: item.id, fields: "title", mode: "popover" });
  const descriptionDirectus = toDirectusVisualAttr({ collection: "equipment_items", item: item.id, fields: ["excerpt", "specs"], mode: "modal" });

  if (isArchive) {
    return (
      <article className="equipment-card equipment-card--archive" data-directus={rootDirectus}>
        <div className="equipment-card__body">
          <Badge className="equipment-card__status" tone="success">в наличии</Badge>
          <Link className="equipment-card__media u-pos-rel" href={item.url_path} aria-label={item.title} data-directus={rootDirectus}>
            {src ? (
              <Image
                src={src}
                alt={item.image?.title || item.title}
                fill
                sizes="(max-width: 760px) 88vw, (max-width: 1020px) 46vw, (max-width: 1440px) 24vw, 320px"
                quality={68}
              />
            ) : (
              <span>Катет</span>
            )}
          </Link>

          <div className="equipment-card__title-wrap">
            {title.kind ? <span className="equipment-card__kind">{title.kind}</span> : null}
            <h3>
              <Link href={item.url_path} data-directus={titleDirectus}>{title.model}</Link>
            </h3>
          </div>

          {metrics.length ? (
            <ul className="equipment-card__metrics" aria-label="Ключевые характеристики" data-directus={descriptionDirectus}>
              {metrics.map((metric) => (
                <li key={`${item.id}-${metric.key}-${metric.value}`}>
                  <metric.Icon aria-hidden="true" />
                  <span>{metric.value}</span>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="equipment-card__footer">
            <div className="equipment-card__price-wrap">
              <strong className="equipment-card__price">
                {shiftPrice.main}
                {shiftPrice.period ? <span className="equipment-card__price-period">{shiftPrice.period}</span> : null}
              </strong>
              {hourlyPrice ? <span className="equipment-card__rate">{hourlyPrice}</span> : null}
            </div>
            <ActionLink
              className="equipment-card__rent"
              href="#lead"
              variant="accent"
              data-lead-modal="true"
              data-lead-kind="rent"
              data-lead-form-name="Карточка техники — аренда"
              data-lead-title="Заявка на аренду техники"
              data-lead-topic={item.title}
              data-lead-message={`Интересует аренда: ${item.title}`}
              data-lead-submit="Отправить заявку"
            >
              Арендовать
            </ActionLink>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className="equipment-card" data-directus={rootDirectus}>
      <div className="equipment-card__body">
        <Badge className="equipment-card__status" tone="success">в наличии</Badge>
        <Link className="equipment-card__media u-pos-rel" href={item.url_path} aria-label={item.title} data-directus={rootDirectus}>
          {src ? (
            <Image
              src={src}
              alt={item.image?.title || item.title}
              fill
              sizes="(max-width: 760px) 88vw, (max-width: 1020px) 46vw, (max-width: 1440px) 24vw, 320px"
              quality={68}
            />
          ) : (
            <span>Катет</span>
          )}
        </Link>
        <strong className="equipment-card__price">{price}</strong>
        <h3>
          <Link href={item.url_path} data-directus={titleDirectus}>{item.title}</Link>
        </h3>
        <p data-directus={descriptionDirectus}>{description}</p>
        <div className="equipment-card__chips" aria-label="Условия аренды">
          <span>{shiftLabel}</span>
          <span>С экипажем</span>
        </div>
      </div>
      <div className="equipment-card__actions">
        <ActionLink href={item.url_path} variant="outline">
          Смотреть все
        </ActionLink>
        <ActionLink
          href="/#lead"
          variant="accent"
          data-lead-modal="true"
          data-lead-kind="rent"
          data-lead-form-name="Карточка техники — быстрый заказ"
          data-lead-title="Быстрый заказ техники"
          data-lead-topic={item.title}
          data-lead-message={`Быстрый заказ: ${item.title}`}
        >
          Быстрый заказ
        </ActionLink>
      </div>
    </article>
  );
}