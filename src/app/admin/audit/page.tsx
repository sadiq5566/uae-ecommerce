import { guard } from "@/lib/admin/guard";
import { connectDb } from "@/lib/db";
import { PageHeader, Pager, Pill, Table, dubaiDate } from "@/components/admin/ui";
import { FilterForm, SortHead, hrefFor, type FilterField } from "@/components/admin/list-ui";
import { day, dayRange, parsePage, parseSize, parseSort, rx, str } from "@/lib/admin/list";
import { AuditLog } from "@/models/audit-log";

export const metadata = { title: "Audit log" };
const SORTS = { when: "createdAt", who: "actorEmail", action: "action", area: "entity" } as const;

export default async function AuditPage({ searchParams }: PageProps<"/admin/audit">) {
  await guard("audit:read", "/admin/audit");
  const sp = await searchParams;
  await connectDb();
  const [entities, actions] = await Promise.all([AuditLog.distinct("entity"), AuditLog.distinct("action")]);
  const v = { q: str(sp, "q", 60), entity: entities.includes(str(sp, "entity", 40)) ? str(sp, "entity", 40) : "", action: actions.includes(str(sp, "action", 60)) ? str(sp, "action", 60) : "", who: str(sp, "who", 80), from: day(sp, "from"), to: day(sp, "to") };
  const { sort, dir, mongo } = parseSort(sp, Object.keys(SORTS) as (keyof typeof SORTS)[], "when", "desc");
  const per = parseSize(sp, 25); const page = parsePage(sp);
  const f: Record<string, unknown> = {};
  if (v.entity) f.entity = v.entity;
  if (v.action) f.action = v.action;
  if (v.who) f.actorEmail = rx(v.who);
  if (v.q) { const re = rx(v.q); f.$or = [{ summary: re }, { actorEmail: re }, { action: re }, { entityId: re }]; }
  const range = dayRange(v.from, v.to); if (range) f.createdAt = range;
  const [rows, total] = await Promise.all([AuditLog.find(f).sort({ [SORTS[sort]]: mongo, _id: -1 }).skip((page - 1) * per).limit(per).lean(), AuditLog.countDocuments(f)]);
  const c = { base: "/admin/audit", values: v as Record<string, string>, sort, dir, per, defaultSort: "when", defaultDir: "desc" as const, defaultPer: 25 };
  const fields: FilterField[] = [
    { name: "q", label: "Search", kind: "search", placeholder: "Summary, action, person or id…" },
    { name: "entity", label: "Area", kind: "select", options: [...entities].sort().map((e) => ({ value: e, label: e })) },
    { name: "action", label: "Action", kind: "select", options: [...actions].sort().map((e) => ({ value: e, label: e })), more: true },
    { name: "who", label: "Person (email)", kind: "search", more: true },
    { name: "from", label: "From", kind: "date", more: true }, { name: "to", label: "To", kind: "date", more: true },
  ];
  const H = (l: string, field: string) => <SortHead label={l} field={field} {...c} />;
  return (
    <>
      <PageHeader title="Audit log" sub={`${total} entr${total === 1 ? "y" : "ies"} · who changed what, and when. Entries can't be edited from the admin.`} />
      <FilterForm {...c} fields={fields} sorts={[{ value: "when", label: "When" }, { value: "who", label: "Person" }, { value: "action", label: "Action" }, { value: "area", label: "Area" }]} />
      <Table head={[H("When", "when"), H("Who", "who"), H("Action", "action"), "Details"]} empty={rows.length ? undefined : "No entries."}>
        {rows.map((a) => <tr key={String(a._id)}><td className="whitespace-nowrap text-xs text-muted">{dubaiDate(a.createdAt, true)}</td><td className="text-xs">{a.actorEmail}</td><td><Pill>{a.action}</Pill></td><td className="text-sm">{a.summary}</td></tr>)}
      </Table>
      <Pager page={page} pages={Math.max(1, Math.ceil(total / per))} href={(p) => hrefFor(c, { page: p })} />
    </>
  );
}
