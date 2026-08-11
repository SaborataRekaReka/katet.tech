import { metadataForSeoBatchService, SeoBatchServiceLanding } from "@/components/seo/SeoBatchServiceLanding";

export const revalidate = 300;
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function generateMetadata() {
  return metadataForSeoBatchService("demontazh-metallokonstrukcij");
}

export default function DemontazhMetallokonstrukcijPage() {
  return <SeoBatchServiceLanding serviceKey="demontazh-metallokonstrukcij" />;
}
