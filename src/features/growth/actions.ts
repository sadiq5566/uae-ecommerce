"use server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { isLocale } from "@/lib/i18n";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { getGuestId } from "@/features/cart/service";
import { rememberCheckoutEmail } from "./abandoned-cart";
import { subscribeStockAlert } from "./stock-alerts";

const email = z.string().trim().toLowerCase().max(254).pipe(z.email());
const skuOk = (s: unknown): s is string => typeof s === "string" && /^[A-Za-z0-9_-]{1,60}$/.test(s);

/** Guests: the email typed at checkout, so an abandoned bag can be followed up once. Never an error to the shopper. */
export async function rememberCartEmailAction(raw: unknown, locale: unknown) {
  const e = email.safeParse(raw);
  const guestId = await getGuestId();
  if (!e.success || !guestId || !isLocale(String(locale))) return;
  if (!(await rateLimit(`cart-email:${guestId}`, 20, 3600)).ok) return;
  await rememberCheckoutEmail(guestId, e.data, locale as "en" | "ar");
}

export type AlertState = { ok?: boolean; error?: string };

/** "Tell me when it's back" on an out-of-stock product. Signed-in customers don't retype their email. */
export async function notifyWhenBackAction(_: AlertState, fd: FormData): Promise<AlertState> {
  const sku = fd.get("sku"); const lang = String(fd.get("locale") ?? "en");
  const user = await getCurrentUser();
  const e = email.safeParse(user?.email ?? fd.get("email"));
  if (!e.success) return { error: "email_invalid" };
  if (!skuOk(sku) || !isLocale(lang)) return { error: "invalid" };
  if (!(await rateLimit(`stock-alert:${await clientIp()}`, 10, 3600)).ok) return { error: "rate_limited" };
  const r = await subscribeStockAlert({ sku: sku.toUpperCase(), email: e.data, locale: lang, userId: user?.id });
  return r.ok ? { ok: true } : { error: r.error === "in_stock" ? "in_stock" : "not_found" };
}
