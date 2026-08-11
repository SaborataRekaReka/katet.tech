"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ActionLink } from "@/components/ui/Button";
import { ChevronDownIcon, CloseIcon, ListIcon, MailIcon, PhoneIcon, PinIcon, TelegramIcon, WhatsAppIcon } from "@/components/ui/icons";
import { CITY_DIRECTORY_LINKS, CITY_DIRECTORY_PATH } from "@/lib/cityDirectory";
import { SEO_BATCH_SERVICE_LINKS } from "@/lib/seoBatch20260811";
import { siteContacts } from "@/lib/site";
import { ALL_FALLBACK_SERVICE_LINKS } from "@/lib/staticServices";
import styles from "./HomeDispatcherHero.module.css";

type MegaMenuKey = "rent" | "service" | "city";

type MegaMenuEntry = {
  label: string;
  href: string;
  children?: MegaMenuEntry[];
};

type MegaMenuColumn = {
  title: string;
  entries: MegaMenuEntry[];
};

type MobileMenuSection = {
  key: MegaMenuKey;
  title: string;
  href: string;
  panelLabel: string;
  columns: MegaMenuColumn[];
};

type WorkTypeNavLink = {
  name: string;
  url_path: string;
  item_count?: number;
};

type HeaderCityOption = {
  key: string;
  label: string;
  aliases: string[];
};

type CitySelectionState = {
  city: HeaderCityOption;
  source: "auto" | "manual";
};

const CITY_STORAGE_KEY = "katet-header-city";
const DEFAULT_CITY_KEY = "moscow";

const HEADER_CITY_OPTIONS: HeaderCityOption[] = [
  { key: "moscow", label: "Москва", aliases: ["москва", "moscow", "moskva"] },
  { key: "mytishchi", label: "Мытищи", aliases: ["мытищи", "mytishchi", "mytischi"] },
  { key: "balashikha", label: "Балашиха", aliases: ["балашиха", "balashikha"] },
  { key: "domodedovo", label: "Домодедово", aliases: ["домодедово", "domodedovo"] },
  { key: "korolev", label: "Королёв", aliases: ["королев", "korolev", "korolyov"] },
  { key: "krasnogorsk", label: "Красногорск", aliases: ["красногорск", "krasnogorsk"] },
  { key: "lyubertsy", label: "Люберцы", aliases: ["люберцы", "lyubertsy", "lyubercy"] },
  { key: "odintsovo", label: "Одинцово", aliases: ["одинцово", "odintsovo"] },
  { key: "podolsk", label: "Подольск", aliases: ["подольск", "podolsk"] },
  { key: "shchyolkovo", label: "Щёлково", aliases: ["щелково", "shchyolkovo", "schelkovo"] },
  { key: "elektrostal", label: "Электросталь", aliases: ["электросталь", "elektrostal"] },
];

const AUTO_CITY_OPTIONS = HEADER_CITY_OPTIONS.filter((option) => option.key !== DEFAULT_CITY_KEY);
const DEFAULT_CITY = HEADER_CITY_OPTIONS.find((option) => option.key === DEFAULT_CITY_KEY) || HEADER_CITY_OPTIONS[0];

function blurHeaderNavigationFocus() {
  if (typeof document === "undefined") return;
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return;
  if (!active.closest("header nav[aria-label='Основная навигация']")) return;
  active.blur();
}

