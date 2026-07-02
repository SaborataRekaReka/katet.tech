export const FOUNDATION_DEMOLITION_SERVICE = {
  name: "Демонтаж фундамента",
  url_path: "/demontazh-fundamenta/",
} as const;

export const CONCRETE_DEMOLITION_SERVICE = {
  name: "Демонтаж бетонных конструкций",
  url_path: "/demontazh-betonnyh-konstrukcij/",
} as const;

export const SITE_CLEARING_SERVICE = {
  name: "Расчистка участка спецтехникой",
  url_path: "/raschistka-uchastka-spectehnikoy/",
} as const;

export const PRIVATE_HOUSE_DEMOLITION_SERVICE = {
  name: "Демонтаж частного дома",
  url_path: "/demontazh-chastnogo-doma/",
} as const;

export const LEGACY_SERVICE_LINKS = [
  { name: "Вывоз строительного мусора", url_path: "/tipy-rabot/vyvoz-stroitelnogo-musora/" },
  { name: "Вывоз грунта", url_path: "/tipy-rabot/vyvoz-grunta/" },
  { name: "Вывоз снега", url_path: "/tipy-rabot/vyvoz-snega/" },
  { name: "Демонтаж зданий", url_path: "/tipy-rabot/demontaj-zdaniy/" },
  { name: "Демонтаж бетонного забора", url_path: "/tipy-rabot/demontazh-betonnogo-zabora/" },
  { name: "Монтаж бетонных заборов", url_path: "/tipy-rabot/montazh-betonnyh-zaborov/" },
  { name: "Разработка траншей", url_path: "/tipy-rabot/razrabotka-transhej/" },
  { name: "Разработка карьера", url_path: "/tipy-rabot/razrabotka-karera/" },
  { name: "Перевозка спецтехники", url_path: "/tipy-rabot/perevozka-spectehniki/" },
  { name: "Грузоперевозки по России", url_path: "/tipy-rabot/gruzoperevozki-po-rossii/" },
  { name: "Перевозка нерудных материалов", url_path: "/tipy-rabot/perevozka-nerudnyh-materialov/" },
  { name: "Земляные работы", url_path: "/tipy-rabot/zemlyanye-raboty/" },
  { name: "Разработка котлована", url_path: "/tipy-rabot/razrabotka-kotlovana/" },
  { name: "Выкопать котлован для фундамента", url_path: "/tipy-rabot/vykopat-kotlovan-dlya-fundamenta/" },
] as const;

export const STATIC_SERVICE_LINKS = [
  FOUNDATION_DEMOLITION_SERVICE,
  CONCRETE_DEMOLITION_SERVICE,
  SITE_CLEARING_SERVICE,
  PRIVATE_HOUSE_DEMOLITION_SERVICE,
];

export const ALL_FALLBACK_SERVICE_LINKS = [...LEGACY_SERVICE_LINKS, ...STATIC_SERVICE_LINKS];
