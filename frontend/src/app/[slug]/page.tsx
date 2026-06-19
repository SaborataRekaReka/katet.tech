import { notFound } from "next/navigation";
import { ContentPageView } from "@/components/ContentViews";
import {
  type EquipmentCardRecord,
  type RichPage,
  getBlogCategories,
  getEquipmentIndex,
  getEquipmentIndexForCategorySidebar,
  getEquipmentTypesIndex,
  getPageOrPostByRootSlug,
} from "@/lib/content";
import { metadataFrom } from "@/lib/format";

type Props = { params: Promise<{ slug: string }> };

export const revalidate = 300;

type ArticleEquipmentSection = {
  title: string;
  description?: string;
  items: EquipmentCardRecord[];
};

const ARTICLE_EQUIPMENT_PRESETS: Record<string, { title: string; description: string; keywords: string[]; limit: number; fetchLimit: number }> = {
  "uplotnenie-grunta-katkom": {
    title: "Подходящая спецтехника для уплотнения основания",
    description: "Собрали позиции, которые чаще всего берут для уплотнения грунта, планировки и подготовки площадки.",
    keywords: ["каток", "katok", "грунт", "grunt", "уплотн", "uplotn", "дорож", "dorozh", "вибро", "vibro", "пневмоколес", "kulach"],
    limit: 8,
    fetchLimit: 420,
  },
};

function normalizeSearch(value: string | null | undefined) {
  return (value || "").toLocaleLowerCase("ru-RU").replaceAll("ё", "е");
}

function equipmentSearchText(item: EquipmentCardRecord) {
  const equipmentTypes = (item.equipment_types || []).map((entry) => `${entry.name} ${entry.url_path}`).join(" ");
  const workTypes = (item.work_types || []).map((entry) => `${entry.name} ${entry.url_path}`).join(" ");

  return normalizeSearch(`${item.title} ${item.slug} ${item.excerpt || ""} ${equipmentTypes} ${workTypes}`);
}

function scoreEquipmentMatch(item: EquipmentCardRecord, keywords: string[]) {
  const title = normalizeSearch(item.title);
  const haystack = equipmentSearchText(item);
  let score = 0;

  for (const keyword of keywords) {
    if (!keyword) continue;
    if (title.includes(keyword)) {
      score += 5;
      continue;
    }

    if (haystack.includes(keyword)) {
      score += 2;
    }
  }

  if ((item.equipment_types || []).some((entry) => normalizeSearch(`${entry.name} ${entry.url_path}`).includes("katk") || normalizeSearch(`${entry.name} ${entry.url_path}`).includes("катк"))) {
    score += 6;
  }

  if ((item.work_types || []).some((entry) => {
    const value = normalizeSearch(`${entry.name} ${entry.url_path}`);
    return value.includes("uplotn") || value.includes("уплотн") || value.includes("grunt") || value.includes("грунт");
  })) {
    score += 4;
  }

  return score;
}

async function getArticleEquipmentSection(record: RichPage): Promise<ArticleEquipmentSection | null> {
  const preset = ARTICLE_EQUIPMENT_PRESETS[record.slug];
  if (!preset) return null;

  const equipment = await getEquipmentIndex(preset.fetchLimit);
  const ranked = equipment
    .map((item) => ({ item, score: scoreEquipmentMatch(item, preset.keywords) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title, "ru-RU"));

  if (!ranked.length) return null;

  const items: EquipmentCardRecord[] = [];
  const seen = new Set<string>();

  for (const entry of ranked) {
    if (seen.has(entry.item.slug)) continue;
    seen.add(entry.item.slug);
    items.push(entry.item);
    if (items.length >= preset.limit) break;
  }

  if (!items.length) return null;

  return {
    title: preset.title,
    description: preset.description,
    items,
  };
}

function isCityLandingPath(path: string | null | undefined) {
  if (!path) return false;
  return /^\/arenda-specztehniki-v-[^/]+\/$/iu.test(path);
}

function toIsoDate(value?: string | null) {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const data = await getPageOrPostByRootSlug(decodeURIComponent(slug));
  const base = metadataFrom(data?.record, "Катет");

  if (!data || data.kind !== "post") return base;

  const iso = toIsoDate(data.record.wp_updated_at);

  return {
    ...base,
    openGraph: {
      ...base.openGraph,
      type: "article",
      publishedTime: iso,
      modifiedTime: iso,
    },
  };
}

export default async function RootSlugRoute({ params }: Props) {
  const { slug } = await params;
  const data = await getPageOrPostByRootSlug(decodeURIComponent(slug));

  if (!data) notFound();

  const [cityEquipment, cityCategories, blogCategories, articleEquipmentSection] = await Promise.all([
    data.kind === "page" && isCityLandingPath(data.record.url_path)
      ? getEquipmentIndexForCategorySidebar(160)
      : Promise.resolve(null),
    data.kind === "page" && isCityLandingPath(data.record.url_path)
      ? getEquipmentTypesIndex(120)
      : Promise.resolve(null),
    data.kind === "post" ? getBlogCategories(10) : Promise.resolve(null),
    data.kind === "post" ? getArticleEquipmentSection(data.record) : Promise.resolve(null),
  ]);

  return (
    <ContentPageView
      record={data.record}
      kind={data.kind === "post" ? "Статья" : "Страница"}
      cityEquipment={cityEquipment}
      cityCategories={cityCategories}
      blogCategories={blogCategories}
      articleEquipmentSection={articleEquipmentSection}
    />
  );
}