const RENT_MEGA_COLUMNS: MegaMenuColumn[] = [
  {
    title: "Экскаваторы и манипуляторы",
    entries: [
      {
        label: "Экскаваторы",
        href: "/arenda/arenda-ekskavatorov-v-moskve/",
        children: [
          { label: "Мини-экскаваторы", href: "/arenda/arenda-mini-ekskavatorov-v-moskve/" },
          { label: "Экскаваторы для копки траншей", href: "/arenda/arenda-ekskavatora-dlya-kopki-transhey/" },
          { label: "Экскаваторы на колесном ходу", href: "/arenda/arenda-ekskavatora-na-kolesnom-hodu/" },
          { label: "Гусеничные экскаваторы", href: "/arenda/gusenichnye-ekskavatory/" },
        ],
      },
      {
        label: "Манипуляторы",
        href: "/arenda/arenda-manipulyatora/",
        children: [
          { label: "Манипуляторы-вездеходы", href: "/arenda/arenda-manipulyatora/" },
          { label: "Манипуляторы-длинномеры", href: "/arenda/arenda-manipulyatora/" },
        ],
      },
    ],
  },
  {
    title: "Краны и перевозка",
    entries: [
      { label: "Автовышки", href: "/arenda/arenda-avtovishek-v-moskve/" },
      { label: "Автокраны", href: "/arenda/arenda-avtokrana/" },
      { label: "Длинномеры", href: "/arenda/arenda-dlinnomerov-v-moskve/" },
      { label: "Поливомоечные машины", href: "/arenda/arenda-polivomoechnyh-mashin/" },
      { label: "Самосвалы", href: "/arenda/arenda-samosvalov-v-moskve/" },
      { label: "Тралы", href: "/arenda/arenda-tralov-v-moskve/" },
      { label: "Бульдозеры", href: "/arenda/arenda-buldozera-v-moskve/" },
      { label: "Компрессоры", href: "/arenda/arenda-kompressorov-v-moskve/" },
      { label: "Илососы", href: "/arenda/arenda-ilososov-v-moskve/" },
    ],
  },
  {
    title: "Подъемники и дорожная техника",
    entries: [
      { label: "Экскаваторы-погрузчики", href: "/arenda/arenda-ekskavatorov-pogruzchikov-v-moskve/" },
      { label: "Мини-погрузчики", href: "/arenda/arenda-mini-pogruzchikov-v-moskve/" },
      {
        label: "Строительные подъемники",
        href: "/arenda/arenda-podemnikov-v-moskve/",
        children: [
          { label: "Коленчатые подъемники", href: "/arenda/arenda-podemnikov-v-moskve/" },
          { label: "Ножничные подъемники", href: "/arenda/arenda-podemnikov-v-moskve/" },
          { label: "Телескопические подъемники", href: "/arenda/arenda-podemnikov-v-moskve/" },
        ],
      },
      { label: "Строительная техника", href: "/arenda/" },
      {
        label: "Катки",
        href: "/arenda/arenda-katkov-v-moskve/",
        children: [
          { label: "Дорожные катки", href: "/arenda/arenda-katkov-v-moskve/" },
          { label: "Грунтовые катки", href: "/arenda/arenda-gruntovogo-katka/" },
        ],
      },
    ],
  },
];

const SERVICE_MEGA_COLUMNS: MegaMenuColumn[] = [
  {
    title: "Вывоз и перевозка",
    entries: [
      { label: "Вывоз строительного мусора", href: "/tipy-rabot/vyvoz-stroitelnogo-musora/" },
      { label: "Вывоз грунта", href: "/tipy-rabot/vyvoz-grunta/" },
      { label: "Вывоз снега", href: "/tipy-rabot/vyvoz-snega/" },
      { label: "Перевозка спецтехники", href: "/tipy-rabot/perevozka-spectehniki/" },
      { label: "Грузоперевозки по России", href: "/tipy-rabot/gruzoperevozki-po-rossii/" },
      { label: "Перевозка нерудных материалов", href: "/tipy-rabot/perevozka-nerudnyh-materialov/" },
    ],
  },
  {
    title: "Демонтаж и земляные",
    entries: [
      { label: "Демонтаж зданий", href: "/tipy-rabot/demontaj-zdaniy/" },
      { label: "Демонтаж бетонного забора", href: "/tipy-rabot/demontazh-betonnogo-zabora/" },
      { label: "Монтаж бетонных заборов", href: "/tipy-rabot/montazh-betonnyh-zaborov/" },
      { label: "Земляные работы", href: "/tipy-rabot/zemlyanye-raboty/" },
      { label: "Погрузка грунта", href: "/tipy-rabot/pogruzka-grunta/" },
      {
        label: "Разработка котлована",
        href: "/tipy-rabot/razrabotka-kotlovana/",
        children: [{ label: "Выкопать котлован для фундамента", href: "/tipy-rabot/vykopat-kotlovan-dlya-fundamenta/" }],
      },
    ],
  },
  {
    title: "Площадка и разработка",
    entries: [
      { label: "Разработка траншей", href: "/tipy-rabot/razrabotka-transhej/" },
      { label: "Разработка карьера", href: "/tipy-rabot/razrabotka-karera/" },
      { label: "Все услуги", href: "/tipy-rabot/" },
    ],
  },
];

const CITY_MEGA_COLUMNS: MegaMenuColumn[] = [
  {
    title: "Города Московской области",
    entries: CITY_DIRECTORY_LINKS.map((link) => ({ label: link.name, href: link.url_path })),
  },
];

const PRIMARY_NAV_LINKS: Array<{ label: string; href: string }> = [
  { label: "О нас", href: "/o-nas/" },
  { label: "Доставка и оплата", href: "/dostabka-i-oplata/" },
  { label: "Блог", href: "/blog/" },
  { label: "Контакты", href: "/contacty/" },
];

