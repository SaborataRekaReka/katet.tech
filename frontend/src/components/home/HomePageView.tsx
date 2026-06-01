import Image from "next/image";
import type { ReviewRecord, TaxonomyPageRecord } from "@/lib/content";
import { LeadCaptureForm } from "@/components/forms/LeadCaptureForm";
import { ReviewsBlock } from "@/components/content/ReviewsBlock";
import { HomeAdvantageCard, type HomeAdvantageTone } from "@/components/home/HomeAdvantageCard";
import { HomeCategoryCard } from "@/components/home/HomeCategoryCard";
import { HomeDispatcherHero } from "@/components/home/HomeDispatcherHero";
import { HomeServiceCard } from "@/components/home/HomeServiceCard";
import { ActionLink } from "@/components/ui/Button";
import { Carousel } from "@/components/ui/Carousel";

const HOME_ADVANTAGES: ReadonlyArray<{ icon: string; title: string; text: string; tone: HomeAdvantageTone }> = [
  {
    icon: "/assets/katet/icons/quality_1.svg",
    title: "100+ видов спецмашин",
    text: "В нашем автопарке вы найдете спецтехнику для любых строительных работ",
    tone: "red",
  },
  {
    icon: "/assets/katet/icons/security_11.svg",
    title: "Допуск Ростехнадзора",
    text: "Ростехнадзор дал разрешение на всю технику в нашем автопарке",
    tone: "blue",
  },
  {
    icon: "/assets/katet/icons/support_1.svg",
    title: "ТТК и Садовое кольцо",
    text: "Вся спецтехника может производить работы в любой части Москвы, в том числе ТТК и Садового кольца",
    tone: "green",
  },
  {
    icon: "/assets/katet/icons/reduction_1.svg",
    title: "Скидки клиентам",
    text: "Предоставляем низкие цены при долгосрочном сотрудничестве",
    tone: "gold",
  },
];

const HOME_BRAND_LOGOS = [
  "/assets/katet/brands/layer1.svg",
  "/assets/katet/brands/surface1.svg",
  "/assets/katet/brands/Group_2.svg",
  "/assets/katet/brands/path11.svg",
  "/assets/katet/brands/Group.svg",
  "/assets/katet/brands/Daewoo_logo_1.svg",
  "/assets/katet/brands/Doosan_logo_1.svg",
  "/assets/katet/brands/g832.svg",
  "/assets/katet/brands/Group-1.svg",
  "/assets/katet/brands/Group_3.svg",
  "/assets/katet/brands/Hitachi_logo_1.svg",
  "/assets/katet/brands/KAMAZ_Logo_1.svg",
  "/assets/katet/brands/layer1-1.svg",
  "/assets/katet/brands/Logo_Haulotte_1.svg",
  "/assets/katet/brands/Vector.svg",
];

type HomeCategoryImageTuning = {
  scale?: number;
  x?: number;
  y?: number;
};

type HomeFleetItem = readonly [
  availability: string,
  sale: string,
  title: string,
  text: string,
  image: string,
  href: string,
  imageTuning?: HomeCategoryImageTuning,
];

