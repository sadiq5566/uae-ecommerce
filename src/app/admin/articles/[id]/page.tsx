import { notFound } from "next/navigation";
import { Types } from "mongoose";
import { guard } from "@/lib/admin/guard";
import { connectDb } from "@/lib/db";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { PageHeader, btnDanger } from "@/components/admin/ui";
import { deleteArticleAction } from "@/features/admin/content/actions";
import { ArticleForm } from "@/features/admin/content/forms";
import { Article } from "@/models/article";

export const metadata = { title: "Edit article" };
const local = (d?: Date | null) => (d ? new Date(d.getTime() + 4 * 3600_000).toISOString().slice(0, 16) : "");

export default async function EditArticle({ params }: PageProps<"/admin/articles/[id]">) {
  const { id } = await params;
  await guard("articles:write", `/admin/articles/${id}`);
  if (!Types.ObjectId.isValid(id)) notFound();
  await connectDb();
  const a = await Article.findById(id).lean();
  if (!a) notFound();
  const l = (x?: { en?: string | null; ar?: string | null } | null) => ({ en: x?.en ?? "", ar: x?.ar ?? "" });
  return (
    <>
      <PageHeader title={a.title?.en ?? ""} sub={`/${a.slug}`} actions={<form action={deleteArticleAction}><input type="hidden" name="id" value={id} /><ConfirmButton message="Delete this article?" className={btnDanger}>Delete</ConfirmButton></form>} />
      <ArticleForm key={id} article={{ id, slug: a.slug, title: l(a.title), excerpt: l(a.excerpt), body: l(a.body), category: a.category ?? undefined, author: a.author ?? undefined, cover: a.cover ?? undefined, coverAlt: l(a.coverAlt), icon: a.icon, hue: a.hue, status: a.status, publishAt: local(a.publishAt), seo: { title: l(a.seo?.title), description: l(a.seo?.description) } }} />
    </>
  );
}
