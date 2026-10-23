import { itemImageMap } from "@/features/orders/queries";
import { variantLabel } from "@/features/catalog/row";
import { Product } from "@/models/product";
import { connectDb } from "@/lib/db";
import type { Dictionary } from "@/lib/dictionaries";
import { fmt } from "@/lib/format";
import { formatAED, type Locale } from "@/lib/i18n";
import { getSettings } from "@/features/checkout/prepare";
import type { OrderView } from "@/features/orders/queries";
import { cancelReturnAction } from "./actions";
import { ReturnForm, type ReturnLine } from "./request-form";
import { listReturnsForOrder, orderForReturns, returnableQty, returnWindow } from "./service";

const tone: Record<string, string> = { requested: "bg-gold-soft text-gold-ink", approved: "bg-brand-soft text-brand", received: "bg-brand-soft text-brand", completed: "bg-brand text-brand-fg", rejected: "bg-danger/15 text-danger", cancelled: "bg-surface-2 text-muted" };

/** Return policy, the customer's return requests (with their credit code), and the request form while the window is open. */
export async function ReturnsPanel({ order, lang, t, token }: { order: OrderView; lang: Locale; t: Dictionary; token?: string }) {
  const settings = await getSettings();
  const days = settings.returnWindowDays ?? 7;
  if (days <= 0) return null;
  await connectDb();
  const doc = await orderForReturns(order.orderNumber);
  if (!doc) return null;
  const [requests, left] = await Promise.all([listReturnsForOrder(doc._id), returnableQty(doc)]);
  const w = returnWindow(doc, days);
  // Before delivery there is nothing to return and nothing to show.
  if (!w.open && w.reason === "not_delivered" && requests.length === 0) return null;
  const fdate = new Intl.DateTimeFormat(lang === "ar" ? "ar-AE" : "en-AE", { dateStyle: "medium", timeZone: "Asia/Dubai" });

  let lines: ReturnLine[] = [];
  if (w.open) {
    const products = await Product.find({ _id: { $in: doc.items.map((i) => i.productId) } }).select("variants images").lean();
    const byId = new Map(products.map((p) => [String(p._id), p.variants]));
    const pics = await itemImageMap(doc.items.map((i) => ({ sku: i.sku, image: i.image })));
    lines = doc.items.filter((i) => (left.get(i.sku) ?? 0) > 0).map((i) => ({
      sku: i.sku, name: i.name[lang], variant: i.variantLabel?.[lang], image: pics.get(i.sku), max: Math.min(left.get(i.sku) ?? 0, 10),
      options: (byId.get(String(i.productId)) ?? []).filter((v) => v.sku !== i.sku).map((v) => ({ sku: v.sku, label: variantLabel(v), stock: v.stock })),
    }));
  }

  return (
    <section aria-labelledby="ret-h" className="rounded-2xl border border-line bg-surface p-5">
      <h3 id="ret-h" className="font-semibold">↩️ {t.returns.title}</h3>
      <p className="mt-1 text-sm text-muted">{fmt(t.returns.policy, { days })}</p>
      {requests.length > 0 && (
        <ul className="mt-4 flex flex-col gap-3">
          {requests.map((r) => (
            <li key={r.id} className="rounded-xl border border-line p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold" dir="ltr">{r.number}</span>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${tone[r.status]}`}>{t.returns.status[r.status]}</span>
              </div>
              <p className="mt-1 text-muted">{r.resolution === "credit" ? t.returns.credit : t.returns.exchange} · {t.returns.reasons[r.reason]}</p>
              <ul className="mt-2 text-xs text-muted">{r.items.map((i) => <li key={i.sku}>{i.name[lang]} × {i.qty}{i.exchangeLabel ? ` → ${i.exchangeLabel[lang]}` : ""}</li>)}</ul>
              {r.creditCode && (
                <p className="mt-3 rounded-lg bg-brand-soft px-3 py-2 text-brand">{t.returns.yourCredit}: <strong dir="ltr" className="select-all font-mono tracking-wider">{r.creditCode}</strong> — {formatAED(r.creditAmount ?? 0, lang)} · {t.returns.creditValid}</p>
              )}
              {r.status === "requested" && (
                <form action={cancelReturnAction} className="mt-2"><input type="hidden" name="id" value={r.id} /><input type="hidden" name="orderNumber" value={order.orderNumber} />{token && <input type="hidden" name="token" value={token} />}
                  <button className="text-xs font-semibold text-muted underline hover:text-danger">{t.returns.withdraw}</button></form>
              )}
            </li>
          ))}
        </ul>
      )}
      {w.open && lines.length > 0 && (
        <div className="mt-4 border-t border-line pt-4">
          <p className="mb-3 text-sm font-medium text-brand">{fmt(t.returns.openUntil, { d: fdate.format(w.until!) })}</p>
          <ReturnForm orderNumber={order.orderNumber} token={token} lines={lines} locale={lang} t={t} />
        </div>
      )}
      {!w.open && w.reason === "window_closed" && <p className="mt-3 text-sm text-muted">{t.returns.closed}</p>}
    </section>
  );
}
