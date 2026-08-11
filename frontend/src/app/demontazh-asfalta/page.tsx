import { metadataForSeoBatchService, SeoBatchServiceLanding } from "@/components/seo/SeoBatchServiceLanding";

export const revalidate = 300;
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function generateMetadata() {
  return metadataForSeoBatchService("demontazh-asfalta");
}

export default function DemontazhAsfaltaPage() {
  return <SeoBatchServiceLanding serviceKey="demontazh-asfalta" />;
}
