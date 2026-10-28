/**
 * Owner alert for every new order: WhatsApp (CallMeBot, free) + email. Never throws; a failed alert must not affect an order.
 * Env (all optional): ADMIN_ALERT_EMAIL, ADMIN_ALERT_WHATSAPP, CALLMEBOT_APIKEY, STORE_NAME (defaults to the site hostname).
 * CallMeBot one-time setup: from the WhatsApp number, message +34 644 51 95 23 "I allow callmebot to send me messages"; it replies with the apikey.
 */
import "server-only";
import nodemailer from "nodemailer";

export type OrderAlert = { orderNumber: string; total: number; name?: string; phone?: string; area?: string; payment?: string; items?: { name: string; qty: number }[] };

const ADMIN_EMAIL = () => process.env.ADMIN_ALERT_EMAIL || "admin@oasishomemarket.org";
const ADMIN_WA = () => (process.env.ADMIN_ALERT_WHATSAPP || "+971589857250").replace(/\D/g, "");
const storeLabel = () => {
  if (process.env.STORE_NAME) return process.env.STORE_NAME;
  try { return new URL(process.env.NEXT_PUBLIC_SITE_URL || "").hostname.replace(/^www\./, ""); } catch { return "Store"; }
};

function summary(o: OrderAlert) {
  const lines = (o.items ?? []).slice(0, 8).map((i) => `• ${i.qty}× ${i.name}`);
  return [`🛒 New order ${o.orderNumber} — ${storeLabel()}`, `Total: AED ${Number(o.total).toFixed(2)}${o.payment ? ` (${o.payment})` : ""}`,
    [o.name, o.phone, o.area].filter(Boolean).join(" · "), ...lines].filter(Boolean).join("\n");
}

async function whatsapp(text: string) {
  const key = process.env.CALLMEBOT_APIKEY;
  if (!key) return console.warn("[alert] CALLMEBOT_APIKEY not set; WhatsApp alert skipped");
  const r = await fetch(`https://api.callmebot.com/whatsapp.php?phone=${ADMIN_WA()}&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new Error(`CallMeBot ${r.status}`);
}

async function email(subject: string, text: string) {
  if (!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)) return console.warn("[alert] SMTP not configured; email alert skipped");
  const port = Number(process.env.SMTP_PORT) || 465;
  const tr = nodemailer.createTransport({ host: process.env.SMTP_HOST, port, secure: port === 465, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }, connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000 });
  await tr.sendMail({ from: process.env.EMAIL_FROM || process.env.SMTP_USER, to: ADMIN_EMAIL(), subject, text });
}
export async function alertAdminNewOrder(o: OrderAlert) {
  const text = summary(o);
  const res = await Promise.allSettled([whatsapp(text), email(`New order ${o.orderNumber} — ${storeLabel()} — AED ${Number(o.total).toFixed(2)}`, text)]);
  res.forEach((r) => r.status === "rejected" && console.warn("[alert] failed:", (r.reason as Error)?.message));
}
