import { metadataForSeoBatchService, SeoBatchServiceLanding } from "@/components/seo/SeoBatchServiceLanding";

export const revalidate = 300;
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function generateMetadata() {
  return metadataForSeoBatchService("ukladka-dorozhnyh-plit");
}

export default function UkladkaDorozhnyhPlitPage() {
  return <SeoBatchServiceLanding serviceKey="ukladka-dorozhnyh-plit" />;
}
