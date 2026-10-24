import "server-only";
import { formatAED, type Locale } from "@/lib/i18n";
import { getMailer } from "@/lib/mailer";
import { absolute, button, emailLayout, esc, getBrand, h, p, rows, siteUrl } from "@/lib/email";
import type { OrderDoc } from "@/models/order";

type Kind = "confirmation" | "status" | "payment_failed";

const copy = {
  en: {
    confirmation: (n: string, total: string) => ({ subject: `Order ${n} confirmed`, text: `Thank you! Your order ${n} (${total}) has been received.` }),
    status: (n: string, s: string) => ({ subject: `Order ${n} update`, text: `Your order ${n} is now: ${s}.` }),
    payment_failed: (n: string) => ({ subject: `Payment issue for order ${n}`, text: `We couldn't confirm payment for order ${n}. You can retry from your account.` }),
    status_names: { confirmed: "confirmed", processing: "being prepared", packed: "packed", out_for_delivery: "out for delivery", delivered: "delivered", cancelled: "cancelled", refund_pending: "refund pending", refunded: "refunded", pending_payment: "awaiting payment" } as Record<string, string>,
    ui: { hi: (n: string) => `Hi ${n},`, thanks: "Thank you for your order", received: (n: string) => `We have received order <b>${n}</b> and will start preparing it right away.`, items: "Your items", qty: "Qty", subtotal: "Subtotal", discount: "Discount", delivery: "Delivery", free: "Free", cod: "Cash on delivery fee", tax: "VAT", total: "Total", ship: "Delivering to", est: "Estimated delivery", pay: "Payment", track: "Track your order", cash: (a: string) => `Cash on delivery — please have ${a} ready`, card: "Paid online", other: "Online payment", update: "Order update", failedTitle: "Payment not completed", failedBody: (n: string) => `We couldn't confirm the payment for order <b>${n}</b>. Your items are not lost: you can try again from your account.`, view: "View order", statusLine: (n: string, s: string) => `Your order <b>${n}</b> is now <b>${s}</b>.`, preConfirm: (n: string, t: string) => `Order ${n} confirmed — ${t}` },
  },
  ar: {
    confirmation: (n: string, total: string) => ({ subject: `تم تأكيد الطلب ${n}`, text: `شكراً لك! تم استلام طلبك ${n} (${total}).` }),
    status: (n: string, s: string) => ({ subject: `تحديث الطلب ${n}`, text: `حالة طلبك ${n} الآن: ${s}.` }),
    payment_failed: (n: string) => ({ subject: `مشكلة في دفع الطلب ${n}`, text: `تعذّر تأكيد الدفع للطلب ${n}. يمكنك إعادة المحاولة من حسابك.` }),
    status_names: { confirmed: "مؤكد", processing: "قيد التجهيز", packed: "تم التغليف", out_for_delivery: "خرج للتوصيل", delivered: "تم التسليم", cancelled: "ملغى", refund_pending: "استرداد قيد المعالجة", refunded: "تم الاسترداد", pending_payment: "بانتظار الدفع" } as Record<string, string>,
    ui: { hi: (n: string) => `مرحباً ${n}،`, thanks: "شكراً لطلبك", received: (n: string) => `استلمنا الطلب <b>${n}</b> وسنبدأ بتجهيزه فوراً.`, items: "منتجاتك", qty: "الكمية", subtotal: "المجموع الفرعي", discount: "الخصم", delivery: "التوصيل", free: "مجاني", cod: "رسوم الدفع عند الاستلام", tax: "الضريبة", total: "الإجمالي", ship: "عنوان التوصيل", est: "موعد التوصيل المتوقع", pay: "الدفع", track: "تتبع طلبك", cash: (a: string) => `الدفع عند الاستلام — يرجى تجهيز ${a}`, card: "تم الدفع إلكترونياً", other: "دفع إلكتروني", update: "تحديث الطلب", failedTitle: "لم يكتمل الدفع", failedBody: (n: string) => `تعذّر تأكيد الدفع للطلب <b>${n}</b>. منتجاتك محفوظة ويمكنك إعادة المحاولة من حسابك.`, view: "عرض الطلب", statusLine: (n: string, s: string) => `حالة طلبك <b>${n}</b> الآن <b>${s}</b>.`, preConfirm: (n: string, t: string) => `تم تأكيد الطلب ${n} — ${t}` },
  },
};

/** SMS provider interface — no SMS gateway is configured, so this only logs in development. */
export interface SmsProvider { send(to: string, text: string): Promise<{ sent: boolean }>; }
const devSms: SmsProvider = { async send(to, text) { if (process.env.NODE_ENV !== "production") console.info(`[sms:dev — NOT SENT] ${to}: ${text}`); return { sent: false }; } };

type NotifyOrder = Pick<OrderDoc, "orderNumber" | "email" | "locale" | "status" | "totals" | "address"> & Partial<Pick<OrderDoc, "items" | "delivery" | "payment" | "trackToken" | "guest" | "coupon">>;

