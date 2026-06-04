import type { ContentStatus } from "@/lib/seo/queries";

export const CONTENT_STATUS: Record<ContentStatus, { label: string; badge: string }> = {
  created: { label: "Контент создан", badge: "badgeGreen" },
  awaiting: { label: "Ожидает контента", badge: "badgeAmber" },
  not_recommended: { label: "Не рекомендован", badge: "badgeGray" },
};

/** Manager-friendly label + badge class for a site post / SEO draft status. */
export function articleStatusMeta(status: string): { label: string; badge: string } {
  switch (status) {
    case "publish":
    case "published":
      return { label: "Опубликовано", badge: "badgeGreen" };
    case "draft":
      return { label: "Черновик", badge: "badgeBlue" };
    case "archived":
      return { label: "В архиве", badge: "badgeGray" };
    case "rejected":
      return { label: "Отклонено", badge: "badgeGray" };
    default:
      return { label: "Черновик", badge: "badgeBlue" };
  }
}
