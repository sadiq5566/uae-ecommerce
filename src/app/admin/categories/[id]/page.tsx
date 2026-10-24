import { notFound } from "next/navigation";
import { guard } from "@/lib/admin/guard";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { PageHeader, btnDanger } from "@/components/admin/ui";
import { deleteCategoryAction } from "@/features/admin/catalog/actions";
import { categoryOptions, getCategoryForm } from "@/features/admin/catalog/queries";
import { CategoryForm } from "@/features/admin/catalog/category-form";

export const metadata = { title: "Edit category" };

export default async function EditCategory({ params, searchParams }: PageProps<"/admin/categories/[id]">) {
  const { id } = await params;
  await guard("categories:write", `/admin/categories/${id}`);
  const [cat, opts, sp] = await Promise.all([getCategoryForm(id), categoryOptions(), searchParams]);
  if (!cat) notFound();
  // Parent choices: top-level categories only, excluding itself (the server also blocks cycles).
  const parents = opts.filter((c) => !c.parent && c.id !== cat.id).map((c) => ({ id: c.id, name: c.name }));
  return (
    <>
      <PageHeader title={cat.name} sub={cat.slug} actions={<form action={deleteCategoryAction}><input type="hidden" name="id" value={cat.id} /><ConfirmButton message="Delete this category?" className={btnDanger}>Delete</ConfirmButton></form>} />
      {sp.blocked && <p role="alert" className="mb-4 rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">Can&apos;t delete: this category still has {sp.blocked === "children" ? "subcategories" : "products (archive or move them first)"}.</p>}
      <CategoryForm key={cat.id} category={cat} parents={parents} />
    </>
  );
}
