import { metadataForSeoBatchService, SeoBatchServiceLanding } from "@/components/seo/SeoBatchServiceLanding";

export const revalidate = 300;
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function generateMetadata() {
  return metadataForSeoBatchService("obratnaya-zasypka-grunta");
}

export default function ObratnayaZasypkaGruntaPage() {
  return <SeoBatchServiceLanding serviceKey="obratnaya-zasypka-grunta" />;
}
