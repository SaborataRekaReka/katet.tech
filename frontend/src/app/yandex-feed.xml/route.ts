import { buildYandexEquipmentYml } from "@/lib/yandex-feed";

export const revalidate = 900;

export async function GET() {
  const xml = await buildYandexEquipmentYml();

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600",
    },
  });
}
