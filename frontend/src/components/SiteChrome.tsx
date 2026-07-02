import Image from "next/image";
import Link from "next/link";
import type { NavLink } from "@/lib/content";
import { CITY_DIRECTORY_LINKS, CITY_DIRECTORY_PATH } from "@/lib/cityDirectory";
import { siteContacts } from "@/lib/site";
import { LEGACY_SERVICE_LINKS, STATIC_SERVICE_LINKS } from "@/lib/staticServices";
import { ActionLink } from "@/components/ui/Button";
import { ContactLink } from "@/components/ui/ContactLinks";
import { Input } from "@/components/ui/Input";
import { ChevronDownIcon, DownloadIcon, MailIcon, PhoneIcon, PinIcon, SearchIcon, TelegramIcon, WhatsAppIcon } from "@/components/ui/icons";

type NavigationData = {
  equipmentTypes: NavLink[];
  workTypes: NavLink[];
  brands: NavLink[];
};

type DownloadNavLink = {
  name: string;
  href: string;
  downloadFileName: string;
};

const FOOTER_MENU_LINKS: NavLink[] = [
  { name: "Главная", url_path: "/" },
  { name: "Услуги", url_path: "/#services" },
  { name: "Контакты", url_path: "/contacty/" },
  { name: "О нас", url_path: "/o-nas/" },
  { name: "Доставка и оплата", url_path: "/dostabka-i-oplata/" },
  { name: "Политика конфиденциальности", url_path: "/policy/" },
  { name: "Блог", url_path: "/blog/" },
  { name: "Отзывы", url_path: "/otzivy-katet/" },
];

const FOOTER_DOWNLOAD_LINKS: DownloadNavLink[] = [
  {
    name: "Наши реквизиты",
    href: "/assets/katet/downloads/katet-rekvizity.pdf",
    downloadFileName: "katet-rekvizity.pdf",
  },
  {
    name: "Договор",
    href: "/assets/katet/downloads/katet-dogovor-arendy-2025.pdf",
    downloadFileName: "katet-dogovor-arendy-2025.pdf",
  },
];

const FOOTER_SERVICE_LINKS: NavLink[] = [...LEGACY_SERVICE_LINKS];

const FOOTER_RENT_LINKS: NavLink[] = [
  { name: "Аренда автовышки", url_path: "/arenda/arenda-avtovishek-v-moskve/" },
  { name: "Аренда автокрана", url_path: "/arenda/arenda-avtokrana/" },
  { name: "Услуги бульдозера", url_path: "/arenda/arenda-buldozera-v-moskve/" },
  { name: "Аренда длинномера", url_path: "/arenda/arenda-dlinnomerov-v-moskve/" },
  { name: "Услуги илососа", url_path: "/arenda/arenda-ilososov-v-moskve/" },
  { name: "Аренда грунтового катка", url_path: "/arenda/arenda-gruntovogo-katka/" },
  { name: "Аренда компрессора", url_path: "/arenda/arenda-kompressorov-v-moskve/" },
  { name: "Аренда манипулятора", url_path: "/arenda/arenda-manipulyatora/" },
  { name: "Аренда подъемника", url_path: "/arenda/arenda-podemnikov-v-moskve/" },
  { name: "Аренда поливомоечных машин", url_path: "/arenda/arenda-polivomoechnyh-mashin/" },
  { name: "Аренда самосвалов", url_path: "/arenda/arenda-samosvalov-v-moskve/" },
  { name: "Аренда тралов", url_path: "/arenda/arenda-tralov-v-moskve/" },
  { name: "Аренда экскаватора", url_path: "/arenda/arenda-ekskavatorov-v-moskve/" },
  { name: "Аренда колесного экскаватора", url_path: "/arenda/arenda-ekskavatora-na-kolesnom-hodu/" },
  { name: "Услуги гусеничного экскаватора", url_path: "/arenda/gusenichnye-ekskavatory/" },
  { name: "Аренда мини-экскаватора", url_path: "/arenda/arenda-mini-ekskavatorov-v-moskve/" },
  { name: "Услуги экскаватора-погрузчика", url_path: "/arenda/arenda-ekskavatorov-pogruzchikov-v-moskve/" },
  { name: "Услуги мини-погрузчика", url_path: "/arenda/arenda-mini-pogruzchikov-v-moskve/" },
];

