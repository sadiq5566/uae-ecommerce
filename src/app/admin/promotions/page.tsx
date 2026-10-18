import Link from "next/link";
import { guard } from "@/lib/admin/guard";
import { connectDb } from "@/lib/db";
import { LinkButton, PageHeader, Pager, Pill, Table, dubaiDate } from "@/components/admin/ui";
import { FilterForm, SortHead, hrefFor, type FilterField } from "@/components/admin/list-ui";
import { oneOf, parsePage, parseSize, parseSort, rx, str } from "@/lib/admin/list";
import { Coupon } from "@/models/coupon";

export const metadata = { title: "Promotions" };
const SORTS = ["created", "code", "value", "valid", "used", "state"] as const;

export default async function Promotions({ searchParams }: PageProps<"/admin/promotions">) {
  await guard("promotions:write", "/admin/promotions");
  const sp = await searchParams;
  const v = { q: str(sp, "q", 40), state: oneOf(str(sp, "state"), ["live", "scheduled", "expired", "used up", "off"]), type: oneOf(str(sp, "type"), ["percent", "fixed"]), public: oneOf(str(sp, "public"), ["yes", "no"]), stack: oneOf(str(sp, "stack"), ["yes", "no"]) };
  const { sort, dir } = parseSort(sp, SORTS, "created", "desc");
  const per = parseSize(sp, 25); const page = parsePage(sp);
  await connectDb();
  const m: Record<string, unknown> = {};
  if (v.q) m.code = rx(v.q);
  if (v.type) m.type = v.type;
  if (v.public) m.public = v.public === "yes" ? true : { $ne: true };
  if (v.stack) m.stackWithSale = v.stack === "yes" ? true : { $ne: true };
  const all = await Coupon.find(m).limit(1000).lean();
  const now = new Date();
  const state = (c: (typeof all)[number]) => !c.active ? ["off", "grey"] as const : c.endsAt && c.endsAt < now ? ["expired", "red"] as const : c.startsAt && c.startsAt > now ? ["scheduled", "gold"] as const : c.usageLimit != null && c.usedCount >= c.usageLimit ? ["used up", "red"] as const : ["live", "green"] as const;
  const filtered = v.state ? all.filter((c) => state(c)[0] === v.state) : all;
  const key = (c: (typeof all)[number]): string | number => sort === "code" ? c.code : sort === "value" ? c.value : sort === "valid" ? (c.endsAt?.getTime() ?? Infinity) : sort === "used" ? c.usedCount : sort === "state" ? state(c)[0] : (c as unknown as { createdAt: Date }).createdAt.getTime();
  filtered.sort((a, b) => { const x = key(a), y = key(b); return (x < y ? -1 : x > y ? 1 : 0) * (dir === "asc" ? 1 : -1); });
  const rows = filtered.slice((page - 1) * per, page * per);
  const c = { base: "/admin/promotions", values: v as Record<string, string>, sort, dir, per, defaultSort: "created", defaultDir: "desc" as const, defaultPer: 25 };
  const fields: FilterField[] = [
    { name: "q", label: "Search", kind: "search", placeholder: "Coupon code…" },
    { name: "state", label: "State", kind: "select", options: ["live", "scheduled", "expired", "used up", "off"].map((x) => ({ value: x, label: x })) },
    { name: "type", label: "Type", kind: "select", options: [{ value: "percent", label: "Percent" }, { value: "fixed", label: "Fixed AED" }] },
    { name: "public", label: "Advertised", kind: "select", options: [{ value: "yes", label: "Public (listed)" }, { value: "no", label: "Private" }], more: true },
    { name: "stack", label: "On sale items", kind: "select", options: [{ value: "yes", label: "Also on sale items" }, { value: "no", label: "Not on sale items" }], more: true },
  ];
  const H = (l: string, field: string) => <SortHead label={l} field={field} {...c} />;
  return (
    <>
      <PageHeader title="Promotions" sub={`${filtered.length} coupon${filtered.length === 1 ? "" : "s"} · item sale prices are set on each product (optionally scheduled).`} actions={<LinkButton href="/admin/promotions/new">+ New coupon</LinkButton>} />
      {sp.saved && <p role="status" className="mb-4 rounded-xl bg-brand-soft px-4 py-3 text-sm text-brand">✓ Coupon created.</p>}
      <FilterForm {...c} fields={fields} sorts={[{ value: "created", label: "Newest" }, { value: "code", label: "Code" }, { value: "value", label: "Discount" }, { value: "valid", label: "Ends" }, { value: "used", label: "Times used" }, { value: "state", label: "State" }]} />
      <Table head={[H("Code", "code"), H("Discount", "value"), H("Valid", "valid"), H("Used", "used"), H("State", "state")]} empty={rows.length ? undefined : "No coupons match."}>
        {rows.map((c) => { const [t, tone] = state(c); return (
          <tr key={String(c._id)}><td><Link href={`/admin/promotions/${c._id}`} className="font-mono text-sm font-semibold hover:text-brand">{c.code}</Link></td><td>{c.type === "percent" ? `${c.value}%` : `AED ${c.value}`}{c.minSubtotal ? <span className="text-xs text-muted"> · min {c.minSubtotal}</span> : null}</td><td className="text-xs text-muted">{c.startsAt ? dubaiDate(c.startsAt) : "now"} → {c.endsAt ? dubaiDate(c.endsAt) : "no end"}</td><td>{c.usedCount}{c.usageLimit != null ? ` / ${c.usageLimit}` : ""}</td><td><Pill tone={tone}>{t}</Pill></td></tr>
        ); })}
      </Table>
      <Pager page={page} pages={Math.max(1, Math.ceil(filtered.length / per))} href={(p) => hrefFor(c, { page: p })} />
    </>
  );
}
