import Link from "next/link";
import { notFound } from "next/navigation";
import { getArticle } from "@/lib/seo/queries";
import { ArticleEditor, type ArticleData } from "./ArticleEditor";
import styles from "../../seo-admin.module.css";

export const dynamic = "force-dynamic";

export default async function ArticleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const article = (await getArticle(Number(id))) as ArticleData | null;
  if (!article) notFound();

  return (
    <div>
      <Link className={styles.link} href="/admin/seo/articles">
        ← К списку статей
      </Link>
      <h1 className={styles.h1} style={{ marginTop: 10 }}>
        Редактирование статьи
      </h1>
      <ArticleEditor article={article} />
    </div>
  );
}
