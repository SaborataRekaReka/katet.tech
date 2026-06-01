import { permanentRedirect } from "next/navigation";

type Props = { params: Promise<{ slug: string }> };

export default async function RequestTagRoute({ params }: Props) {
  await params;
  permanentRedirect("/arenda_spetstekhniki/");
}