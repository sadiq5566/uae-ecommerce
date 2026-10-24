import { notFound } from "next/navigation";
import { guard } from "@/lib/admin/guard";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { LinkButton, PageHeader, Pill, btnDanger } from "@/components/admin/ui";
import { deleteProductAction } from "@/features/admin/catalog/actions";
import { categoryOptions, getProductForm } from "@/features/admin/catalog/queries";
import { ProductForm } from "@/features/admin/catalog/product-form";

export const metadata = { title: "Edit product" };

export default async function EditProduct({ params }: PageProps<"/admin/products/[id]">) {
  const { id } = await params;
  await guard("products:write", `/admin/products/${id}`);
  const [product, cats] = await Promise.all([getProductForm(id), categoryOptions()]);
  if (!product) notFound();
  return (
    <>
      <PageHeader title={product.name} sub={product.sku} actions={<>
        {product.status === "active" && <LinkButton href={`/en/p/${product.slug}`} variant="ghost">View in store ↗</LinkButton>}
        <LinkButton href={`/admin/inventory?q=${encodeURIComponent(product.sku)}`} variant="ghost">Stock history</LinkButton>
        {product.status !== "active" && <form action={deleteProductAction}><input type="hidden" name="id" value={product.id} /><ConfirmButton message="Delete this product permanently? Past orders keep their own copy of it." className={btnDanger}>Delete</ConfirmButton></form>}
      </>} />
      {product.status === "active" && <p className="mb-4 text-sm text-muted"><Pill tone="green">active</Pill> Unpublish or archive it to be able to delete it.</p>}
      <ProductForm key={product.id} categories={cats} product={product} />
    </>
  );
}
