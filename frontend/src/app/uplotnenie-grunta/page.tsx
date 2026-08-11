import { metadataForSeoBatchService, SeoBatchServiceLanding } from "@/components/seo/SeoBatchServiceLanding";

export const revalidate = 300;
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function generateMetadata() {
  return metadataForSeoBatchService("uplotnenie-grunta");
}

export default function UplotnenieGruntaPage() {
  return <SeoBatchServiceLanding serviceKey="uplotnenie-grunta" />;
}
