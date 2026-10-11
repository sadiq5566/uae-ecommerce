import { guard } from "@/lib/admin/guard";
import { can } from "@/lib/auth/permissions";
import { Card, PageHeader, btnGhost } from "@/components/admin/ui";
import { ImportWizard } from "@/features/admin/csv/import-wizard";

export const metadata = { title: "CSV import / export" };

export default async function ImportPage() {
  const user = await guard("products:write", "/admin/import");
  const cats = can(user.role, "categories:write");
  return (
    <>
      <PageHeader title="CSV import & export" sub="Bulk create/update by SKU (products) or slug (categories). Everything is validated first; nothing is imported until you confirm." />
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <Card title="Products">
          <div className="flex flex-wrap gap-2"><a className={btnGhost} href="/api/admin/export?type=products-template" download>Sample template</a><a className={btnGhost} href="/api/admin/export?type=products" download>Export all products</a></div>
        </Card>
        {cats && <Card title="Categories"><div className="flex flex-wrap gap-2"><a className={btnGhost} href="/api/admin/export?type=categories-template" download>Sample template</a><a className={btnGhost} href="/api/admin/export?type=categories" download>Export all categories</a></div></Card>}
      </div>
      <div className="flex flex-col gap-6">
        <ImportWizard kind="products" label="products" />
        {cats && <ImportWizard kind="categories" label="categories" />}
      </div>
      <p className="mt-6 text-sm text-muted">Column reference, formats and rules: <code>docs/csv-import.md</code>. Exports escape spreadsheet formulas (cells starting with = + - @ get a leading apostrophe); imports never evaluate anything.</p>
    </>
  );
}
