import { guard } from "@/lib/admin/guard";
import { PageHeader } from "@/components/admin/ui";
import ImportTool from "@/components/admin/import-tool";

export const metadata = { title: "CSV import / export" };

export default async function ImportPage() {
  await guard("products:write", "/admin/import");
  return (
    <>
      <PageHeader title="CSV import & export" sub="Bulk create/update products by SKU. Everything is validated first; nothing is imported until you confirm. The same file format works in every storefront." />
      <ImportTool />
    </>
  );
}