const MOBILE_MENU_DEFAULT_STATE: Record<MegaMenuKey, boolean> = {
  rent: false,
  service: true,
  city: false,
};

const MOBILE_MENU_SECTIONS: MobileMenuSection[] = [
  {
    key: "rent",
    title: "Аренда",
    href: "/arenda/",
    panelLabel: "Категории спецтехники",
    columns: RENT_MEGA_COLUMNS,
  },
  {
    key: "service",
    title: "Услуги",
    href: "/tipy-rabot/",
    panelLabel: "Категории услуг",
    columns: SERVICE_MEGA_COLUMNS,
  },
  {
    key: "city",
    title: "Города",
    href: CITY_DIRECTORY_PATH,
    panelLabel: "Аренда спецтехники по городам",
    columns: CITY_MEGA_COLUMNS,
  },
];

const MAX_SERVICE_MENU_ENTRIES = 12;

function normalizeMenuHref(href: string) {
  const trimmed = href.trim();
  if (!trimmed) return "/";

  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  if (withLeadingSlash === "/") return withLeadingSlash;

  return withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;
}

function buildColumnsFromEntries(entries: MegaMenuEntry[], title: string, continuationTitles: string[] = []) {
  if (!entries.length) return [];

  const maxPerColumn = 8;
  const columnCount = Math.min(3, Math.ceil(entries.length / maxPerColumn));
  const perColumn = Math.ceil(entries.length / columnCount);
  const columns: MegaMenuColumn[] = [];

  for (let index = 0; index < columnCount; index += 1) {
    const slice = entries.slice(index * perColumn, (index + 1) * perColumn);
    if (!slice.length) continue;

    columns.push({
      title: index === 0 ? title : continuationTitles[index - 1] || title,
      entries: slice,
    });
  }

  return columns;
}

function buildServiceMegaColumns(workTypes?: WorkTypeNavLink[]) {
  const fallbackServiceLinks = [...SEO_BATCH_SERVICE_LINKS, ...ALL_FALLBACK_SERVICE_LINKS];
  const fallbackPaths = new Set(fallbackServiceLinks.map((item) => normalizeMenuHref(item.url_path)));
  const uniqueExtrasByPath = new Map<string, WorkTypeNavLink>();

  for (const item of workTypes || []) {
    const normalizedPath = normalizeMenuHref(item.url_path);
    if (normalizedPath === "/tipy-rabot/" || fallbackPaths.has(normalizedPath)) continue;
    if (uniqueExtrasByPath.has(normalizedPath)) continue;
    uniqueExtrasByPath.set(normalizedPath, { ...item, url_path: normalizedPath });
  }

  const extraWorkTypes = Array.from(uniqueExtrasByPath.values()).sort((left, right) => {
    const countDelta = (right.item_count || 0) - (left.item_count || 0);
    if (countDelta !== 0) return countDelta;

    return left.name.localeCompare(right.name, "ru-RU");
  }).slice(0, MAX_SERVICE_MENU_ENTRIES);

  const entries: MegaMenuEntry[] = [
    ...fallbackServiceLinks.map((item) => ({ label: item.name, href: item.url_path })),
    ...extraWorkTypes.map((item) => ({ label: item.name, href: item.url_path })),
  ];

  return buildColumnsFromEntries(entries, "Популярные услуги", ["Еще услуги", "Другие услуги"]);
}

function normalizeCityName(value: string) {
  return value
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zа-я0-9]+/giu, " ")
    .trim();
}

function findCityByKey(cityKey: string | null | undefined) {
  if (!cityKey) return null;
  return HEADER_CITY_OPTIONS.find((option) => option.key === cityKey) || null;
}

function findCityByName(cityName: string | null | undefined, options = HEADER_CITY_OPTIONS) {
  if (!cityName) return null;

  const normalizedInput = normalizeCityName(cityName);
  if (!normalizedInput) return null;

  for (const option of options) {
    for (const alias of option.aliases) {
      const normalizedAlias = normalizeCityName(alias);
      if (!normalizedAlias) continue;
      if (
        normalizedInput === normalizedAlias ||
        normalizedInput.includes(normalizedAlias) ||
        normalizedAlias.includes(normalizedInput)
      ) {
        return option;
      }
    }
  }

  return null;
}

function readStoredCity() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(CITY_STORAGE_KEY);
  } catch {
    return null;
  }
}

function persistSelectedCity(cityKey: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CITY_STORAGE_KEY, cityKey);
  } catch {
    // Storage can be unavailable in private mode or restricted browsers.
  }
}

