// Default company-context preset for katet.tech (аренда спецтехники).
// Used to bootstrap the pipeline quickly; the operator can edit/extend it in admin.

export const DEFAULT_CONTEXT_PRESET: {
  context_type: string;
  name: string;
  description?: string;
}[] = [
  // --- services / equipment ---
  { context_type: "service_category", name: "аренда спецтехники", description: "Аренда строительной и специальной техники с экипажем в Москве и области." },
  { context_type: "equipment_type", name: "аренда экскаватора", description: "Гусеничные и колёсные экскаваторы для земляных работ." },
  { context_type: "equipment_type", name: "аренда экскаватора-погрузчика", description: "Универсальная техника для копки и погрузки." },
  { context_type: "equipment_type", name: "аренда автокрана", description: "Автокраны разной грузоподъёмности для подъёмных работ." },
  { context_type: "equipment_type", name: "аренда самосвала", description: "Самосвалы для вывоза грунта, мусора и доставки сыпучих материалов." },
  { context_type: "equipment_type", name: "аренда манипулятора", description: "Бортовые автомобили с КМУ для перевозки и погрузки грузов." },
  { context_type: "equipment_type", name: "аренда фронтального погрузчика", description: "Фронтальные погрузчики для перемещения сыпучих материалов." },
  { context_type: "equipment_type", name: "аренда ямобура", description: "Бурение скважин под сваи, столбы и фундаменты." },
  { context_type: "equipment_type", name: "аренда бульдозера", description: "Бульдозеры для планировки и разработки грунта." },
  { context_type: "equipment_type", name: "аренда автовышки", description: "Автовышки для работ на высоте." },

  // --- tasks ---
  { context_type: "task", name: "разработка котлована", description: "Земляные работы под фундамент и коммуникации." },
  { context_type: "task", name: "вывоз грунта", description: "Погрузка и вывоз грунта со строительной площадки." },
  { context_type: "task", name: "планировка участка", description: "Выравнивание и подготовка территории." },
  { context_type: "task", name: "погрузочно-разгрузочные работы", description: "Подъём и перемещение грузов на объекте." },

  // --- regions ---
  { context_type: "region", name: "Москва" },
  { context_type: "region", name: "Московская область" },

  // --- advantages ---
  { context_type: "advantage", name: "техника с экипажем", description: "Вся техника подаётся с опытным машинистом." },
  { context_type: "advantage", name: "подача в день обращения", description: "Быстрая подача техники на объект." },
  { context_type: "advantage", name: "собственный автопарк", description: "Большой парк исправной техники." },

  // --- restrictions ---
  { context_type: "restriction", name: "работаем только по Москве и области", description: "География ограничена Москвой и Московской областью." },
  { context_type: "restriction", name: "только аренда, без продажи техники" },

  // --- forbidden topics ---
  { context_type: "forbidden_topic", name: "купить спецтехнику" },
  { context_type: "forbidden_topic", name: "продажа техники" },
  { context_type: "forbidden_topic", name: "вакансии" },
  { context_type: "forbidden_topic", name: "ремонт своими руками" },

  // --- faq ---
  { context_type: "faq", name: "сколько стоит аренда спецтехники", description: "Вопрос о стоимости аренды." },
  { context_type: "faq", name: "как заказать спецтехнику с экипажем", description: "Вопрос о порядке заказа." },
  { context_type: "faq", name: "минимальный заказ аренды техники", description: "Вопрос о минимальном времени аренды." },
];
