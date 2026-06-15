import { buildYandexEquipmentYml } from "@/lib/yandex-feed";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const xml = await buildYandexEquipmentYml();

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}