export function HomeDispatcherHeader({ workTypes }: { workTypes?: WorkTypeNavLink[] }) {
  const pathname = usePathname();
  const [openMenu, setOpenMenu] = useState<MegaMenuKey | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [mobileOrderCtaProgress, setMobileOrderCtaProgress] = useState(0);
  const [mobileOpenSections, setMobileOpenSections] = useState<Record<MegaMenuKey, boolean>>({
    ...MOBILE_MENU_DEFAULT_STATE,
  });
  const [cityState, setCityState] = useState<CitySelectionState>({ city: DEFAULT_CITY, source: "auto" });
  const [isCityPickerOpen, setIsCityPickerOpen] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cityTriggerRef = useRef<HTMLButtonElement | null>(null);

  const selectedCity = cityState.city;
  const citySelectionSource = cityState.source;

  const serviceMegaColumns = useMemo(() => {
    return buildServiceMegaColumns(workTypes);
  }, [workTypes]);

  const mobileMenuSections = useMemo(() => {
    return MOBILE_MENU_SECTIONS.map((section) => {
      if (section.key !== "service") return section;
      return { ...section, columns: serviceMegaColumns };
    });
  }, [serviceMegaColumns]);

  function clearCloseTimer() {
    if (!closeTimerRef.current) return;
    clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }

  function scheduleClose() {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      setOpenMenu(null);
      closeTimerRef.current = null;
    }, 220);
  }

  function open(menuKey: MegaMenuKey) {
    clearCloseTimer();
    setIsCityPickerOpen(false);
    setOpenMenu(menuKey);
  }

  function closeNow() {
    clearCloseTimer();
    setOpenMenu(null);
    setIsCityPickerOpen(false);
    setIsMobileMenuOpen(false);
    setMobileOrderCtaProgress(0);
    setMobileOpenSections({ ...MOBILE_MENU_DEFAULT_STATE });
    blurHeaderNavigationFocus();
  }

  function openMobileMenu() {
    clearCloseTimer();
    setOpenMenu(null);
    setIsCityPickerOpen(false);
    setMobileOrderCtaProgress(0);
    setIsMobileMenuOpen(true);
  }

  function closeMobileMenu() {
    setIsMobileMenuOpen(false);
    setMobileOpenSections({ ...MOBILE_MENU_DEFAULT_STATE });
  }

  function toggleMobileSection(menuKey: MegaMenuKey) {
    setMobileOpenSections((current) => ({
      ...current,
      [menuKey]: !current[menuKey],
    }));
  }

  function openCityPicker() {
    clearCloseTimer();
    setOpenMenu(null);
    setIsMobileMenuOpen(false);
    setMobileOrderCtaProgress(0);
    setIsCityPickerOpen(true);
  }

  function closeCityPicker(restoreFocus = false) {
    setIsCityPickerOpen(false);
    if (!restoreFocus) return;
    window.setTimeout(() => {
      cityTriggerRef.current?.focus();
    }, 0);
  }

  function selectCity(city: HeaderCityOption) {
    setCityState({ city, source: "manual" });
    persistSelectedCity(city.key);
    closeCityPicker(true);
  }

  useEffect(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    const resetUiTimer = window.setTimeout(() => {
      setOpenMenu(null);
      setIsMobileMenuOpen(false);
      setMobileOrderCtaProgress(0);
      setMobileOpenSections({ ...MOBILE_MENU_DEFAULT_STATE });
      setIsCityPickerOpen(false);
      blurHeaderNavigationFocus();
    }, 0);

    return () => {
      window.clearTimeout(resetUiTimer);
    };
  }, [pathname]);

  useEffect(() => {
    if (!isMobileMenuOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isMobileMenuOpen]);

  useEffect(() => {
    if (!isMobileMenuOpen) return;

    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeMobileMenu();
    };

    const onResize = () => {
      if (window.innerWidth > 1020) {
        closeMobileMenu();
      }
    };

    document.addEventListener("keydown", onEscape);
    window.addEventListener("resize", onResize);

    return () => {
      document.removeEventListener("keydown", onEscape);
      window.removeEventListener("resize", onResize);
    };
  }, [isMobileMenuOpen]);

  useEffect(() => {
    let isCancelled = false;

    const savedCity = findCityByKey(readStoredCity());
    if (savedCity) {
      const savedCityTimer = window.setTimeout(() => {
        if (isCancelled) return;
        setCityState({ city: savedCity, source: "manual" });
      }, 0);

      return () => {
        isCancelled = true;
        window.clearTimeout(savedCityTimer);
      };
    }

    const cityAbortController = new AbortController();
    const cityAbortTimer = window.setTimeout(() => {
      cityAbortController.abort();
    }, 1800);

    async function resolveAutoCity() {
      try {
        const response = await fetch("/api/location/city/", {
          cache: "no-store",
          signal: cityAbortController.signal,
        });
        if (!response.ok) throw new Error("City API request failed");
        const payload = (await response.json()) as { city?: string | null };
        if (isCancelled) return;

        const detectedCity = findCityByName(payload.city, AUTO_CITY_OPTIONS);
        setCityState({ city: detectedCity || DEFAULT_CITY, source: "auto" });
      } catch {
        if (isCancelled) return;
        setCityState({ city: DEFAULT_CITY, source: "auto" });
      } finally {
        window.clearTimeout(cityAbortTimer);
      }
    }

    void resolveAutoCity();

    return () => {
      isCancelled = true;
      window.clearTimeout(cityAbortTimer);
      cityAbortController.abort();
    };
  }, []);

  useEffect(() => {
    if (!isCityPickerOpen) return;

    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeCityPicker(true);
    };

    document.addEventListener("keydown", onEscape);

    return () => {
      document.removeEventListener("keydown", onEscape);
    };
  }, [isCityPickerOpen]);

  useEffect(() => {
    let previousY = window.scrollY;
    const revealOffset = 140;
    const revealDistance = 120;
    const hideDistance = 100;

    const syncMobileOrderCta = () => {
      if (isMobileMenuOpen || isCityPickerOpen) {
        setMobileOrderCtaProgress(0);
        previousY = window.scrollY;
        return;
      }

      if (window.innerWidth > 1020) {
        setMobileOrderCtaProgress(0);
        previousY = window.scrollY;
        return;
      }

      const currentY = window.scrollY;
      const deltaY = currentY - previousY;
      previousY = currentY;

      if (currentY <= revealOffset) {
        setMobileOrderCtaProgress(0);
        return;
      }

      if (deltaY < 0) {
        setMobileOrderCtaProgress((current) => Math.min(1, current + Math.abs(deltaY) / revealDistance));
      } else if (deltaY > 0) {
        setMobileOrderCtaProgress((current) => Math.max(0, current - deltaY / hideDistance));
      }
    };

    const initialSyncTimer = window.setTimeout(syncMobileOrderCta, 0);
    window.addEventListener("scroll", syncMobileOrderCta, { passive: true });
    window.addEventListener("resize", syncMobileOrderCta);

    return () => {
      window.clearTimeout(initialSyncTimer);
      window.removeEventListener("scroll", syncMobileOrderCta);
      window.removeEventListener("resize", syncMobileOrderCta);
    };
  }, [isCityPickerOpen, isMobileMenuOpen, pathname]);

  const isMobileOrderCtaVisible = mobileOrderCtaProgress > 0.02 && !isMobileMenuOpen && !isCityPickerOpen;
  const mobileOrderCtaStyle = {
    "--mobile-order-cta-progress": mobileOrderCtaProgress,
  } as CSSProperties;

  return (
    <header className={styles.header}>
      <div className={styles.headerTopBar}>
        <div className={`container ${styles.headerTop}`}>
          <div className={styles.headerTopInfo}>
            <button
              ref={cityTriggerRef}
              className={`${styles.headerTopItem} ${styles.headerCityTrigger} ${isCityPickerOpen ? styles.headerCityTriggerOpen : ""}`}
              type="button"
              aria-haspopup="dialog"
              aria-expanded={isCityPickerOpen}
              aria-controls="header-city-picker"
              onClick={() => {
                if (isCityPickerOpen) {
                  closeCityPicker();
                  return;
                }
                openCityPicker();
              }}
            >
              <PinIcon aria-hidden="true" />
              <span>Ваш город: {selectedCity.label}</span>
              <ChevronDownIcon className={styles.headerCityChevron} aria-hidden="true" />
            </button>
            <a className={styles.headerTopItem} href="mailto:info@katet.tech">
              <MailIcon aria-hidden="true" />
              <span>info@katet.tech</span>
            </a>
            <a className={`${styles.headerTopItem} ${styles.headerPhone}`} href={siteContacts.headerPhoneHref}>
              <PhoneIcon aria-hidden="true" />
              <span>{siteContacts.headerPhoneDisplay}</span>
            </a>
          </div>

          <div className={styles.headerSocial} aria-label="Мессенджеры">
            <a href={siteContacts.whatsappHref} target="_blank" rel="noreferrer" aria-label="WhatsApp">
              <WhatsAppIcon aria-hidden="true" />
            </a>
            <a href={siteContacts.telegramHref} target="_blank" rel="noreferrer" aria-label="Telegram">
              <TelegramIcon aria-hidden="true" />
            </a>
          </div>
        </div>
      </div>

      <div className={`container ${styles.headerMain}`}>
        <Link className={styles.brand} href="/" aria-label="Катет">
          <Image src="/assets/katet/home/logo_white.svg" alt="Катет" width={139} height={54} priority />
        </Link>

        <div className={styles.mobileQuickActions} aria-label="Быстрые контакты">
          <a href={siteContacts.telegramHref} target="_blank" rel="noreferrer" aria-label="Telegram">
            <TelegramIcon aria-hidden="true" />
          </a>
          <a href={siteContacts.whatsappHref} target="_blank" rel="noreferrer" aria-label="WhatsApp">
            <WhatsAppIcon aria-hidden="true" />
          </a>
        </div>

        <button
          className={styles.mobileMenuToggle}
          type="button"
          aria-label={isMobileMenuOpen ? "Закрыть мобильное меню" : "Открыть мобильное меню"}
          aria-expanded={isMobileMenuOpen}
          aria-controls="katet-mobile-menu"
          onClick={() => {
            if (isMobileMenuOpen) {
              closeMobileMenu();
              return;
            }
            openMobileMenu();
          }}
        >
          {isMobileMenuOpen ? <CloseIcon aria-hidden="true" /> : <ListIcon aria-hidden="true" />}
          <span>{isMobileMenuOpen ? "Закрыть" : "Меню"}</span>
        </button>

        <nav className={styles.menu} aria-label="Основная навигация">
          <MegaMenuDropdown
            menuKey="rent"
            title="Аренда"
            href="/arenda/"
            panelLabel="Категории спецтехники"
            columns={RENT_MEGA_COLUMNS}
            openMenu={openMenu}
            onOpen={open}
            onScheduleClose={scheduleClose}
            onNavigate={closeNow}
          />
          <MegaMenuDropdown
            menuKey="service"
            title="Услуги"
            href="/tipy-rabot/"
            panelLabel="Категории услуг"
            columns={serviceMegaColumns}
            footerAction={{ href: "/tipy-rabot/", label: "Все услуги" }}
            disableGridScroll
            openMenu={openMenu}
            onOpen={open}
            onScheduleClose={scheduleClose}
            onNavigate={closeNow}
          />
          <MegaMenuDropdown
            menuKey="city"
            title="Города"
            href={CITY_DIRECTORY_PATH}
            panelLabel="Аренда спецтехники по городам"
            columns={CITY_MEGA_COLUMNS}
            compact
            openMenu={openMenu}
            onOpen={open}
            onScheduleClose={scheduleClose}
            onNavigate={closeNow}
          />
          {PRIMARY_NAV_LINKS.map((link) => (
            <Link className={styles.menuLink} href={link.href} key={link.href} onClick={closeNow}>{link.label}</Link>
          ))}
        </nav>

        <ActionLink
          className={styles.headerOrderButton}
          href="#lead"
          variant="accent"
          size="sm"
          data-lead-modal="true"
          data-lead-kind="rent"
          data-lead-form-name="Хедер десктоп — быстрый заказ"
          data-lead-title="Оформить быстрый заказ техники"
          data-lead-submit="Отправить заказ"
          onClick={closeNow}
        >
          Быстрый заказ
        </ActionLink>
      </div>

      {isMobileMenuOpen ? (
        <div
          className={styles.mobileDrawerBackdrop}
          onMouseDown={(event) => {
            if (event.target !== event.currentTarget) return;
            closeMobileMenu();
          }}
        >
          <aside
            className={styles.mobileDrawer}
            id="katet-mobile-menu"
            role="dialog"
            aria-modal="true"
            aria-label="Мобильное меню"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className={styles.mobileDrawerHeader}>
              <Link className={styles.mobileDrawerBrand} href="/" aria-label="Катет" onClick={closeNow}>
                <Image src="/assets/katet/home/logo_white.svg" alt="Катет" width={118} height={46} />
              </Link>
              <div className={styles.mobileDrawerMessengerIcons} aria-label="Мессенджеры">
                <a href={siteContacts.telegramHref} target="_blank" rel="noreferrer" aria-label="Telegram">
                  <TelegramIcon aria-hidden="true" />
                </a>
                <a href={siteContacts.whatsappHref} target="_blank" rel="noreferrer" aria-label="WhatsApp">
                  <WhatsAppIcon aria-hidden="true" />
                </a>
              </div>
              <button className={styles.mobileDrawerClose} type="button" onClick={closeMobileMenu} aria-label="Закрыть меню">
                <CloseIcon aria-hidden="true" />
              </button>
            </div>

            <nav className={styles.mobileDrawerNav} aria-label="Навигация по разделам">
              {mobileMenuSections.map((section) => {
                const isSectionOpen = mobileOpenSections[section.key];

                return (
                  <section className={styles.mobileSection} key={section.key} aria-label={section.panelLabel}>
                    <div className={styles.mobileSectionHead}>
                      <Link className={styles.mobileSectionAnchor} href={section.href} onClick={closeNow}>{section.title}</Link>
                      <button
                        className={styles.mobileSectionToggle}
                        type="button"
                        aria-expanded={isSectionOpen}
                        aria-controls={`katet-mobile-section-${section.key}`}
                        onClick={() => toggleMobileSection(section.key)}
                      >
                        <ChevronDownIcon className={`${styles.mobileSectionChevron} ${isSectionOpen ? styles.mobileSectionChevronOpen : ""}`} aria-hidden="true" />
                      </button>
                    </div>

                    {isSectionOpen ? (
                      <div className={styles.mobileSectionPanel} id={`katet-mobile-section-${section.key}`}>
                        {section.columns.map((column) => (
                          <div className={styles.mobileSectionColumn} key={`${section.key}-${column.title}`}>
                            <div className={styles.mobileSectionEntries}>
                              {column.entries.map((entry) => (
                                <div className={styles.mobileSectionEntry} key={`${section.key}-${column.title}-${entry.label}`}>
                                  <Link className={styles.mobileSectionLead} href={entry.href} onClick={closeNow}>{entry.label}</Link>
                                  {entry.children ? (
                                    <div className={styles.mobileSectionChildren}>
                                      {entry.children.map((child) => (
                                        <Link className={styles.mobileSectionChild} key={`${section.key}-${entry.label}-${child.label}`} href={child.href} onClick={closeNow}>{child.label}</Link>
                                      ))}
                                    </div>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </section>
                );
              })}

              <div className={styles.mobileStaticLinks}>
                {PRIMARY_NAV_LINKS.map((link) => (
                  <Link className={styles.mobileStaticLink} href={link.href} key={`mobile-${link.href}`} onClick={closeNow}>{link.label}</Link>
                ))}
              </div>
            </nav>

            <div className={styles.mobileContactsBlock}>
              <ActionLink
                className={styles.mobileQuickOrder}
                href="#lead"
                variant="accent"
                size="sm"
                data-lead-modal="true"
                data-lead-kind="rent"
                data-lead-form-name="Хедер мобайл — быстрый заказ"
                data-lead-title="Оформить быстрый заказ техники"
                data-lead-submit="Отправить заказ"
                onClick={closeNow}
              >
                Быстрый заказ
              </ActionLink>

              <a className={styles.mobileContactRow} href="mailto:info@katet.tech" onClick={closeMobileMenu}>
                <MailIcon aria-hidden="true" />
                <span className={styles.mobileContactText}>
                  <strong>info@katet.tech</strong>
                  <small>Почта для заявок и коммерческих предложений</small>
                </span>
              </a>

              <a className={styles.mobileContactRow} href={siteContacts.headerPhoneHref} onClick={closeMobileMenu}>
                <PhoneIcon aria-hidden="true" />
                <span className={styles.mobileContactText}>
                  <strong>{siteContacts.headerPhoneDisplay}</strong>
                  <small>На связи ежедневно с 8:00 до 22:00</small>
                </span>
              </a>

              <div className={styles.mobileMessengerGrid} aria-label="Связь в мессенджерах">
                <a className={styles.mobileMessengerLink} href={siteContacts.telegramHref} target="_blank" rel="noreferrer">
                  <TelegramIcon aria-hidden="true" />
                  <span>Telegram</span>
                </a>
                <a className={styles.mobileMessengerLink} href={siteContacts.whatsappHref} target="_blank" rel="noreferrer">
                  <WhatsAppIcon aria-hidden="true" />
                  <span>WhatsApp</span>
                </a>
              </div>
            </div>
          </aside>
        </div>
      ) : null}

      {isCityPickerOpen ? (
        <div
          className={styles.cityPickerBackdrop}
          onMouseDown={(event) => {
            if (event.target !== event.currentTarget) return;
            closeCityPicker(true);
          }}
        >
          <section
            id="header-city-picker"
            className={styles.cityPickerDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="header-city-picker-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className={styles.cityPickerHead}>
              <p className={styles.cityPickerEyebrow}>
                {citySelectionSource === "manual" ? "Выбрано вручную" : "Определено автоматически"}
              </p>
              <button
                className={styles.cityPickerClose}
                type="button"
                onClick={() => closeCityPicker(true)}
                aria-label="Закрыть выбор города"
              >
                Закрыть
              </button>
            </div>

            <h2 className={styles.cityPickerTitle} id="header-city-picker-title">Выберите город</h2>

            <div className={styles.cityPickerList} role="listbox" aria-label="Список городов">
              {HEADER_CITY_OPTIONS.map((city) => {
                const isActive = city.key === selectedCity.key;
                return (
                  <button
                    key={city.key}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    className={`${styles.cityOption} ${isActive ? styles.cityOptionActive : ""}`}
                    onClick={() => selectCity(city)}
                  >
                    {city.label}
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      ) : null}

      <ActionLink
        className={`${styles.mobileScrollOrderCta} ${isMobileOrderCtaVisible ? styles.mobileScrollOrderCtaVisible : ""}`}
        style={mobileOrderCtaStyle}
        href="#lead"
        variant="accent"
        size="md"
        data-lead-modal="true"
        data-lead-kind="rent"
        data-lead-form-name="Мобильная кнопка — заказать технику"
        data-lead-title="Заказать технику"
        data-lead-submit="Отправить заявку"
        onClick={() => {
          closeNow();
          setMobileOrderCtaProgress(0);
        }}
      >
        Заказать технику
      </ActionLink>
    </header>
  );
}

function MegaMenuDropdown({
  menuKey,
  title,
  href,
  panelLabel,
  columns,
  compact = false,
  footerAction,
  disableGridScroll = false,
  openMenu,
  onOpen,
  onScheduleClose,
  onNavigate,
}: {
  menuKey: MegaMenuKey;
  title: string;
  href: string;
  panelLabel: string;
  columns: MegaMenuColumn[];
  compact?: boolean;
  footerAction?: { href: string; label: string };
  disableGridScroll?: boolean;
  openMenu: MegaMenuKey | null;
  onOpen: (menuKey: MegaMenuKey) => void;
  onScheduleClose: () => void;
  onNavigate: () => void;
}) {
  const isOpen = openMenu === menuKey;

  return (
    <div
      className={`${styles.menuItem} ${styles.menuItemMega} ${compact ? styles.menuItemMegaCompact : ""} ${isOpen ? styles.menuItemMegaOpen : ""}`}
      onMouseEnter={() => onOpen(menuKey)}
      onMouseLeave={onScheduleClose}
      onFocus={() => onOpen(menuKey)}
      onBlur={onScheduleClose}
    >
      <Link className={styles.menuLink} href={href} onMouseEnter={() => onOpen(menuKey)} onClick={onNavigate}>
        <span>{title}</span>
        <ChevronDownIcon className={styles.menuChevron} aria-hidden="true" />
      </Link>
      <div
        className={`${styles.megaMenu} ${compact ? styles.megaMenuCompact : ""} ${isOpen ? styles.megaMenuOpen : ""}`}
        aria-label={panelLabel}
        onMouseEnter={() => onOpen(menuKey)}
        onMouseLeave={onScheduleClose}
      >
        <div className={`${styles.megaGrid} ${compact ? styles.megaGridSingle : ""} ${disableGridScroll ? styles.megaGridNoScroll : ""}`}>
          {columns.map((column, columnIndex) => (
            <div className={styles.megaColumn} key={`${title}-mega-column-${columnIndex}`}>
              <p className={styles.megaColumnTitle}>{column.title}</p>
              {column.entries.map((entry) => (
                <div className={styles.megaGroup} key={entry.label}>
                  <Link className={`${styles.megaLead} ${entry.children ? styles.megaLeadGroup : styles.megaLeadStandalone}`} href={entry.href} onClick={onNavigate}>
                    {entry.label}
                  </Link>
                  {entry.children ? (
                    <div className={styles.megaChildren}>
                      {entry.children.map((child) => (
                        <Link className={styles.megaChild} key={child.label} href={child.href} onClick={onNavigate}>{child.label}</Link>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ))}
        </div>
        {footerAction ? (
          <div className={styles.megaMenuFooter}>
            <ActionLink className={styles.megaMenuFooterAction} href={footerAction.href} variant="outline" size="lg" onClick={onNavigate}>
              {footerAction.label}
            </ActionLink>
          </div>
        ) : null}
      </div>
    </div>
  );
}