const HOME_FLEET_ITEMS: ReadonlyArray<HomeFleetItem> = [
  ["6 в наличии", "Cегодня -5%", "Услуги КамАЗа-автокрана", "Аренда автокрана на шасси КамАЗа в Москве и Московской области на выгодных условиях.", "/assets/katet/fleet/avtokran-klinczy-32-tonny-1-1-1-1.png", "/arenda/uslugi-kamaza-avtokrana/", { scale: 1.08 }],
  ["6 в наличии", "Cегодня -5%", "Аренда экскаватора-погрузчика в Раменском", "Услуги экскаватора-погрузчика в Раменском", "/assets/katet/fleet/jcb_3cx-10-1-3.png", "/arenda/arenda-ekskavatora-pogruzchika-v-ramenskom/", { scale: 1.16 }],
  ["6 в наличии", "", "Услуги манипулятора 7 тонн", "Услуги манипулятора грузоподъемностью 7 тонн в Москве и МО для выполнения погрузочно-разгрузочных работ любой сложности", "/assets/katet/fleet/65115__7_-1-2.png", "/arenda/uslugi-manipulyatora-7-tonn/", { scale: 1.14 }],
  ["8 в наличии", "", "Аренда катка", "Аренда катков в Москве на самых выгодных условиях", "/assets/katet/fleet/211_prev_ui.png", "/arenda/arenda-katkov-v-moskve/", { scale: 1.17 }],
  ["14 в наличии", "Cегодня -15%", "Аренда автовышки", "Автовышки для высотных работ в аренду в Москве.", "/assets/katet/fleet/751cd9a1-aab9-4b7b-b.png", "/arenda/arenda-avtovishek-v-moskve/", { scale: 1.12 }],
  ["16 в наличии", "Cегодня -5%", "Аренда автокрана", "Аренда автокрана в Москве - выгодно, быстро и надежно!", "/assets/katet/fleet/freepik_br_e427661a-718f-4e1a-880b-13261cb6cb44.png", "/arenda/arenda-avtokrana/", { scale: 1.16 }],
  ["5 в наличии", "", "Аренда длинномера", "Длинномеры-вездеходы грузоподъемностью до 25 т.", "/assets/katet/fleet/hyundai-16-25-2.png", "/arenda/arenda-dlinnomerov-v-moskve/", { scale: 1.1 }],
  ["10 в наличии", "", "Аренда манипулятора", "Взять в аренду манипулятор для подъема и транспортировки грузов можно у нас.", "/assets/katet/fleet/image.png", "/arenda/arenda-manipulyatora/", { scale: 1.12 }],
  ["5 в наличии", "", "Аренда мини-экскаватора", "Мини-экскаваторы в аренду для проведения земляных работ в условиях ограниченного пространства.", "/assets/katet/fleet/7171602a-7101-408e-9.png", "/arenda/arenda-mini-ekskavatorov-v-moskve/", { scale: 1.16 }],
  ["8 в наличии", "", "Аренда самосвалов", "КамАЗ, SCANIA, HOWO и др.", "/assets/katet/fleet/55f40cec-24df-4a25-9.png", "/arenda/arenda-samosvalov-v-moskve/"],
  ["12 в наличии", "", "Аренда подъемника", "Услуги строительного подъемника в Москве по выгодной цене.", "/assets/katet/fleet/47ce6ce6-cd69-42e7-8.png", "/arenda/arenda-podemnikov-v-moskve/"],
  ["4 в наличии", "", "Аренда тралов", "У нас можно взять в аренду трал до 90 т грузоподъемности.", "/assets/katet/fleet/tral_1.png", "/arenda/arenda-tralov-v-moskve/"],
  ["13 в наличии", "", "Аренда экскаватора", "", "/assets/katet/fleet/b7502c83-ff61-41e7-a.png", "/arenda/arenda-ekskavatorov-v-moskve/"],
  ["23 в наличии", "", "Аренда экскаватора для копки траншей", "Большой выбор экскаваторов для копки траншей и разработки котлованов.", "/assets/katet/fleet/hitachi_zx330lc-5-1-2-2.png", "/arenda/arenda-ekskavatora-dlya-kopki-transhey/"],
  ["5 в наличии", "", "Аренда экскаватора на колесном ходу", "Колесные экскаваторы VOLVO, Hitachi, Doosan, Caterpillar, CASE, JCB", "/assets/katet/fleet/caterpillar_m315d-5-4.png", "/arenda/arenda-ekskavatora-na-kolesnom-hodu/"],
  ["6 в наличии", "", "Аренда ножничного подъемника", "Ножничные подъемники в Москве", "/assets/katet/fleet/haulotte_compact_1-2-5-1.png", "/arenda/nozhnichnye-podemniki-v-moskve/"],
  ["12 в наличии", "", "Услуги бульдозера", "", "/assets/katet/fleet/039e86f2-d36f-4575-8.png", "/arenda/arenda-buldozera-v-moskve/"],
  ["7 в наличии", "", "Услуги гусеничного экскаватора", "Экскаваторы на гусеничном ходу для разработки котлованов, траншей и др.", "/assets/katet/fleet/hyundai_r260lc-9s-5-4-2.png", "/arenda/gusenichnye-ekskavatory/"],
  ["4 в наличии", "", "Услуги илососа", "Вместимость цистерны до 20 м3", "/assets/katet/fleet/68677ed0-d58a-4fdb-9.png", "/arenda/arenda-ilososov-v-moskve/"],
  ["6 в наличии", "", "Услуги экскаватора-погрузчика", "Экскаваторы JCB, New Hohland, case и др.", "/assets/katet/fleet/afe67b5c-029d-4808-a.png", "/arenda/arenda-ekskavatorov-pogruzchikov-v-moskve/"],
] as const;

