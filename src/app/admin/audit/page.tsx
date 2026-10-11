import { guard } from "@/lib/admin/guard";
import { connectDb } from "@/lib/db";
import { escapeRe } from "@/lib/admin/common";
import { PageHeader, Pager, Pill, Table, btnGhost, dubaiDate, inputCls } from "@/components/admin/ui";
import { AuditLog } from "@/models/audit-log";

export const metadata = { title: "Audit log" };

export default async function AuditPage({ searchParams }: PageProps<"/admin/audit">) {
  await guard("audit:read", "/admin/audit");
  const sp = await searchParams;
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const page = Math.max(1, Number(s("page")) || 1);
  await connectDb();
  const f: Record<string, unknown> = {};
  if (s("entity")) f.entity = s("entity").slice(0, 40);
  if (s("q")) { const re = new RegExp(escapeRe(s("q").slice(0, 60)), "i"); f.$or = [{ summary: re }, { actorEmail: re }, { action: re }]; }
  const [rows, total, entities] = await Promise.all([AuditLog.find(f).sort({ createdAt: -1 }).skip((page - 1) * 30).limit(30).lean(), AuditLog.countDocuments(f), AuditLog.distinct("entity")]);
  return (
    <>
      <PageHeader title="Audit log" sub="Who changed what, and when. Entries can't be edited from the admin." />
      <form className="mb-4 flex flex-wrap gap-2" role="search"><input name="q" defaultValue={s("q")} placeholder="Search summary, action or person…" aria-label="Search" className={`${inputCls} max-w-xs`} />
        <select name="entity" defaultValue={s("entity")} aria-label="Entity" className={`${inputCls} !w-auto`}><option value="">All areas</option>{entities.sort().map((e) => <option key={e} value={e}>{e}</option>)}</select><button className={btnGhost}>Filter</button></form>
      <Table head={["When", "Who", "Action", "Details"]} empty={rows.length ? undefined : "No entries."}>
        {rows.map((a) => <tr key={String(a._id)}><td className="whitespace-nowrap text-xs text-muted">{dubaiDate(a.createdAt, true)}</td><td className="text-xs">{a.actorEmail}</td><td><Pill>{a.action}</Pill></td><td className="text-sm">{a.summary}</td></tr>)}
      </Table>
      <Pager page={page} pages={Math.max(1, Math.ceil(total / 30))} href={(p) => `/admin/audit?${new URLSearchParams({ ...(s("q") && { q: s("q") }), ...(s("entity") && { entity: s("entity") }), page: String(p) })}`} />
    </>
  );
}
