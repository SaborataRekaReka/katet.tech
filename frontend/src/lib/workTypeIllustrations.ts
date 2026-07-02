const MANUAL_WORK_TYPE_ILLUSTRATIONS_BY_SLUG: Record<string, string> = {
  "vyvoz-grunta": "/assets/katet/services/Вывоз грунта.jpg",
  "vyvoz-stroitelnogo-musora": "/assets/katet/services/Вывоз строительного мусора.jpg",
  "pogruzka-grunta": "/assets/katet/services/Земляные работы.jpg",
  "demontaj-zdaniy": "/assets/katet/services/Демонтаж зданий.jpg",
  "zemlyanye-raboty": "/assets/katet/services/Земляные работы.jpg",
  "razrabotka-kotlovana": "/assets/katet/services/Разработка котлованов.jpg",
  "razrabotka-karera": "/assets/katet/services/Разработка карьеров.jpg",
  "negabaritnye-perevozki-tralom": "/assets/katet/services/Неабаритные перевозки.jpg",
};

const GENERATED_WORK_TYPE_ILLUSTRATIONS_DIR_URL = "/assets/katet/services/generated";
const GENERATED_WORK_TYPE_ILLUSTRATIONS_BY_SLUG: Record<string, string> = {
  "demontazh-betonnyh-konstrukcij": `${GENERATED_WORK_TYPE_ILLUSTRATIONS_DIR_URL}/demontazh-betonnyh-konstrukcij.png`,
  "demontazh-betonnogo-zabora": `${GENERATED_WORK_TYPE_ILLUSTRATIONS_DIR_URL}/demontazh-betonnogo-zabora.png`,
  "demontazh-chastnogo-doma": `${GENERATED_WORK_TYPE_ILLUSTRATIONS_DIR_URL}/demontazh-chastnogo-doma.png`,
  "demontazh-fundamenta": `${GENERATED_WORK_TYPE_ILLUSTRATIONS_DIR_URL}/demontazh-fundamenta.png`,
  "gruzoperevozki-po-rossii": `${GENERATED_WORK_TYPE_ILLUSTRATIONS_DIR_URL}/gruzoperevozki-po-rossii.png`,
  "gruzovoj-trall-dlya-perevozki-traktora": `${GENERATED_WORK_TYPE_ILLUSTRATIONS_DIR_URL}/gruzovoj-trall-dlya-perevozki-traktora.png`,
  "montazh-betonnykh-zaborov": `${GENERATED_WORK_TYPE_ILLUSTRATIONS_DIR_URL}/montazh-betonnykh-zaborov.png`,
  "perevozka-buldozera": `${GENERATED_WORK_TYPE_ILLUSTRATIONS_DIR_URL}/perevozka-buldozera.png`,
  "perevozka-bytovok-manipulyatorom": `${GENERATED_WORK_TYPE_ILLUSTRATIONS_DIR_URL}/perevozka-bytovok-manipulyatorom.png`,
  "perevozka-ehkskavatorov": `${GENERATED_WORK_TYPE_ILLUSTRATIONS_DIR_URL}/perevozka-ehkskavatorov.png`,
  "perevozka-katka": `${GENERATED_WORK_TYPE_ILLUSTRATIONS_DIR_URL}/perevozka-katka.png`,
  "perevozka-nerudnyh-materialov": `${GENERATED_WORK_TYPE_ILLUSTRATIONS_DIR_URL}/perevozka-nerudnyh-materialov.png`,
  "perevozka-pogruzchika": `${GENERATED_WORK_TYPE_ILLUSTRATIONS_DIR_URL}/perevozka-pogruzchika.png`,
  "perevozka-spectehniki": `${GENERATED_WORK_TYPE_ILLUSTRATIONS_DIR_URL}/perevozka-spectehniki.png`,
  "perevozka-stankov": `${GENERATED_WORK_TYPE_ILLUSTRATIONS_DIR_URL}/perevozka-stankov.png`,
  "razrabotka-grunta": `${GENERATED_WORK_TYPE_ILLUSTRATIONS_DIR_URL}/razrabotka-grunta.png`,
  "razrabotka-transhej": `${GENERATED_WORK_TYPE_ILLUSTRATIONS_DIR_URL}/razrabotka-transhej.png`,
  "raschistka-uchastka-spectehnikoy": `${GENERATED_WORK_TYPE_ILLUSTRATIONS_DIR_URL}/raschistka-uchastka-spectehnikoy.png`,
  "vykopat-kotlovan-pod-fundament": `${GENERATED_WORK_TYPE_ILLUSTRATIONS_DIR_URL}/vykopat-kotlovan-pod-fundament.png`,
  "vyravnivanie-uchastka": `${GENERATED_WORK_TYPE_ILLUSTRATIONS_DIR_URL}/vyravnivanie-uchastka.png`,
  "vyvoz-snega": `${GENERATED_WORK_TYPE_ILLUSTRATIONS_DIR_URL}/vyvoz-snega.png`,

  // Common legacy aliases.
  "montazh-betonnyh-zaborov": `${GENERATED_WORK_TYPE_ILLUSTRATIONS_DIR_URL}/montazh-betonnykh-zaborov.png`,
  "vykopat-kotlovan-dlya-fundamenta": `${GENERATED_WORK_TYPE_ILLUSTRATIONS_DIR_URL}/vykopat-kotlovan-pod-fundament.png`,
  "perevozka-ekskavatorov": `${GENERATED_WORK_TYPE_ILLUSTRATIONS_DIR_URL}/perevozka-ehkskavatorov.png`,
  "perevozka-ekskavatorov-v-moskve": `${GENERATED_WORK_TYPE_ILLUSTRATIONS_DIR_URL}/perevozka-ehkskavatorov.png`,
  "gruzovoy-trall-dlya-perevozki-traktora": `${GENERATED_WORK_TYPE_ILLUSTRATIONS_DIR_URL}/gruzovoj-trall-dlya-perevozki-traktora.png`,
};

export function workTypeSlugFromUrlPath(urlPath: string | null | undefined) {
  if (!urlPath) return null;

  const normalizedPath = urlPath.split("?")[0].replace(/\/+$/u, "");
  if (!normalizedPath) return null;

  const segments = normalizedPath.split("/").filter(Boolean);
  if (!segments.length) return null;

  return segments[segments.length - 1] || null;
}

export function workTypeManualIllustrationByUrlPath(urlPath: string | null | undefined) {
  const slug = workTypeSlugFromUrlPath(urlPath);
  if (!slug) return null;
  return MANUAL_WORK_TYPE_ILLUSTRATIONS_BY_SLUG[slug] || null;
}

export function workTypeGeneratedIllustrationByUrlPath(urlPath: string | null | undefined) {
  const slug = workTypeSlugFromUrlPath(urlPath);
  if (!slug) return null;

  return GENERATED_WORK_TYPE_ILLUSTRATIONS_BY_SLUG[slug] || null;
}

export function workTypeIllustrationByUrlPath(urlPath: string | null | undefined) {
  const generated = workTypeGeneratedIllustrationByUrlPath(urlPath);
  if (generated) return generated;

  const manual = workTypeManualIllustrationByUrlPath(urlPath);
  if (manual) return manual;

  return null;
}

export function getManualWorkTypeIllustrationMap() {
  return { ...MANUAL_WORK_TYPE_ILLUSTRATIONS_BY_SLUG };
}
