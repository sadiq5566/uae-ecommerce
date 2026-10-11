import { guard } from "@/lib/admin/guard";
import { PageHeader } from "@/components/admin/ui";
import { categoryOptions } from "@/features/admin/catalog/queries";
import { CategoryForm } from "@/features/admin/catalog/category-form";

export const metadata = { title: "New category" };

export default async function NewCategory() {
  await guard("categories:write", "/admin/categories/new");
  const parents = (await categoryOptions()).filter((c) => !c.parent).map((c) => ({ id: c.id, name: c.name }));
  return (<><PageHeader title="New category" /><CategoryForm parents={parents} /></>);
}
