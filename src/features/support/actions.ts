"use server";
import { isLocale, type Locale } from "@/lib/i18n";
import { button, emailLayout, esc, getBrand, h, p, rows } from "@/lib/email";
import { getMailer } from "@/lib/mailer";
import { clientIp, rateLimit } from "@/lib/rate-limit";

import { TOPICS, type Topic } from "./topics";

export type SupportState = { ok?: boolean; error?: "invalid" | "rate_limited" | "failed"; fieldErrors?: Record<string, true>; values?: Record<string, string> };

const TOPIC_LABEL: Record<Locale, Record<Topic, string>> = {
  en: { complaint: "Complaint", refund: "Refund", exchange: "Exchange", order: "Order question", other: "Other" },
  ar: { complaint: "شكوى", refund: "استرداد", exchange: "استبدال", order: "استفسار عن طلب", other: "أخرى" },
};

/** Contact form: mails the support inbox (reply-to = the customer) and sends the customer a branded receipt. */
export async function sendSupportMessage(_: SupportState, fd: FormData): Promise<SupportState> {
  const s = (k: string, max: number) => String(fd.get(k) ?? "").trim().slice(0, max);
  const locale = isLocale(s("locale", 2)) ? (s("locale", 2) as Locale) : "en";
  const values = { name: s("name", 80), email: s("email", 120), topic: s("topic", 20), order: s("order", 30), message: s("message", 3000) };
  if (s("website", 100)) return { ok: true }; // honeypot: bots fill every field
  const bad: Record<string, true> = {};
  if (values.name.length < 2) bad.name = true;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(values.email)) bad.email = true;
  if (values.message.length < 10) bad.message = true;
  if (!TOPICS.includes(values.topic as Topic)) values.topic = "other";
  if (Object.keys(bad).length) return { error: "invalid", fieldErrors: bad, values };

  const rl = await rateLimit(`support:${await clientIp()}`, 5, 3600);
  if (!rl.ok) return { error: "rate_limited", values };

  const topic = values.topic as Topic;
  const mailer = getMailer();
  const bEn = await getBrand("en");
  if (!bEn.supportEmail) return { error: "failed", values };
  const t = TOPIC_LABEL.en[topic];
  const staff = await mailer.send({
    to: bEn.supportEmail, replyTo: values.email, subject: `[${t}] ${values.name}${values.order ? ` — ${values.order}` : ""}`,
    text: `${t}\nFrom: ${values.name} <${values.email}>\nOrder: ${values.order || "-"}\n\n${values.message}`,
    html: emailLayout(bEn, { preheader: `${t} from ${values.name}`, body: h(`${t} — new message`) + rows([["Name", esc(values.name)], ["Email", `<a href="mailto:${esc(values.email)}" style="color:#0b6b57">${esc(values.email)}</a>`], ["Order", esc(values.order || "—")], ["Language", locale.toUpperCase()]]) + `<div style="padding:14px 16px;background:#f4f1ea;border-radius:12px;font:400 15px/1.65 Arial,sans-serif;color:#1c1a17;white-space:pre-wrap">${esc(values.message)}</div>` + p(`<span style="color:#6b6b6b;font-size:13px">Reply to this email to answer the customer directly.</span>`) }),
  });
  if (!staff.sent && process.env.NODE_ENV === "production") return { error: "failed", values };

  // Receipt to the customer (best effort).
  const b = await getBrand(locale);
  const ar = locale === "ar";
  await mailer.send({
    to: values.email, subject: `${b.name} — ${ar ? "استلمنا رسالتك" : "We received your message"}`,
    text: ar ? "شكراً لتواصلك. استلمنا رسالتك وسيرد عليك فريقنا قريباً." : "Thanks for getting in touch. We received your message and our team will reply soon.",
    html: emailLayout(b, { preheader: ar ? "استلمنا رسالتك" : "We received your message", body: h(ar ? "استلمنا رسالتك" : "We received your message") + p(ar ? `مرحباً ${esc(values.name)}، شكراً لتواصلك معنا (${esc(TOPIC_LABEL.ar[topic])}). سيرد عليك فريق الدعم خلال يوم عمل واحد غالباً.` : `Hi ${esc(values.name)}, thanks for contacting us (${esc(TOPIC_LABEL.en[topic])}). Our support team usually replies within one business day.`) + `<div style="padding:14px 16px;background:#f4f1ea;border-radius:12px;font:400 14px/1.65 Arial,sans-serif;color:#6b6b6b;white-space:pre-wrap">${esc(values.message)}</div>` + button(b.url, ar ? "متابعة التسوق" : "Continue shopping") }),
  }).catch(() => undefined);
  return { ok: true };
}
