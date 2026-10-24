import { notFound } from "next/navigation";
import { guard } from "@/lib/admin/guard";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { PageHeader, btnDanger } from "@/components/admin/ui";
import { deleteBrandAction } from "@/features/admin/catalog/actions";
import { BrandForm } from "@/features/admin/catalog/brand-form";
import { getBrandForm } from "@/features/catalog/brands";

export const metadata = { title: "Edit brand" };

export default async function EditBrand({ params, searchParams }: PageProps<"/admin/brands/[id]">) {
  const { id } = await params;
  await guard("categories:write", `/admin/brands/${id}`);
  const [brand, sp] = await Promise.all([getBrandForm(id), searchParams]);
  if (!brand) notFound();
  return (
    <>
      <PageHeader title={brand.name} sub={`/brands/${brand.slug}`} actions={<form action={deleteBrandAction}><input type="hidden" name="id" value={brand.id} /><ConfirmButton message="Delete this brand?" className={btnDanger}>Delete</ConfirmButton></form>} />
      {sp.blocked && <p role="alert" className="mb-4 rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">Can&apos;t delete: {String(sp.blocked)} product(s) still use this brand. Change their brand first, or hide the brand instead.</p>}
      <BrandForm key={brand.id} brand={brand} />
    </>
  );
}
