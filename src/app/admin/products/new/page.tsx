import { guard } from "@/lib/admin/guard";
import { PageHeader } from "@/components/admin/ui";
import { brandOptions, categoryOptions } from "@/features/admin/catalog/queries";
import { ProductForm } from "@/features/admin/catalog/product-form";

export const metadata = { title: "New product" };

export default async function NewProduct() {
  await guard("products:write", "/admin/products/new");
  return (<><PageHeader title="New product" /><ProductForm categories={await categoryOptions()} brands={await brandOptions()} /></>);
}
