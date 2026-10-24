import { guard } from "@/lib/admin/guard";
import { PageHeader } from "@/components/admin/ui";
import { BrandForm } from "@/features/admin/catalog/brand-form";

export const metadata = { title: "New brand" };

export default async function NewBrand() {
  await guard("categories:write", "/admin/brands/new");
  return (<><PageHeader title="New brand" /><BrandForm /></>);
}
