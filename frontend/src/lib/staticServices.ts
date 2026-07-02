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

export const STATIC_SERVICE_LINKS = [
  FOUNDATION_DEMOLITION_SERVICE,
  CONCRETE_DEMOLITION_SERVICE,
  SITE_CLEARING_SERVICE,
  PRIVATE_HOUSE_DEMOLITION_SERVICE,
];