const FOOTER_RENT_LABEL_BY_PATH: Record<string, string> = {
  "/arenda/arenda-avtovishek-v-moskve/": "Автовышки",
  "/arenda/arenda-avtokrana/": "Автокраны",
  "/arenda/arenda-buldozera-v-moskve/": "Бульдозеры",
  "/arenda/arenda-dlinnomerov-v-moskve/": "Длинномеры",
  "/arenda/arenda-ilososov-v-moskve/": "Илососы",
  "/arenda/arenda-gruntovogo-katka/": "Грунтовые катки",
  "/arenda/arenda-kompressorov-v-moskve/": "Компрессоры",
  "/arenda/arenda-manipulyatora/": "Манипуляторы",
  "/arenda/arenda-podemnikov-v-moskve/": "Подъемники",
  "/arenda/arenda-polivomoechnyh-mashin/": "Поливомоечные машины",
  "/arenda/arenda-samosvalov-v-moskve/": "Самосвалы",
  "/arenda/arenda-tralov-v-moskve/": "Тралы",
  "/arenda/arenda-ekskavatorov-v-moskve/": "Экскаваторы",
  "/arenda/arenda-ekskavatora-na-kolesnom-hodu/": "Колесные экскаваторы",
  "/arenda/gusenichnye-ekskavatory/": "Гусеничные экскаваторы",
  "/arenda/arenda-mini-ekskavatorov-v-moskve/": "Мини-экскаваторы",
  "/arenda/arenda-ekskavatorov-pogruzchikov-v-moskve/": "Экскаваторы-погрузчики",
  "/arenda/arenda-mini-pogruzchikov-v-moskve/": "Мини-погрузчики",
};

function normalizeFooterRentPath(path: string | null | undefined) {
  if (!path) return "";
  const normalized = path.trim();
  if (!normalized) return "";
  return normalized.endsWith("/") ? normalized : `${normalized}/`;
}

function formatFooterRentCategoryName(label: string, path: string | null | undefined) {
  const normalizedPath = normalizeFooterRentPath(path);
  const mappedLabel = FOOTER_RENT_LABEL_BY_PATH[normalizedPath];
  if (mappedLabel) return mappedLabel;

  const compact = label
    .replace(/^\s*(аренда|услуги)\s+/iu, "")
    .replace(/\s+в\s+москве(?:\s+и\s+области)?\s*$/iu, "")
    .trim();

  if (!compact) return label;
  return compact.charAt(0).toUpperCase() + compact.slice(1);
}

