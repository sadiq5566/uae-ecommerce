import { guard } from "@/lib/admin/guard";
import { can } from "@/lib/auth/permissions";
import { connectDb } from "@/lib/db";
import { escapeRe } from "@/lib/admin/common";
import { PageHeader, Pill, Stat, Table, aed, btnGhost, dubaiDate } from "@/components/admin/ui";
import { FilterForm, SortHead, type FilterField } from "@/components/admin/list-ui";
import { day, dayRange, num, oneOf, parseSort, rx, str } from "@/lib/admin/list";
import { maskEmail, maskPhone } from "@/features/admin/people/mask";
import { Lead } from "@/models/lead";
import { Order } from "@/models/order";

export const metadata = { title: "Marketing & leads" };
const COUNTED = ["confirmed", "processing", "packed", "out_for_delivery", "delivered"];

export default async function MarketingPage({ searchParams }: PageProps<"/admin/marketing">) {
  const viewer = await guard("customers:read", "/admin/marketing");
  const sp = await searchParams;
  const q = str(sp, "q", 60);
  // Two lists on this page: customers (params q/type/min…/sort/dir) and leads (l-prefixed params).
  const bv = { q, type: oneOf(str(sp, "type"), ["member", "guest"]), repeat: oneOf(str(sp, "repeat"), ["yes", "no"]), minspent: num(sp, "minspent"), from: day(sp, "from"), to: day(sp, "to") };
  const bs_ = parseSort(sp, ["last", "name", "orders", "spent", "type"] as const, "last", "desc");
  const lv = { lq: str(sp, "lq", 60), lsource: str(sp, "lsource", 30), lconsent: oneOf(str(sp, "lconsent"), ["yes", "no"]), llocale: oneOf(str(sp, "llocale"), ["en", "ar"]), lfrom: day(sp, "lfrom"), lto: day(sp, "lto") };
  const ls_ = parseSort({ sort: sp.lsort, dir: sp.ldir }, ["captured", "email", "source", "consent", "language"] as const, "captured", "desc");
  const owner = can(viewer.role, "users:manage"); // contact details are owner-only, like the customer list
  await connectDb();

  const match: Record<string, unknown> = { status: { $in: COUNTED } };
  if (q) { const re = new RegExp(escapeRe(q), "i"); match.$or = [{ "address.recipientName": re }, { "address.phone": re }, { email: re }]; }
  const range = dayRange(bv.from, bv.to); if (range) match.createdAt = range;
  const leadFilter: Record<string, unknown> = {};
  if (lv.lq) { const re = rx(lv.lq); leadFilter.$or = [{ email: re }, { phone: re }, { name: re }]; }
  if (lv.lsource) leadFilter.source = lv.lsource;
  if (lv.lconsent) leadFilter.marketingConsent = lv.lconsent === "yes";
  if (lv.llocale) leadFilter.locale = lv.llocale;
  const lrange = dayRange(lv.lfrom, lv.lto); if (lrange) leadFilter.createdAt = lrange;
  const sources = await Lead.distinct("source");
  const [buyers, leads, leadStats, buyerStats] = await Promise.all([
    // One row per phone number, so guests and members who ordered more than once are the same customer.
    Order.aggregate([
      { $match: match }, { $sort: { createdAt: -1 } },
      { $group: { _id: "$address.phone", name: { $first: "$address.recipientName" }, email: { $first: "$email" }, orders: { $sum: 1 }, spent: { $sum: "$totals.total" }, last: { $first: "$createdAt" }, member: { $max: { $cond: [{ $ifNull: ["$user", false] }, 1, 0] } } } },
      ...(bv.repeat ? [{ $match: { orders: bv.repeat === "yes" ? { $gte: 2 } : { $lt: 2 } } }] : []),
      ...(bv.type ? [{ $match: { member: bv.type === "member" ? 1 : 0 } }] : []),
      ...(bv.minspent ? [{ $match: { spent: { $gte: Number(bv.minspent) } } }] : []),
      { $sort: { [{ last: "last", name: "name", orders: "orders", spent: "spent", type: "member" }[bs_.sort]]: bs_.mongo, _id: 1 } }, { $limit: 100 },
    ]),
    Lead.find(leadFilter).sort({ [{ captured: "createdAt", email: "email", source: "source", consent: "marketingConsent", language: "locale" }[ls_.sort]]: ls_.mongo, _id: 1 }).limit(100).lean(),
    Lead.aggregate([{ $group: { _id: null, total: { $sum: 1 }, consented: { $sum: { $cond: ["$marketingConsent", 1, 0] } } } }]),
    Order.aggregate([
      { $match: { status: { $in: COUNTED } } },
      { $group: { _id: "$address.phone", orders: { $sum: 1 }, guest: { $max: { $cond: ["$guest", 1, 0] } } } },
      { $group: { _id: null, customers: { $sum: 1 }, repeat: { $sum: { $cond: [{ $gte: ["$orders", 2] }, 1, 0] } }, guests: { $sum: "$guest" } } },
    ]),
  ]);
  const ls = leadStats[0] ?? { total: 0, consented: 0 }; const bs = buyerStats[0] ?? { customers: 0, repeat: 0, guests: 0 };
  const bc = { base: "/admin/marketing", values: bv as Record<string, string>, sort: bs_.sort, dir: bs_.dir, defaultSort: "last", defaultDir: "desc" as const, keep: lv as Record<string, string> };
  const lc = { base: "/admin/marketing", values: lv as Record<string, string>, sort: ls_.sort, dir: ls_.dir, defaultSort: "captured", defaultDir: "desc" as const, sk: "lsort", dk: "ldir", keep: bv as Record<string, string> };
  const bF: FilterField[] = [
    { name: "q", label: "Search", kind: "search", placeholder: "Name, phone or email…" },
    { name: "type", label: "Type", kind: "select", options: [{ value: "member", label: "Member" }, { value: "guest", label: "Guest" }] },
    { name: "repeat", label: "Repeat", kind: "select", options: [{ value: "yes", label: "2+ orders" }, { value: "no", label: "Single order" }] },
    { name: "minspent", label: "Spent from (AED)", kind: "number", more: true },
    { name: "from", label: "Ordered from", kind: "date", more: true }, { name: "to", label: "Ordered to", kind: "date", more: true },
  ];
  const lF: FilterField[] = [
    { name: "lq", label: "Search", kind: "search", placeholder: "Email, phone or name…" },
    { name: "lsource", label: "Source", kind: "select", options: sources.sort().map((x) => ({ value: x, label: String(x).replace(/_/g, " ") })) },
    { name: "lconsent", label: "Opted in", kind: "select", options: [{ value: "yes", label: "Opted in" }, { value: "no", label: "Not opted in" }] },
    { name: "llocale", label: "Language", kind: "select", options: [{ value: "en", label: "English" }, { value: "ar", label: "Arabic" }], more: true },
    { name: "lfrom", label: "Captured from", kind: "date", more: true }, { name: "lto", label: "Captured to", kind: "date", more: true },
  ];
  const BH = (l: string, f: string) => <SortHead label={l} field={f} {...bc} />;
  const LH = (l: string, f: string) => <SortHead label={l} field={f} {...lc} />;
  const em = (e?: string | null) => (e ? (owner ? e : maskEmail(e)) : "—");
  const ph = (p?: string | null) => (p ? (owner ? p : maskPhone(p)) : "—");

  return (
    <>
      <PageHeader title="Marketing & leads" sub="Everyone who left contact details or bought — the base for campaigns, coupons and re-engagement." actions={owner ? <a href="/api/admin/export?type=leads" download className={btnGhost}>⇩ Export opted-in leads (CSV)</a> : undefined} />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Customers (by phone)" value={bs.customers} hint={`${bs.guests} bought as guest`} />
        <Stat label="Repeat customers" value={bs.repeat} hint="2 or more orders" />
        <Stat label="Leads captured" value={ls.total} hint="popup, newsletter" />
        <Stat label="Opted in to offers" value={ls.consented} hint="may be contacted" />
      </div>

      <h2 className="mb-3 font-display text-xl font-bold">Customers</h2>
      <FilterForm {...bc} sizes={false} fields={bF} sorts={[{ value: "last", label: "Last order" }, { value: "spent", label: "Total spent" }, { value: "orders", label: "Orders" }, { value: "name", label: "Name" }, { value: "type", label: "Type" }]} />
      <Table label="Customers" head={[BH("Customer", "name"), "Phone", "Email", BH("Orders", "orders"), BH("Spent", "spent"), BH("Last order", "last"), BH("Type", "type")]} empty={buyers.length ? undefined : "No customers yet."}>
        {buyers.map((b) => (
          <tr key={String(b._id)}><td className="font-medium">{b.name}</td><td className="text-muted" dir="ltr">{ph(b._id)}</td><td className="text-muted">{em(b.email)}</td><td>{b.orders}</td><td>{aed(b.spent)}</td><td className="text-xs text-muted">{dubaiDate(b.last)}</td><td><Pill tone={b.member ? "green" : "gold"}>{b.member ? "member" : "guest"}</Pill></td></tr>
        ))}
      </Table>

      <h2 className="mb-3 mt-10 font-display text-xl font-bold">Leads</h2>
      <FilterForm {...lc} sizes={false} fields={lF} sorts={[{ value: "captured", label: "Captured" }, { value: "email", label: "Email" }, { value: "source", label: "Source" }, { value: "consent", label: "Opted in" }, { value: "language", label: "Language" }]} />
      <Table label="Leads" head={[LH("Email", "email"), "Phone", LH("Source", "source"), LH("Opted in", "consent"), LH("Language", "language"), LH("Captured", "captured")]} empty={leads.length ? undefined : "No leads yet — the welcome popup and newsletter will fill this list."}>
        {leads.map((l) => (
          <tr key={String(l._id)}><td>{em(l.email)}</td><td className="text-muted" dir="ltr">{ph(l.phone)}</td><td>{l.source.replace(/_/g, " ")}</td><td><Pill tone={l.marketingConsent ? "green" : "grey"}>{l.marketingConsent ? "yes" : "no"}</Pill></td><td>{l.locale === "ar" ? "Arabic" : "English"}</td><td className="text-xs text-muted">{dubaiDate(l.createdAt)}</td></tr>
        ))}
      </Table>
      <p className="mt-4 text-xs text-muted">Only message people who opted in. Sending SMS/email campaigns needs a provider (not connected yet) — export the opted-in list into your email/SMS tool in the meantime.</p>
    </>
  );
}
