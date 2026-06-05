import { getContextItems } from "@/lib/seo/queries";
import { ContextManager } from "./ContextManager";
import styles from "../seo-admin.module.css";

export const dynamic = "force-dynamic";

type ContextRow = {
  id: number;
  context_type: string;
  name: string;
  description: string | null;
  is_active: boolean;
  is_allowed_for_seo: boolean;
};

export default async function ContextPage() {
  const items = (await getContextItems()) as unknown as ContextRow[];
  return (
    <div>
      <h1 className={styles.h1}>Контекст компании</h1>
      <p className={styles.muted}>
        Универсальные пары «поинт → значение» (например, «адрес» → «Москва...», «время работы» → «09:00-21:00»).
      </p>
      <ContextManager initial={items} />
    </div>
  );
}