function dedupeNavLinks(links: NavLink[]) {
  const seen = new Set<string>();

  return links.filter((link) => {
    const key = `${link.url_path}::${link.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildServiceLinks(workTypes: NavLink[]) {
  const workHrefByName = new Map(workTypes.map((item) => [item.name, item.url_path]));
  const prioritized = FOOTER_SERVICE_LINKS.map((item) => ({
    ...item,
    url_path: workHrefByName.get(item.name) || item.url_path,
  }));

  return dedupeNavLinks([...prioritized, ...workTypes, ...STATIC_SERVICE_LINKS]);
}

export function SiteHeader({ navigation }: { navigation: NavigationData }) {
  const rentLinks = navigation.equipmentTypes.length ? navigation.equipmentTypes : FOOTER_RENT_LINKS.slice(0, 12);
  const serviceLinks = buildServiceLinks(navigation.workTypes);

  return (
    <header className="katet-masthead">
      <div className="katet-masthead__contacts">
        <div className="container katet-masthead__contacts-inner">
          <div className="katet-masthead__contact-group">
            <span className="katet-masthead__contact katet-masthead__address">
              <PinIcon />
              <span>г. Мытищи, Фуражный проезд, вл. 4, 406</span>
            </span>
            <ContactLink className="katet-masthead__contact" kind="email">
              <MailIcon />
              <span>{siteContacts.email}</span>
            </ContactLink>
            <ContactLink className="katet-masthead__contact" kind="phone">
              <PhoneIcon />
              <span>{siteContacts.phoneDisplay}</span>
            </ContactLink>
          </div>
          <form className="katet-masthead__search" action="/blog/" role="search">
            <SearchIcon />
            <Input name="s" type="search" placeholder="Поиск" aria-label="Поиск" />
          </form>
          <div className="katet-masthead__social" aria-label="Мессенджеры">
            <a href={siteContacts.whatsappHref} target="_blank" rel="noreferrer" aria-label="WhatsApp">
              <WhatsAppIcon />
            </a>
            <a href={siteContacts.telegramHref} target="_blank" rel="noreferrer" aria-label="Telegram">
              <TelegramIcon />
            </a>
          </div>
        </div>
      </div>
      <div className="katet-masthead__nav">
        <div className="container katet-masthead__nav-inner">
          <Link className="katet-masthead__logo" href="/" aria-label="Катет">
            <Image src="/assets/katet/home/logo_white.svg" alt="Катет" width={139} height={54} priority />
          </Link>
          <nav className="katet-masthead__menu" aria-label="Основное меню">
            <HeaderDropdown title="Аренда" href="/arenda/" links={rentLinks} />
            <HeaderDropdown title="Услуги" href="/tipy-rabot/" links={serviceLinks} />
            <HeaderDropdown title="Города" href={CITY_DIRECTORY_PATH} links={CITY_DIRECTORY_LINKS} />
            <Link className="katet-masthead__menu-link" href="/o-nas/">О нас</Link>
            <Link className="katet-masthead__menu-link" href="/contacty/">Контакты</Link>
            <Link className="katet-masthead__menu-link" href="/dostabka-i-oplata/">Доставка и оплата</Link>
            <Link className="katet-masthead__menu-link" href="/blog/">Блог</Link>
          </nav>
          <ActionLink
            className="katet-masthead__callback"
            href="#lead"
            variant="accent"
            size="md"
            data-lead-modal="true"
            data-lead-kind="call"
            data-lead-form-name="Хедер — заказать звонок"
            data-lead-title="Закажите звонок менеджера"
            data-lead-submit="Жду звонка"
          >
            Заказать звонок
          </ActionLink>
        </div>
      </div>
    </header>
  );
}

function HeaderDropdown({ title, href, links }: { title: string; href: string; links: NavLink[] }) {
  return (
    <div className="katet-masthead__menu-item">
      <Link className="katet-masthead__menu-link katet-masthead__menu-link--dropdown" href={href}>
        <span>{title}</span>
        <ChevronDownIcon />
      </Link>
      <div className="katet-masthead__panel">
        {links.slice(0, 14).map((link) => (
          <Link key={`${title}-${link.url_path}`} href={link.url_path}>
            {link.name}
          </Link>
        ))}
      </div>
    </div>
  );
}

export function SiteFooter({ navigation }: { navigation: NavigationData }) {
  const rentHrefByName = new Map(navigation.equipmentTypes.map((item) => [item.name, item.url_path]));
  const serviceLinks = buildServiceLinks(navigation.workTypes);
  const fallbackRentLinks = FOOTER_RENT_LINKS.map((item) => {
    const resolvedPath = rentHrefByName.get(item.name) || item.url_path;

    return {
      ...item,
      name: formatFooterRentCategoryName(item.name, resolvedPath),
      url_path: resolvedPath,
    };
  });
  const rentLinks = dedupeNavLinks([
    ...fallbackRentLinks,
    ...navigation.equipmentTypes.map((item) => ({
        ...item,
        name: formatFooterRentCategoryName(item.name, item.url_path),
      })),
  ]);
  const contractDownloadLink = FOOTER_DOWNLOAD_LINKS.find((link) => link.name === "Договор");
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="container site-footer__frame">
        <div className="footer-grid">
          <div className="footer-column footer-column--menu">
            <h2>Меню</h2>
            <div className="footer-column__links">
              {FOOTER_MENU_LINKS.map((link) => (
                <Link key={link.url_path} href={link.url_path}>
                  <span>{link.name}</span>
                </Link>
              ))}
            </div>

            <div className="site-footer__brand site-footer__brand--compact">
              <Link className="site-footer__logo site-footer__logo--compact" href="/" aria-label="Катет">
                <Image
                  className="u-fluid-img"
                  src="/assets/katet/home/logo_white.svg"
                  alt="Катет"
                  width={198}
                  height={77}
                  loading="lazy"
                />
              </Link>
              <p className="site-footer__tagline site-footer__tagline--compact">
                Аренда спецтехники в Москве и области для строительных, земляных и транспортных задач любой сложности.
              </p>
              <div className="site-footer__downloads site-footer__downloads--compact">
                {FOOTER_DOWNLOAD_LINKS.map((link) => (
                  <a className="footer-link--download" key={link.href} href={link.href} download={link.downloadFileName}>
                    <DownloadIcon />
                    <span>{link.name}</span>
                  </a>
                ))}
              </div>
            </div>
          </div>
          <FooterColumn title="Услуги" links={serviceLinks} />
          <FooterColumn title="Аренда техники" links={rentLinks} />
          <div className="footer-contacts">
            <h2>Контакты</h2>
            <span>Отвечаем в мессенджерах и по телефону без выходных.</span>
            <ContactLink className="footer-contact-link" kind="phone">
              <PhoneIcon />
              <span>{siteContacts.phoneDisplay}</span>
            </ContactLink>
            <ContactLink className="footer-contact-link" kind="email">
              <MailIcon />
              <span>{siteContacts.email}</span>
            </ContactLink>
            <div className="footer-contacts__messengers">
              <ContactLink className="footer-contact-link footer-contact-link--messenger" kind="telegram">
                <TelegramIcon />
                <span>Telegram</span>
              </ContactLink>
              <ContactLink className="footer-contact-link footer-contact-link--messenger" kind="whatsapp">
                <WhatsAppIcon />
                <span>WhatsApp</span>
              </ContactLink>
            </div>
          </div>
        </div>

        <div className="site-footer__bottom">
          <p>© {year} Катет. Аренда спецтехники в Москве и области.</p>
          <div className="site-footer__bottom-links">
            <Link href="/policy/">Политика конфиденциальности</Link>
            {contractDownloadLink ? (
              <a href={contractDownloadLink.href} download={contractDownloadLink.downloadFileName}>
                Договор аренды
              </a>
            ) : (
              <Link href="/dogovor-arendy-specztehniki/">Договор аренды</Link>
            )}
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, links }: { title: string; links: NavLink[] }) {
  return (
    <div className="footer-column">
      <h2>{title}</h2>
      <div className="footer-column__links">
        {links.map((link) => (
          <Link key={link.url_path} href={link.url_path}>
            <span>{link.name}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
