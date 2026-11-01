import Link from "next/link";
import { guard } from "@/lib/admin/guard";
import { can } from "@/lib/auth/permissions";
import { listHref, parsePage, parseSize, str, oneOf } from "@/lib/admin/list";
import { Card, PageHeader, Pager, Stat, aed, btnGhost, btnPrimary, dubaiDate, inputCls } from "@/components/admin/ui";
import { AdjustCreditForm } from "@/features/admin/credit/adjust-form";
import { Ledger } from "@/features/admin/credit/ledger";
import { adjustmentTotals, findCustomerCredit, listAdjustments } from "@/features/admin/credit/queries";
import { maskEmail } from "@/features/admin/people/mask";

export const metadata = { title: "Web credit" };

export default async function WebCreditPage({ searchParams }: PageProps<"/admin/credit">) {
  const viewer = await guard("orders:write", "/admin/credit");
  const sp = await searchParams;
  const email = str(sp, "email", 254).toLowerCase();
  const kind = oneOf(str(sp, "kind", 8), ["add", "deduct"]) as "" | "add" | "deduct";
  const page = parsePage(sp), per = parseSize(sp, 25);
  const owner = can(viewer.role, "users:manage");
  const [totals, list, found] = await Promise.all([adjustmentTotals(), listAdjustments({ page, per, kind: kind || undefined, email: email || undefined }), email ? findCustomerCredit(email) : null]);
  const href = (p: number) => listHref("/admin/credit", { email, kind, per, page: p }, { per: 25, page: 1 });
  return (
    <>
      <PageHeader title="Web credit" sub="Add credit to a customer's wallet or take some back. Every change is kept below with who did it, when and why." />
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <Stat label="Added by staff (30 days)" value={aed(totals.added)} hint={`${totals.addedN} change${totals.addedN === 1 ? "" : "s"}`} />
        <Stat label="Removed by staff (30 days)" value={aed(totals.removed)} hint={`${totals.removedN} change${totals.removedN === 1 ? "" : "s"}`} tone={totals.removed > 0 ? "red" : undefined} />
      </div>

      <Card title="Adjust a customer's web credit">
        <form className="mb-5 flex flex-wrap items-end gap-3" role="search">
          <div className="min-w-64 flex-1"><label htmlFor="lookup" className="mb-1.5 block text-sm font-medium">Find a customer by email</label><input id="lookup" name="email" type="email" defaultValue={email} placeholder="name@example.com" className={inputCls} /></div>
          <button className={btnGhost}>Look up</button>
        </form>
        {email && !found && <p role="alert" className="mb-4 rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">No customer account with this email.</p>}
        {found && (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-2 p-4 text-sm">
            <div><Link href={`/admin/customers/${found.id}`} className="font-semibold hover:text-brand">{found.name}</Link><span className="block text-xs text-muted">{owner ? found.email : maskEmail(found.email)}{!found.active && " · account not active"}{!found.verified && " · email not verified"}</span></div>
            <div className="text-end"><span className="block text-xs text-muted">Spendable now</span><b className="text-xl">{aed(found.balance)}</b>{found.expiring > 0 && <span className="block text-xs text-muted">{aed(found.expiring)} expires by {found.nextExpiry ? dubaiDate(found.nextExpiry) : "soon"}</span>}</div>
          </div>
        )}
        <AdjustCreditForm key={found?.id ?? "x"} email={found?.email ?? email} />
      </Card>

      <h2 className="mb-3 mt-10 font-display text-xl font-bold">Credit ledger <span className="text-sm font-normal text-muted">({list.total})</span></h2>
      <form className="mb-4 flex flex-wrap items-end gap-3" role="search">
        <input name="email" type="email" defaultValue={email} aria-label="Customer email" placeholder="Filter by customer email" className={`${inputCls} max-w-xs`} />
        <select name="kind" defaultValue={kind} aria-label="Type" className={`${inputCls} !w-auto`}><option value="">All changes</option><option value="add">Added only</option><option value="deduct">Removed only</option></select>
        <button className={btnPrimary}>Filter</button>
        {(email || kind) && <Link href="/admin/credit" className={btnGhost}>Reset</Link>}
      </form>
      <Ledger rows={list.rows} owner={owner} empty={email || kind ? "Nothing matches these filters." : "No manual credit changes yet."} />
      <Pager page={page} pages={list.pages} href={href} />
    </>
  );
}
