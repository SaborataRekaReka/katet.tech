import type { Metadata } from "next";
import { Exo_2, IBM_Plex_Sans } from "next/font/google";
import { LeadRequestModal } from "@/components/forms/LeadRequestModal";
import { LegacyExternalScripts } from "@/components/analytics/LegacyExternalScripts";
import { SiteFooter } from "@/components/SiteChrome";
import { HomeDispatcherHeader } from "@/components/home/HomeDispatcherHeader";
import { getNavigationData } from "@/lib/content";
import "./tokens.css";
import "./globals.css";
import "./styles/pages.css";
import "./styles/blog-footer.css";

export const revalidate = 300;

const bodyFont = IBM_Plex_Sans({
  subsets: ["latin", "cyrillic"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
  variable: "--font-body-next",
});

const displayFont = Exo_2({
  subsets: ["latin", "cyrillic"],
  weight: ["300", "400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-display-next",
});

const primaryYandexCounterId = (process.env.NEXT_PUBLIC_YANDEX_COUNTER_IDS || "89111072")
  .split(",")
  .map((value) => value.trim())
  .find(Boolean) || "89111072";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://katet.tech"),
  title: {
    default: "Катет — Аренда спецтехники в Москве и области",
    template: "%s",
  },
  description: "Аренда спецтехники с экипажем: автокраны, экскаваторы, автовышки, самосвалы, тралы и другая техника.",
  icons: {
    icon: [{ url: "/fav.svg", type: "image/svg+xml" }],
    shortcut: ["/fav.svg"],
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const navigation = await getNavigationData();

  return (
    <html lang="ru">
      <body className={`${bodyFont.variable} ${displayFont.variable}`}>
        <HomeDispatcherHeader workTypes={navigation.workTypes} />
        <main>{children}</main>
        <SiteFooter navigation={navigation} />
        <LegacyExternalScripts />
        <LeadRequestModal />
        <noscript>
          <div>
            <img
              src={`https://mc.yandex.ru/watch/${primaryYandexCounterId}`}
              style={{ position: "absolute", left: "-9999px" }}
              alt=""
            />
          </div>
        </noscript>
      </body>
    </html>
  );
}
