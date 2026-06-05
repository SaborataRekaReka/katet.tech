"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./admin-shell.module.css";

type Tab = {
  href: string;
  label: string;
  matchPrefix?: boolean;
};

const tabs: Tab[] = [
  { href: "/admin", label: "Обзор" },
  { href: "/admin/seo", label: "SEO Studio", matchPrefix: true },
];

export function AdminHubNav() {
  const pathname = usePathname();

  return (
    <nav className={styles.topNav} aria-label="Навигация админки">
      {tabs.map((tab) => {
        const active = tab.matchPrefix ? pathname.startsWith(tab.href) : pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`${styles.topNavLink} ${active ? styles.topNavLinkActive : ""}`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