const HOME_SERVICE_ITEMS = [
  ["Демонтаж зданий", "Поможем со сносом старых и ветхих построек, а также с подготовкой площадей под новые строительные объекты. Опытный экипаж выполнит задачи с предельной аккуратностью и соблюдением всех правил безопасности.", "/assets/katet/services/Демонтаж зданий.jpg", "/tipy-rabot/demontaj-zdaniy/"],
  ["Разработка котлованов", "Разработка котлованов является важным этапом перед строительством зданий, дорог и других инженерных сооружений. Этот процесс включает откачивание воды, выемку грунта, укрепление стенок и дна котлована. В нашем автопарке есть спецтехника для любой из этих задач.", "/assets/katet/services/Разработка котлованов.jpg", "/tipy-rabot/razrabotka-kotlovana/"],
  ["Вывоз строительного мусора", "Оперативно вывезем строительный мусор с объекта и подберем подходящую технику под объем работ.", "/assets/katet/services/Вывоз строительного мусора.jpg", "/tipy-rabot/vyvoz-stroitelnogo-musora/"],
  ["Вывоз грунта", "Вывоз грунта необходим при проведении земляных работ, строительстве или реконструкции дорог и инфраструктуры. Очистка участка от лишнего грунта подготовит его для дальнейших работ. В «Катете» вы сможете воспользоваться услугами аренды спецтехники с экипажем, чтобы быстро подготовить площадку для строительства.", "/assets/katet/services/Вывоз грунта.jpg", "/tipy-rabot/vyvoz-grunta/"],
  ["Негабаритные перевозки", "Нужно перевезти крупногабаритные или тяжеловесные грузы, что требует специализированных транспортных средств и особых разрешений? Закажите у нас аренду спецтехники в Москве, и мы поможем транспортировать технику, металлоконструкции, оборудование, пиломатериалы и другие негабаритные товары и материалы.", "/assets/katet/services/Неабаритные перевозки.jpg", "/tipy-rabot/negabaritnye-perevozki-tralom/"],
  ["Земляные работы", "Они включают различные операции по обработке земли, например, выемка, укрепление, планировка грунта. Без мощных и надежных спецмашин тут не обойтись, и мы подберем подходящую спецтехнику, которая поможет выполнить работы быстро и эффективно.", "/assets/katet/services/Земляные работы.jpg", "/tipy-rabot/zemlyanye-raboty/"],
  ["Разработка карьеров", "Вы можете прибегнуть к услугам аренды спецтехники для проведения карьерных работ. Подберем для вас машины для добычи камня, песка, глины и других пород.", "/assets/katet/services/Разработка карьеров.jpg", "/tipy-rabot/razrabotka-karera/"],
] as const;

