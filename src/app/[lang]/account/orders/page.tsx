import { Thumb } from "@/components/thumb";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDictionary } from "@/lib/dictionaries";
import { formatAED, isLocale } from "@/lib/i18n";
import { fmt } from "@/lib/format";
import { requireVerifiedUser } from "@/lib/auth/guard";
import { listOrdersForUser } from "@/features/orders/queries";
import { StatusBadge } from "@/features/orders/status-badge";
import { privatePage } from "@/lib/page-meta";

export const generateMetadata = privatePage((t) => t.orders.title);

export default async function OrdersPage({ params, searchParams }: PageProps<"/[lang]/account/orders">) {
  const { lang } = await params;
  const linked = Number((await searchParams).linked) || 0;
  if (!isLocale(lang)) notFound();
  const user = await requireVerifiedUser(lang, `/${lang}/account/orders`);
  const [t, orders] = await Promise.all([getDictionary(lang), listOrdersForUser(user.id)]);
  if (orders.length === 0) {
    return (
      <div className="grid place-items-center gap-3 rounded-2xl border border-dashed border-line py-16 text-center">
        <p className="text-5xl">📦</p><h2 className="font-display text-xl font-bold">{t.account.noOrders}</h2>
        <p className="text-sm text-muted">{t.account.noOrdersHint}</p>
        <Link href={`/${lang}`} className="rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-brand-fg">{t.account.startShopping}</Link>
      </div>
    );
  }
  const date = new Intl.DateTimeFormat(lang === "ar" ? "ar-AE" : "en-AE", { dateStyle: "medium", timeZone: "Asia/Dubai" });
  return (
    <>
    {linked > 0 && <p role="status" className="mb-4 rounded-2xl bg-brand-soft px-4 py-3 text-sm font-medium text-brand">🎉 {fmt(t.account.linkedBanner, { n: linked })}</p>}
    <ul className="flex flex-col gap-4">
      {orders.map((o) => (
        <li key={o.id}>
          <Link href={`/${lang}/account/orders/${o.orderNumber}`} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-5 transition hover:-translate-y-0.5 hover:border-brand hover:shadow-card">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex -space-x-3 rtl:space-x-reverse">{o.items.slice(0, 3).map((i) => <Thumb key={i.sku} src={i.image} icon={i.icon} size={44} className="ring-2 ring-surface" />)}</span>
              <span className="min-w-0">
              <p className="font-semibold" dir="ltr">{o.orderNumber}</p>
              <p className="text-sm text-muted">{fmt(t.orders.placedOn, { d: date.format(new Date(o.createdAt)) })} · {o.items.reduce((a, i) => a + i.qty, 0)} {t.orders.items.toLowerCase()}</p>
              </span>
            </div>
            <div className="flex items-center gap-4"><StatusBadge status={o.status} label={t.orders.status[o.status]} /><span className="font-bold">{formatAED(o.totals.total, lang)}</span></div>
          </Link>
        </li>
      ))}
    </ul>
    </>
  );
}
