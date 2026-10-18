import "server-only";
import { formatAED, type Locale } from "@/lib/i18n";
import { getMailer } from "@/lib/mailer";
import type { OrderDoc } from "@/models/order";

type Kind = "confirmation" | "status" | "payment_failed";

const copy = {
  en: {
    confirmation: (n: string, total: string) => ({ subject: `Order ${n} confirmed`, text: `Thank you! Your order ${n} (${total}) has been received.` }),
    status: (n: string, s: string) => ({ subject: `Order ${n} update`, text: `Your order ${n} is now: ${s}.` }),
    payment_failed: (n: string) => ({ subject: `Payment issue for order ${n}`, text: `We couldn't confirm payment for order ${n}. You can retry from your account.` }),
    status_names: { confirmed: "confirmed", processing: "being prepared", packed: "packed", out_for_delivery: "out for delivery", delivered: "delivered", cancelled: "cancelled", refund_pending: "refund pending", refunded: "refunded", pending_payment: "awaiting payment" } as Record<string, string>,
  },
  ar: {
    confirmation: (n: string, total: string) => ({ subject: `تم تأكيد الطلب ${n}`, text: `شكراً لك! تم استلام طلبك ${n} (${total}).` }),
    status: (n: string, s: string) => ({ subject: `تحديث الطلب ${n}`, text: `حالة طلبك ${n} الآن: ${s}.` }),
    payment_failed: (n: string) => ({ subject: `مشكلة في دفع الطلب ${n}`, text: `تعذّر تأكيد الدفع للطلب ${n}. يمكنك إعادة المحاولة من حسابك.` }),
    status_names: { confirmed: "مؤكد", processing: "قيد التجهيز", packed: "تم التغليف", out_for_delivery: "خرج للتوصيل", delivered: "تم التسليم", cancelled: "ملغى", refund_pending: "استرداد قيد المعالجة", refunded: "تم الاسترداد", pending_payment: "بانتظار الدفع" } as Record<string, string>,
  },
};

/** SMS provider interface — no SMS gateway is configured, so this only logs in development. */
export interface SmsProvider { send(to: string, text: string): Promise<{ sent: boolean }>; }
const devSms: SmsProvider = { async send(to, text) { if (process.env.NODE_ENV !== "production") console.info(`[sms:dev — NOT SENT] ${to}: ${text}`); return { sent: false }; } };

/** Fire-and-forget safe: notification failures must never fail an order. */
export async function notifyOrder(order: Pick<OrderDoc, "orderNumber" | "email" | "locale" | "status" | "totals" | "address">, kind: Kind) {
  try {
    const l = (order.locale ?? "en") as Locale; const c = copy[l];
    const msg = kind === "confirmation" ? c.confirmation(order.orderNumber, formatAED(order.totals?.total ?? 0, l))
      : kind === "payment_failed" ? c.payment_failed(order.orderNumber)
      : c.status(order.orderNumber, c.status_names[order.status] ?? order.status);
    if (order.email) await getMailer().send({ to: order.email, subject: msg.subject, text: msg.text });
    if (order.address?.phone) await devSms.send(order.address.phone, msg.text);
  } catch (e) {
    console.warn("[notify] failed:", (e as Error).message);
  }
}
