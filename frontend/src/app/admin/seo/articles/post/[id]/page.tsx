import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminPost, getAdminCategories } from "@/lib/seo/blog";
import { PostEditor } from "./PostEditor";
import styles from "../../../seo-admin.module.css";

export const dynamic = "force-dynamic";

export default async function PostDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [post, categories] = await Promise.all([getAdminPost(Number(id)), getAdminCategories()]);
  if (!post) notFound();

  return (
    <div>
      <Link className={styles.link} href="/admin/seo/articles">
        ← К списку статей
      </Link>
      <h1 className={styles.h1} style={{ marginTop: 10 }}>
        Редактирование статьи
      </h1>
      <PostEditor post={post} categories={categories} />
    </div>
  );
}
