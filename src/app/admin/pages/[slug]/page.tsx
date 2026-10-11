import { notFound } from "next/navigation";
import { guard } from "@/lib/admin/guard";
import { connectDb } from "@/lib/db";
import { PageHeader } from "@/components/admin/ui";
import { PageForm } from "@/features/admin/content/forms";
import { ContentPage, PAGE_SLUGS, type PageSlug } from "@/models/content-page";

export const metadata = { title: "Edit page" };

export default async function EditPage({ params }: PageProps<"/admin/pages/[slug]">) {
  const { slug } = await params;
  await guard("articles:write", `/admin/pages/${slug}`);
  if (!(PAGE_SLUGS as readonly string[]).includes(slug)) notFound();
  await connectDb();
  const p = await ContentPage.findOne({ slug: slug as PageSlug }).lean();
  return (
    <>
      <PageHeader title={`Page: ${slug}`} sub={`Public URL: /en/${slug} · /ar/${slug}`} />
      <PageForm key={slug} page={{ slug, title: { en: p?.title?.en ?? "", ar: p?.title?.ar ?? "" }, body: { en: p?.body?.en ?? "", ar: p?.body?.ar ?? "" }, published: !!p?.published }} />
    </>
  );
}
