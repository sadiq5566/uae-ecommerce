"use server";
import { z } from "zod";
import { normalizeUaePhone } from "@/features/auth/schemas";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { isLocale } from "@/lib/i18n";
import { captureLead } from "./leads";

export type LeadState = { ok?: boolean; error?: "email_invalid" | "phone_invalid" | "required" | "rate_limited" };

const emailOk = (v: string) => z.email().safeParse(v).success && v.length <= 254;

/** Welcome-modal / newsletter sign-up. Public endpoint: validated, rate-limited per IP, consent explicit. */
export async function captureLeadAction(_: LeadState, fd: FormData): Promise<LeadState> {
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const phoneRaw = String(fd.get("phone") ?? "").trim();
  const lang = String(fd.get("locale") ?? "en");
  const source = fd.get("source") === "newsletter" ? "newsletter" : "welcome_modal";
  if (!email && !phoneRaw) return { error: "required" };
  if (email && !emailOk(email)) return { error: "email_invalid" };
  const phone = phoneRaw ? normalizeUaePhone(phoneRaw) : null;
  if (phoneRaw && !phone) return { error: "phone_invalid" };
  if (!(await rateLimit(`lead:${await clientIp()}`, 8, 3600)).ok) return { error: "rate_limited" };
  await captureLead({ email: email || undefined, phone: phone ?? undefined, source, locale: isLocale(lang) ? lang : "en", consent: fd.get("consent") === "on" || source === "newsletter" });
  return { ok: true };
}
