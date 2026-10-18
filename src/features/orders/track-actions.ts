"use server";
import { redirect } from "next/navigation";
import { normalizeUaePhone } from "@/features/auth/schemas";
import { isLocale } from "@/lib/i18n";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { findTrackToken } from "./queries";

export type TrackState = { error?: "notFound" | "rateLimited"; number?: string; phone?: string };

/** Public order lookup: order number + phone. Rate-limited per IP so numbers can't be brute-forced. */
export async function trackOrderAction(_: TrackState, fd: FormData): Promise<TrackState> {
  const lang = String(fd.get("locale") ?? "en"); const locale = isLocale(lang) ? lang : "en";
  const number = String(fd.get("orderNumber") ?? "").trim().toUpperCase().slice(0, 20);
  const phoneRaw = String(fd.get("phone") ?? "").trim().slice(0, 30);
  const echo = { number, phone: phoneRaw };
  if (!(await rateLimit(`track:${await clientIp()}`, 10, 900)).ok) return { error: "rateLimited", ...echo };
  const phone = normalizeUaePhone(phoneRaw);
  if (!phone || !/^UAE-[A-Z0-9]{8}$/.test(number)) return { error: "notFound", ...echo };
  const token = await findTrackToken(number, phone);
  if (!token) return { error: "notFound", ...echo };
  redirect(`/${locale}/track/${number}?k=${token}`);
}
