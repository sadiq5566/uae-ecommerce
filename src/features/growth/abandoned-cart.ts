import "server-only";
import { randomBytes } from "node:crypto";
import { connectDb } from "@/lib/db";
import { absolute, button, esc, h, p } from "@/lib/email";
import { formatAED, type Locale } from "@/lib/i18n";
import { Cart } from "@/models/cart";
import { Order } from "@/models/order";
import { Product } from "@/models/product";
import { User } from "@/models/user";
import { sendLifecycleEmail } from "./mail";

const HOUR = 3_600_000;
/** A bag is "abandoned" after this long without changes, and is no longer chased after MAX_AGE. */
export const ABANDON_AFTER_MS = 1 * HOUR;
const MAX_AGE_MS = 72 * HOUR;

const COPY = {
  en: { subject: "You left something in your bag", title: "Still thinking it over?", body: "Your bag is saved and the items are waiting for you. Stock is limited, so complete your order before they sell out.", cta: "Return to my bag", note: "You received this because you started a checkout with this email address." },
  ar: { subject: "تركت شيئاً في سلتك", title: "هل ما زلت تفكر؟", body: "سلتك محفوظة والمنتجات بانتظارك. الكمية محدودة، فأكمل طلبك قبل نفادها.", cta: "العودة إلى سلتي", note: "وصلتك هذه الرسالة لأنك بدأت إتمام طلب بهذا البريد الإلكتروني." },
} as const;

/** Remember the email a guest typed at checkout, so an abandoned bag can be followed up once. Signed-in carts use the account email. */
export async function rememberCheckoutEmail(guestId: string, email: string, locale: Locale) {
  await connectDb();
  await Cart.updateOne({ guestId }, { $set: { email: email.toLowerCase(), locale } }, { timestamps: false });
}

type Line = { name: string; qty: number; price: number; image?: string };
async function linesOf(items: { sku: string; qty: number }[]): Promise<Line[]> {
  const skus = items.map((i) => i.sku);
  const ps = (await Product.find({ status: "active", mergedInto: null, $or: [{ sku: { $in: skus } }, { "variants.sku": { $in: skus } }] }).select("sku name priceTo images variants").lean()) as unknown as
    { sku: string; name: string; priceTo: number; images?: { url: string }[]; variants?: { sku: string; price?: number; image?: string; color?: string; size?: string }[] }[];
  return items.flatMap((i) => {
    const prod = ps.find((x) => x.sku === i.sku || x.variants?.some((v) => v.sku === i.sku));
    if (!prod) return [];
    const v = prod.variants?.find((x) => x.sku === i.sku);
    return [{ name: [prod.name, v && [v.color, v.size].filter(Boolean).join(" / ")].filter(Boolean).join(" — "), qty: i.qty, price: v?.price ?? prod.priceTo, image: v?.image || prod.images?.[0]?.url }];
  });
}

/**
 * One reminder per bag change: bags untouched for 1–72 hours that have an email (verified account, or typed at checkout) and no order
 * placed since. The link reopens the same bag on any device. Run from the scheduled maintenance call.
 */
export async function sendAbandonedCartReminders(now = new Date()): Promise<{ sent: number }> {
  await connectDb();
  const carts = await Cart.find({
    "items.0": { $exists: true },
    updatedAt: { $lte: new Date(now.getTime() - ABANDON_AFTER_MS), $gte: new Date(now.getTime() - MAX_AGE_MS) },
    $or: [{ remindedAt: { $exists: false } }, { $expr: { $lt: ["$remindedAt", "$updatedAt"] } }],
  }).limit(200).lean();
  let sent = 0;
  for (const c of carts) {
    try {
      let email = c.email ?? undefined; let locale: Locale = c.locale === "ar" ? "ar" : "en";
      if (c.user) {
        const u = await User.findOne({ _id: c.user, status: "active", emailVerifiedAt: { $exists: true } }).select("email locale").lean();
        if (!u) continue;
        email = u.email; locale = u.locale === "ar" ? "ar" : "en";
      }
      if (!email) continue;
      // Ordered since the bag last changed (on any device)? Then it isn't abandoned.
      if (await Order.exists({ createdAt: { $gte: c.updatedAt }, $or: [...(c.user ? [{ user: c.user }] : []), { email }] })) {
        await Cart.updateOne({ _id: c._id }, { $set: { remindedAt: now } }, { timestamps: false });
        continue;
      }
      const lines = await linesOf(c.items);
      if (!lines.length) continue;
      const token = c.restoreToken ?? randomBytes(24).toString("base64url");
      const t = COPY[locale];
      const money = (n: number) => formatAED(n, locale);
      const rows = lines.map((l) => `<tr><td style="padding:8px 0;border-bottom:1px solid #e7e3da;width:60px">${l.image ? `<img src="${esc(absolute(l.image))}" width="52" height="52" alt="" style="display:block;border-radius:8px;object-fit:cover">` : ""}</td><td style="padding:8px 10px;border-bottom:1px solid #e7e3da;font:600 14px Arial,sans-serif;color:#1c1a17">${esc(l.name)}<div style="font:400 12px Arial,sans-serif;color:#6b6b6b">× ${l.qty}</div></td><td align="${locale === "ar" ? "left" : "right"}" style="padding:8px 0;border-bottom:1px solid #e7e3da;font:600 14px Arial,sans-serif;white-space:nowrap">${esc(money(l.price * l.qty))}</td></tr>`).join("");
      const body = h(t.title) + p(esc(t.body)) + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 18px">${rows}</table>`
        + button(absolute(`/${locale}/cart/restore?t=${token}`) ?? "#", t.cta) + `<p style="margin:18px 0 0;font:400 12px Arial,sans-serif;color:#6b6b6b">${esc(t.note)}</p>`;
      if (!(await sendLifecycleEmail(email, locale, t.subject, t.body, body, `${t.title}\n${t.body}`))) continue;
      await Cart.updateOne({ _id: c._id }, { $set: { remindedAt: now, restoreToken: token } }, { timestamps: false });
      sent++;
    } catch (e) { console.warn("[growth] abandoned cart reminder failed:", (e as Error).message); }
  }
  return { sent };
}
