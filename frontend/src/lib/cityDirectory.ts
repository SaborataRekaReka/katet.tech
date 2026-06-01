export type CityDirectoryLink = {
  name: string;
  url_path: string;
};

export const CITY_DIRECTORY_PATH = "/goroda/";

export const CITY_DIRECTORY_LINKS: CityDirectoryLink[] = [
  { name: "Мытищи", url_path: "/arenda-specztehniki-v-mytishhah/" },
  { name: "Балашиха", url_path: "/arenda-specztehniki-v-balashihe/" },
  { name: "Домодедово", url_path: "/arenda-specztehniki-v-domodedovo/" },
  { name: "Королёв", url_path: "/arenda-specztehniki-v-korolyove/" },
  { name: "Красногорск", url_path: "/arenda-specztehniki-v-krasnogorske/" },
  { name: "Люберцы", url_path: "/arenda-specztehniki-v-lyuberczah/" },
  { name: "Одинцово", url_path: "/arenda-specztehniki-v-odinczovo/" },
  { name: "Подольск", url_path: "/arenda-specztehniki-v-podolske/" },
  { name: "Щёлково", url_path: "/arenda-specztehniki-v-shhyolkovo/" },
  { name: "Электросталь", url_path: "/arenda-specztehniki-v-elektrostali/" },
];
