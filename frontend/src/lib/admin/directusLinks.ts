export type DirectusAdminLink = {
  id: "pages" | "posts" | "leads" | "media";
  label: string;
  description: string;
  path: string;
};

const DIRECTUS_LINKS: DirectusAdminLink[] = [
  {
    id: "pages",
    label: "Страницы",
    description: "Статические страницы и блочные секции",
    path: "/content/pages",
  },
  {
    id: "posts",
    label: "Статьи",
    description: "Посты блога и публикации после генерации",
    path: "/content/posts",
  },
  {
    id: "leads",
    label: "Лиды",
    description: "Заявки с сайта и их статусы",
    path: "/content/leads",
  },
  {
    id: "media",
    label: "Медиа",
    description: "Файлы и изображения",
    path: "/content/directus_files",
  },
];

export function directusBaseUrl() {
  return (process.env.NEXT_PUBLIC_DIRECTUS_URL ?? "http://localhost:8055").replace(/\/$/, "");
}

export function directusAdminUrl(path = "") {
  const normalizedPath = path ? (path.startsWith("/") ? path : `/${path}`) : "";
  return `${directusBaseUrl()}/admin${normalizedPath}`;
}

export function getDirectusAdminLinks(): Array<DirectusAdminLink & { href: string }> {
  return DIRECTUS_LINKS.map((link) => ({
    ...link,
    href: directusAdminUrl(link.path),
  }));
}