const HOME_WHY_ITEMS: ReadonlyArray<{ icon: string; text: string }> = [
  { icon: "/assets/katet/icons/security_11.svg", text: "Работаем в сфере строительства более 6 лет" },
  { icon: "/assets/katet/icons/reduction_1.svg", text: "Внушительные скидки постоянным клиентам" },
  { icon: "/assets/katet/icons/quality_1.svg", text: "Низкие цены на рынке спецтехники в Москве и МО" },
  { icon: "/assets/katet/icons/support_1.svg", text: "Решение любых вопросов в пользу клиента" },
  { icon: "/assets/katet/icons/security_11.svg", text: "Вся техника проверяется и имеет разрешения" },
  { icon: "/assets/katet/icons/quality_1.svg", text: "С нами вы не ошибетесь с выбором нужной вам техники" },
];

export function HomeAdvantages() {
  return (
    <section className="home-advantages" aria-label="Преимущества">
      <div className="container home-advantages__grid">
        {HOME_ADVANTAGES.map((item) => (
          <HomeAdvantageCard icon={item.icon} title={item.title} text={item.text} tone={item.tone} key={item.title} />
        ))}
      </div>
    </section>
  );
}

export function HomeIntro() {
  return (
    <section className="home-intro">
      <div className="container">
        <h2 className="home-intro__title">Аренда спецтехники в Москве</h2>
        <p>
          Вам понадобилась аренда спецтехники в Москве? Компания «Катет» станет вашим надежным партнером! У нас один из лучших
          автопарков в столице, насчитывающий более 100 позиций машин. Вся техника своевременно проходит техническое обслуживание и
          имеет допуск от Ростехнадзора. В нашем штате исключительно операторы с опытом: мы тщательно отбираем сотрудников, и у вас
          будет доступ к наиболее квалифицированным специалистам в своей области.
        </p>
        <p>
          Услуги спецтехники у нас включают организацию любых видов работ — от карьерных и строительных до логистических. Просто
          поставьте задачу — и мы предложим оптимальный способ ее решения в кратчайшие сроки с применением современной, мощной и
          производительной спецтехники.
        </p>
      </div>
    </section>
  );
}

