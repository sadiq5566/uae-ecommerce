"use server";
import { revalidatePath } from "next/cache";
import { Types } from "mongoose";
import { FORBIDDEN, actor } from "@/lib/admin/guard";
import { audit } from "@/lib/admin/audit";
import type { FormState } from "@/features/auth/schemas";
import { completeReturn, receiveReturn, reviewReturn, type ReturnError } from "@/features/returns/service";

const MSG: Record<ReturnError, string> = {
  not_found: "Return not found.", not_delivered: "The order isn't delivered.", window_closed: "The return window has closed.", invalid_items: "Invalid items.",
  invalid_exchange: "Invalid exchange.", exchange_unavailable: "The replacement is out of stock.", invalid_state: "This return changed — reload and try again.",
  out_of_stock: "The replacement is out of stock. Restock it, or ask the customer to take store credit.",
};
const note = (fd: FormData) => String(fd.get("note") ?? "").trim().slice(0, 300);
const idOf = (fd: FormData) => { const id = String(fd.get("id") ?? ""); return Types.ObjectId.isValid(id) ? id : null; };
const refresh = (id: string) => { revalidatePath(`/admin/returns/${id}`); revalidatePath("/admin/returns"); revalidatePath("/[lang]/track/[number]", "page"); revalidatePath("/[lang]/account/orders/[number]", "page"); };

export async function reviewReturnAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await actor("orders:write");
  if (!user) return { error: FORBIDDEN };
  const id = idOf(fd); const to = fd.get("to") === "rejected" ? "rejected" : "approved";
  if (!id) return { error: MSG.not_found };
  if (to === "rejected" && !note(fd)) return { error: "Tell the customer why the return can't be approved." };
  const r = await reviewReturn(id, to, user.id, note(fd) || undefined);
  if (!r.ok) return { error: MSG[r.error] };
  await audit(user, `return.${to}`, "return", id, `Return ${to}`);
  refresh(id); return { ok: true };
}

export async function receiveReturnAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await actor("orders:write");
  if (!user) return { error: FORBIDDEN };
  const id = idOf(fd);
  if (!id) return { error: MSG.not_found };
  const r = await receiveReturn(id, user.id, fd.get("restock") === "on", note(fd) || undefined);
  if (!r.ok) return { error: MSG[r.error] };
  await audit(user, "return.received", "return", id, "Return items received", { restocked: fd.get("restock") === "on" });
  refresh(id); return { ok: true };
}

export async function completeReturnAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await actor("orders:write");
  if (!user) return { error: FORBIDDEN };
  const id = idOf(fd);
  if (!id) return { error: MSG.not_found };
  const r = await completeReturn(id, user.id, note(fd) || undefined);
  if (!r.ok) return { error: MSG[r.error] };
  await audit(user, "return.completed", "return", id, r.creditCode ? `Return completed — store credit ${r.creditCode}` : "Return completed — exchange dispatched", { creditAmount: r.creditAmount });
  refresh(id); return { ok: true, values: { message: r.creditCode ? `Store credit ${r.creditCode} (AED ${r.creditAmount?.toFixed(2)}) was issued and sent to the customer.` : "Exchange recorded and replacement stock taken." } };
}