function itemsTable(order: NotifyOrder, l: Locale) {
  const money = (n: number) => formatAED(n, l);
  const c = copy[l].ui;
  const body = (order.items ?? []).map((i) => {
    const img = absolute(i.image);
    const variant = i.variantLabel?.[l] && i.variantLabel[l] !== i.name[l] ? `<div style="font:400 12px Arial,sans-serif;color:#6b6b6b;margin-top:2px">${esc(i.variantLabel[l])}</div>` : "";
    return `<tr><td width="64" style="padding:10px 0;border-bottom:1px solid #e7e3da">${img ? `<img src="${esc(img)}" width="56" height="56" alt="" style="display:block;width:56px;height:56px;object-fit:cover;border-radius:10px;border:1px solid #e7e3da">` : ""}</td>
<td style="padding:10px 12px;border-bottom:1px solid #e7e3da;font:600 14px Arial,sans-serif;color:#1c1a17">${esc(i.name[l])}${variant}<div style="font:400 12px Arial,sans-serif;color:#6b6b6b;margin-top:2px">${c.qty}: ${i.qty}</div></td>
<td align="${l === "ar" ? "left" : "right"}" style="padding:10px 0;border-bottom:1px solid #e7e3da;font:600 14px Arial,sans-serif;color:#1c1a17;white-space:nowrap">${money(i.lineTotal)}</td></tr>`;
  }).join("");
  return `<p style="margin:22px 0 6px;font:700 13px Arial,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:#6b6b6b">${c.items}</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #e7e3da">${body}</table>`;
}

async function orderEmail(order: NotifyOrder, kind: Kind, subject: string, l: Locale) {
  const b = await getBrand(l);
  const c = copy[l].ui;
  const money = (n: number) => formatAED(n, l);
  const name = order.address?.recipientName?.split(" ")[0] ?? "";
  const path = order.guest ? `/${l}/track/${order.orderNumber}?k=${order.trackToken}` : `/${l}/account/orders/${order.orderNumber}`;
  const link = `${siteUrl()}${path}`;
  let body: string; let pre: string;

  if (kind === "confirmation") {
    const t = order.totals;
    const a = order.address;
    const pay = order.payment?.method === "cod" ? c.cash(money(t?.total ?? 0)) : order.payment?.status === "paid" ? c.card : c.other;
    pre = c.preConfirm(order.orderNumber, money(t?.total ?? 0));
    body = h(c.thanks) + p(c.hi(esc(name))) + p(c.received(esc(order.orderNumber))) + itemsTable(order, l)
      + rows([
        ...(t ? [[c.subtotal, money(t.subtotal)] as [string, string]] : []),
        ...((t?.couponDiscount ?? 0) + (t?.offerDiscount ?? 0) > 0 ? [[c.discount, `-${money((t?.couponDiscount ?? 0) + (t?.offerDiscount ?? 0))}`] as [string, string]] : []),
        ...(t ? [[c.delivery, t.deliveryFee ? money(t.deliveryFee) : c.free] as [string, string]] : []),
        ...(t?.codFee ? [[c.cod, money(t.codFee)] as [string, string]] : []),
        ...(t && !t.taxIncluded && t.tax ? [[c.tax, money(t.tax)] as [string, string]] : []),
        [c.total, `<span style="font-size:17px;color:#0b6b57">${money(t?.total ?? 0)}</span>`],
      ])
      + rows([
        [c.ship, [a?.recipientName, [a?.building, a?.unit, a?.street].filter(Boolean).join(", "), [a?.area, a?.emirate].filter(Boolean).join(", "), a?.phone].filter(Boolean).map((x) => esc(x)).join("<br>")],
        ...(order.delivery?.estimate?.[l] ? [[c.est, esc(order.delivery.estimate[l])] as [string, string]] : []),
        [c.pay, esc(pay)],
      ])
      + button(link, c.track);
  } else if (kind === "payment_failed") {
    pre = c.failedTitle;
    body = h(c.failedTitle) + p(c.hi(esc(name))) + p(c.failedBody(esc(order.orderNumber))) + button(link, c.view);
  } else {
    const s = copy[l].status_names[order.status] ?? order.status;
    pre = c.statusLine(order.orderNumber, s).replace(/<\/?b>/g, "");
    body = h(c.update) + p(c.hi(esc(name))) + p(c.statusLine(esc(order.orderNumber), esc(s))) + button(link, c.view);
  }
  return { html: emailLayout(b, { preheader: pre, body }), subject: `${b.name} — ${subject}` };
}

/** Fire-and-forget safe: notification failures must never fail an order. */
export async function notifyOrder(order: NotifyOrder, kind: Kind) {
  try {
    const l = (order.locale ?? "en") as Locale; const c = copy[l];
    const msg = kind === "confirmation" ? c.confirmation(order.orderNumber, formatAED(order.totals?.total ?? 0, l))
      : kind === "payment_failed" ? c.payment_failed(order.orderNumber)
      : c.status(order.orderNumber, c.status_names[order.status] ?? order.status);
    if (order.email) {
      const mail = await orderEmail(order, kind, msg.subject, l);
      await getMailer().send({ to: order.email, subject: mail.subject, text: msg.text, html: mail.html });
    }
    if (order.address?.phone) await devSms.send(order.address.phone, msg.text);
  } catch (e) {
    console.warn("[notify] failed:", (e as Error).message);
  }
}