export function HomeBrandLogos() {
  return (
    <section className="section section--logos" aria-label="Бренды техники">
      <div className="container logo-strip">
        <div className="logo-strip__track">
          {[0, 1].map((copyIndex) => (
            <div className="logo-strip__group" key={copyIndex} aria-hidden={copyIndex === 1}>
              {HOME_BRAND_LOGOS.map((src, logoIndex) => (
                <div className="logo-strip__item" key={`${copyIndex}-${logoIndex}-${src}`}>
                  <Image src={src} alt={copyIndex === 0 ? "Логотип бренда" : ""} width={180} height={52} loading="lazy" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function HomeFleetGrid({ items }: { items: TaxonomyPageRecord[] }) {
  const hrefByTitle = new Map(items.map((item) => [item.name, item.url_path]));
  const hiddenPreviewTitles = new Set([
    "Услуги КамАЗа-автокрана",
    "Аренда экскаватора-погрузчика в Раменском",
    "Услуги манипулятора 7 тонн",
  ]);
  const previewItems = HOME_FLEET_ITEMS.filter(([, , title]) => !hiddenPreviewTitles.has(title)).slice(0, 8);

  return (
    <section className="section section--fleet" id="park">
      <div className="container section__head section__head--fleet">
        <h2>Лучший автопарк собственной спецтехники в Москве</h2>
        <p>Услуги спецтехники в Москве и области, аренда спецтехники по выгодной цене и без переплат</p>
        <ActionLink href="/arenda/" variant="outline" size="lg">Весь каталог</ActionLink>
      </div>
      <div className="container home-fleet-grid">
        {previewItems.map(([stock, , title, text, image, href, imageTuning]) => (
          <HomeCategoryCard
            key={title}
            availability={stock}
            title={title}
            description={text}
            image={image}
            href={hrefByTitle.get(title) ?? href}
            imageTuning={imageTuning}
          />
        ))}
      </div>
    </section>
  );
}

export function HomeServices() {
  return (
    <section className="section section--services" id="services">
      <div className="container section__head section__head--services">
        <h2>Услуги спецтехники</h2>
        <p>Воспользоваться нашими услугами по аренде спецтехники в Москве и области вы можете для выполнения следующих задач:</p>
        <ActionLink href="/tipy-rabot/" variant="outline" size="lg">Все услуги</ActionLink>
      </div>
      <Carousel
        className="container home-services-carousel"
        ariaLabel="Услуги спецтехники"
        prevAriaLabel="Предыдущая услуга"
        nextAriaLabel="Следующая услуга"
        breakpoints={{ default: 2, widescreen: 2, tablet: 1, mobile: 1 }}
        gap={16}
        showDots
      >
        {HOME_SERVICE_ITEMS.map(([title, text, image, href]) => (
          <HomeServiceCard key={title} title={title} description={text} image={image} href={href} />
        ))}
      </Carousel>
    </section>
  );
}

export function HomeWhyChoose() {
  return (
    <section className="section section--why">
      <div className="container home-why">
        <div className="home-why__copy">
          <h2>Почему выбирают нас</h2>
          <p>
            Предоставляем всем клиентам возможность быстро, удобно и без лишних трат арендовать спецтехнику. В вашем
            распоряжении штат квалифицированных сотрудников, современный автопарк и наш опыт работ в строительной сфере более 6 лет.
          </p>
          <ActionLink
            className="home-why__button"
            href="#lead"
            variant="accent"
            size="lg"
            data-lead-modal="true"
            data-lead-kind="call"
            data-lead-form-name="Главная — почему выбирают"
            data-lead-title="Получить консультацию по аренде"
            data-lead-submit="Жду звонка"
          >
            Заказать звонок
          </ActionLink>
        </div>
        <div className="home-why__grid">
          {HOME_WHY_ITEMS.map((item) => (
            <article className="home-why-card" key={item.text}>
              <span className="home-why-card__icon" aria-hidden="true">
                <Image src={item.icon} alt="" width={22} height={22} loading="lazy" />
              </span>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function HomeOrderForm() {
  return (
    <section className="section section--order" id="order">
      <div className="container home-order">
        <h2>Оформление заказа</h2>
        <LeadCaptureForm
          className="home-order-form"
          formName="Главная"
          fields={[
            { name: "name", label: "Имя", placeholder: "Ваше имя или название компании", required: true },
            { name: "phone", label: "Телефон", type: "tel", placeholder: "+7 (__) ___-__-__", required: true },
          ]}
          consentClassName="home-order-form__acceptance"
          consentPeriodInsideLink={false}
          buttonText="Оформить заказ"
          buttonVariant="accent"
        />
        <p>Ответ в течение ~15 мин.</p>
      </div>
    </section>
  );
}

export function HomePageView({
  equipmentTypes,
  reviews,
}: {
  equipmentTypes: TaxonomyPageRecord[];
  reviews: ReviewRecord[];
}) {
  return (
    <div className="home-page">
      <HomeDispatcherHero />
      <HomeAdvantages />
      <HomeFleetGrid items={equipmentTypes} />
      <HomeServices />
      <ReviewsBlock reviews={reviews} />
      <HomeWhyChoose />
      <HomeSeoText />
    </div>
  );
}

export function HomeSeoText() {
  return (
    <section className="section section--home-text">
      <div className="container content content--wide">
        <h2>Аренда спецтехники в Москве</h2>
        <p>
          Вам понадобилась аренда спецтехники в Москве? Компания «Катет» станет вашим надежным партнером! У нас один из лучших
          автопарков в столице, насчитывающий более 100 позиций машин. Вся техника своевременно проходит техническое обслуживание и
          имеет допуск от Ростехнадзора. В нашем штате исключительно операторы с опытом: мы тщательно отбираем сотрудников, и у вас
          будет доступ к наиболее квалифицированным специалистам в своей области.
        </p>
        <p>
          Услуги спецтехники у нас включают организацию любых видов работ — от карьерных и строительных до логистических. Просто
          поставьте задачу — и мы предложим оптимальный способ ее решения в кратчайшие сроки с применением современной, мощной и
          производительной спецтехники.
        </p>
        <h2>Спецтехника в наличии</h2>
        <p>
          Автопарк «Катет» насчитывает более 100 видов специальной техники, поэтому наше предложение будет выгодным и для
          физлиц, и для крупных компаний. Мы предоставляем следующую технику в аренду:
        </p>
        <ul>
          <li>автокраны – грузоподъемностью до 250 т;</li>
          <li>автовышки – с вылетом стрелы в диапазоне 16-60 м;</li>
          <li>экскаваторы – мощностью до 184 кВт и объемом ковша до 1,8 м3;</li>
          <li>подъемники – с разными механизмами подъема;</li>
          <li>бульдозеры – с шириной отвала до 465 см;</li>
          <li>краны-манипуляторы – грузоподъемностью до 15 т;</li>
          <li>катки – до 13 т;</li>
          <li>самосвалы – вместимостью до 24,5 кубометров;</li>
          <li>экскаваторы-погрузчики – со сменным рабочим оборудованием;</li>
          <li>длинномеры – до 25 т;</li>
          <li>мини-экскаваторы – с глубиной копания до 4,05 м;</li>
          <li>тралы – 4 трала на 25, 45, 60 и 90 т;</li>
          <li>компрессоры – работают с молотками, продувкой, бетоноломами и другим оборудованием;</li>
          <li>мини-погрузчики – есть опции для разных задач;</li>
          <li>илососы – несколько вариантов для откачки сточных вод;</li>
          <li>поливомоечные машины – с зоной мойки до 5 м.</li>
        </ul>
        <h2>Преимущества аренды спецтехники в компании «Катет»</h2>
        <p>
          Наша компания много лет заниматься арендой строительной техники в Москве и Московской области. На настоящий момент
          наш автопарк – один из самых разнообразных в столице. Мы всегда:
        </p>
        <ul>
          <li>подберем подходящие машины при аренде спецтехники;</li>
          <li>обеспечим должное техническое состояние техники;</li>
          <li>укомплектуем машины опытным экипажем;</li>
          <li>при аренде бесплатно доставим строительную технику в пределах МКАД;</li>
          <li>предложим скидки и дополнительные бонусы.</li>
        </ul>
        <p>Оставьте заявку на сайте, чтобы заказать аренду спецтехники в пару кликов, или свяжитесь с нами любым другим способом!</p>
        <h2>Как оформить заказ</h2>
        <p>
          Вам нужна аренда спецтехники в Москве и области прямо сейчас? Наша компания работает круглосуточно, чтобы обеспечить
          вас необходимым оборудованием. Мы понимаем, что задержки могут стоить дорого, поэтому предлагаем максимально
          оперативную обработку заказов. Просто выберите необходимую технику из нашего каталога и свяжитесь с нами удобным для вас способом.
        </p>
        <p>
          Заказать аренду строительной техники в Москве у нас просто. Вы можете обратиться к нам по телефону, указанному на сайте,
          и получить подробную консультацию по всем вопросам, касающимся выбора техники, стоимости аренды и условий договора.
          Наши специалисты – настоящие профессионалы, которые помогут подобрать оптимальную модель, учитывая специфику задач и бюджет.
          Кроме того, вы можете написать письмо на электронную почту или воспользоваться мессенджерами. Еще один вариант — оставить
          заявку прямо на нашем сайте. Заполните специальную форму, указав необходимую информацию о типе техники, датах аренды,
          контактные данные и другие важные детали, и наш менеджер свяжется с вами для подтверждения заказа и уточнения всех нюансов.
        </p>
        <p>Выбирайте наиболее удобный для вас способ аренды спецтехники – мы всегда на связи и готовы помочь вам в решении любых вопросов!</p>
      </div>
    </section>
  );
}