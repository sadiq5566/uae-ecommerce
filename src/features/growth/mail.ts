import "server-only";
import { emailLayout, getBrand } from "@/lib/email";
import type { Locale } from "@/lib/i18n";
import { getMailer } from "@/lib/mailer";

/**
 * Branded marketing/lifecycle email. Answers whether the job may consider it delivered: in production only a real send counts
 * (so an SMTP outage is retried on the next run); in development the console mailer counts, so jobs don't loop.
 */
export async function sendLifecycleEmail(to: string, locale: Locale, subject: string, preheader: string, body: string, text: string): Promise<boolean> {
  const b = await getBrand(locale);
  const res = await getMailer().send({ to, subject: `${b.name} — ${subject}`, text, html: emailLayout(b, { preheader, body }) });
  return res.sent || process.env.NODE_ENV !== "production";
}

export const dateIn = (l: Locale, d: Date) => new Intl.DateTimeFormat(l === "ar" ? "ar-AE" : "en-AE", { dateStyle: "long", timeZone: "Asia/Dubai" }).format(d);
