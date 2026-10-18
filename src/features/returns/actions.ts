"use server";
import { timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/session";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { RETURN_REASONS, RETURN_RESOLUTIONS, type ReturnReason, type ReturnResolution } from "@/models/return-request";
import { cancelReturn, createReturn, orderForReturns } from "./service";

export type ReturnFormState = { ok?: boolean; number?: string; error?: string };

const sameToken = (a?: string | null, b?: string) => !!a && !!b && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Owner (signed in) or holder of the order's secret tracking token. Returns the order or null. */
async function authorizedOrder(orderNumber: string, token: string) {
  const order = await orderForReturns(orderNumber);
  if (!order) return null;
  const user = await getCurrentUser();
  if (user && order.user && String(order.user) === user.id) return order;
  return sameToken(order.trackToken, token) ? order : null;
}

export async function submitReturnAction(_: ReturnFormState, fd: FormData): Promise<ReturnFormState> {
  const orderNumber = String(fd.get("orderNumber") ?? ""); const token = String(fd.get("token") ?? "");
  const order = await authorizedOrder(orderNumber, token);
  if (!order) return { error: "not_found" };
  if (!(await rateLimit(`return:${orderNumber}:${await clientIp()}`, 6, 3600)).ok) return { error: "rate_limited" };

  const resolution = String(fd.get("resolution")) as ReturnResolution; const reason = String(fd.get("reason")) as ReturnReason;
  if (!RETURN_RESOLUTIONS.includes(resolution) || !RETURN_REASONS.includes(reason)) return { error: "invalid_items" };
  const items = order.items.flatMap((i) => {
    const qty = Number(fd.get(`qty_${i.sku}`)); // the order's own items are the allow-list; the form only supplies quantities
    return Number.isInteger(qty) && qty > 0 ? [{ sku: i.sku, qty, exchangeSku: String(fd.get(`exchange_${i.sku}`) ?? "") || undefined }] : [];
  });
  const r = await createReturn({ order, items, resolution, reason, note: String(fd.get("note") ?? "").trim().slice(0, 500) });
  if (!r.ok) return { error: r.error };
  revalidatePath("/[lang]/track/[number]", "page"); revalidatePath("/[lang]/account/orders/[number]", "page");
  return { ok: true, number: r.number };
}

export async function cancelReturnAction(fd: FormData) {
  const order = await authorizedOrder(String(fd.get("orderNumber") ?? ""), String(fd.get("token") ?? ""));
  if (!order) return;
  await cancelReturn(String(fd.get("id") ?? ""), order._id);
  revalidatePath("/[lang]/track/[number]", "page"); revalidatePath("/[lang]/account/orders/[number]", "page");
}
