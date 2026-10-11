"use server";
import { revalidatePath } from "next/cache";
import { addItem, removeItem, setQty, type CartResult } from "./service";

const skuOk = (s: unknown): s is string => typeof s === "string" && /^[A-Za-z0-9_-]{1,60}$/.test(s);
const bad: CartResult = { ok: false, error: "invalid", count: 0 };

// Server actions are public endpoints: validate everything, trust nothing from the client.
export async function addToCartAction(sku: string, qty: number): Promise<CartResult> {
  if (!skuOk(sku)) return bad;
  return addItem(sku.toUpperCase(), Number(qty));
}
export async function setQtyAction(sku: string, qty: number): Promise<CartResult> {
  if (!skuOk(sku)) return bad;
  const r = await setQty(sku.toUpperCase(), Number(qty));
  revalidatePath("/[lang]/cart", "page");
  return r;
}
export async function removeFromCartAction(sku: string): Promise<CartResult> {
  if (!skuOk(sku)) return bad;
  const r = await removeItem(sku.toUpperCase());
  revalidatePath("/[lang]/cart", "page");
  return r;
}
