"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./seo-admin.module.css";

const TABS = [
  { href: "/admin/seo", label: "Запросы" },
  { href: "/admin/seo/semantics", label: "Семантика" },
  { href: "/admin/seo/clusters", label: "Кластеры" },
  { href: "/admin/seo/plan", label: "План" },
  { href: "/admin/seo/generate", label: "Генерация" },
  { href: "/admin/seo/articles", label: "Статьи" },
  { href: "/admin/seo/context", label: "Контекст" },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className={styles.nav}>
      {TABS.map((tab) => {
        const active = tab.href === "/admin/seo" ? pathname === tab.href : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`${styles.navLink} ${active ? styles.navLinkActive : ""}`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
