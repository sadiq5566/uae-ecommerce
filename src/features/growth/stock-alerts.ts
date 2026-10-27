import "server-only";
import { connectDb } from "@/lib/db";
import { absolute, button, esc, h, p } from "@/lib/email";
import type { Locale } from "@/lib/i18n";
import { Product } from "@/models/product";
import { StockAlert } from "@/models/stock-alert";
import { sendLifecycleEmail } from "./mail";

const COPY = {
  en: { subject: (n: string) => `Back in stock: ${n}`, title: "It's back!", body: (n: string) => `<b>${n}</b> is back in stock. Popular items sell out quickly, so grab yours now.`, cta: "Shop now" },
  ar: { subject: (n: string) => `عاد إلى المخزون: ${n}`, title: "لقد عاد!", body: (n: string) => `<b>${n}</b> متوفر من جديد. المنتجات المطلوبة تنفد بسرعة، فاحصل عليه الآن.`, cta: "تسوّق الآن" },
} as const;

type Prod = { _id: unknown; slug: string; sku: string; name: string; stock: number; status: string; mergedInto?: string | null; variants?: { sku: string; stock: number; color?: string; size?: string }[] };
const stockOf = (p: Prod, sku: string) => (p.variants?.length ? p.variants.find((v) => v.sku === sku)?.stock ?? 0 : p.sku === sku ? p.stock : 0);

export type AlertResult = { ok: true } | { ok: false; error: "not_found" | "in_stock" };

/** Ask to be told when an out-of-stock product (or one size/colour of it) comes back. Asking again after a notice re-arms it. */
export async function subscribeStockAlert(input: { sku: string; email: string; locale: Locale; userId?: string }): Promise<AlertResult> {
  await connectDb();
  const prod = (await Product.findOne({ status: "active", mergedInto: null, $or: [{ sku: input.sku }, { "variants.sku": input.sku }] }).lean()) as unknown as Prod | null;
  if (!prod) return { ok: false, error: "not_found" };
  if (stockOf(prod, input.sku) > 0) return { ok: false, error: "in_stock" };
  await StockAlert.updateOne(
    { sku: input.sku, email: input.email.toLowerCase() },
    { $set: { productId: prod._id, slug: prod.slug, locale: input.locale, ...(input.userId ? { user: input.userId } : {}) }, $unset: { notifiedAt: 1 } },
    { upsert: true },
  );
  return { ok: true };
}

/** Email everyone waiting for a SKU that has stock again (once each). Run from the scheduled maintenance call. */
export async function sendBackInStockAlerts(): Promise<{ sent: number }> {
  await connectDb();
  const skus = (await StockAlert.distinct("sku", { notifiedAt: { $exists: false } })).slice(0, 500);
  if (!skus.length) return { sent: 0 };
  const prods = (await Product.find({ status: "active", mergedInto: null, $or: [{ sku: { $in: skus } }, { "variants.sku": { $in: skus } }] }).lean()) as unknown as Prod[];
  let sent = 0;
  for (const sku of skus) {
    const prod = prods.find((x) => x.sku === sku || x.variants?.some((v) => v.sku === sku));
    if (!prod || stockOf(prod, sku) <= 0) continue;
    const v = prod.variants?.find((x) => x.sku === sku);
    const name = [prod.name, v && [v.color, v.size].filter(Boolean).join(" / ")].filter(Boolean).join(" — ");
    for (const a of await StockAlert.find({ sku, notifiedAt: { $exists: false } }).limit(500).lean()) {
      try {
        const l: Locale = a.locale === "ar" ? "ar" : "en"; const t = COPY[l];
        const body = h(t.title) + p(t.body(esc(name))) + button(absolute(`/${l}/p/${prod.slug}`) ?? "#", t.cta);
        if (!(await sendLifecycleEmail(a.email, l, t.subject(name), t.subject(name), body, `${t.title} ${name}`))) continue;
        await StockAlert.updateOne({ _id: a._id }, { $set: { notifiedAt: new Date() } });
        sent++;
      } catch (e) { console.warn("[growth] back-in-stock email failed:", (e as Error).message); }
    }
  }
  return { sent };
}
