import "server-only";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { connectDb } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { Cart } from "@/models/cart";
import { Product } from "@/models/product";

export const MAX_QTY = 10;
export const MAX_LINES = 50;
const GUEST_COOKIE = "cart_id";
const GUEST_TTL_MS = 30 * 24 * 3600 * 1000;

type L10n = { en: string; ar: string };
export type LineStatus = "ok" | "reduced" | "out_of_stock" | "unavailable";
export type CartLine = {
  sku: string; productId: string; slug: string; name: L10n; variantLabel?: L10n; icon: string; hue: number; image?: string;
  unitPrice: number; listPrice: number; priceAtAdd: number; priceChanged: boolean;
  qty: number; requestedQty: number; stock: number; status: LineStatus; lineTotal: number;
};
export type CartView = { lines: CartLine[]; itemCount: number; subtotal: number; hasIssues: boolean };

type ProductRow = {
  _id: unknown; slug: string; sku: string; name: L10n; icon: string; hue: number; images?: { url: string }[];
  price: number; finalPrice: number; stock: number; variants?: { sku: string; label: L10n; stock: number; price?: number }[];
};

/** Who owns the cart right now. Pass create=true only from actions/route handlers (cookies are writable there). */
async function owner(create: boolean): Promise<{ user: string } | { guestId: string } | null> {
  const user = await getCurrentUser();
  if (user) return { user: user.id };
  const jar = await cookies();
  let id = jar.get(GUEST_COOKIE)?.value;
  if (id && !/^[A-Za-z0-9_-]{20,64}$/.test(id)) id = undefined;
  if (!id && create) {
    id = randomBytes(24).toString("base64url");
    jar.set(GUEST_COOKIE, id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: GUEST_TTL_MS / 1000 });
  }
  return id ? { guestId: id } : null;
}

async function resolve(skus: string[]) {
  if (!skus.length) return new Map<string, { p: ProductRow; v?: NonNullable<ProductRow["variants"]>[number] }>();
  const rows = (await Product.find({ status: "published", $or: [{ sku: { $in: skus } }, { "variants.sku": { $in: skus } }] }).lean()) as unknown as ProductRow[];
  const map = new Map<string, { p: ProductRow; v?: NonNullable<ProductRow["variants"]>[number] }>();
  for (const p of rows) {
    if (p.variants?.length) p.variants.forEach((v) => map.set(v.sku, { p, v }));
    else map.set(p.sku, { p });
  }
  return map;
}

/** Pure: the quantity we will actually allow for a requested quantity and available stock. */
export const clampQty = (requested: number, stock: number) => Math.max(0, Math.min(Math.floor(requested), stock, MAX_QTY));

export function buildLines(items: { sku: string; qty: number; priceAtAdd: number }[], found: Awaited<ReturnType<typeof resolve>>): CartLine[] {
  return items.map((it) => {
    const hit = found.get(it.sku);
    if (!hit) {
      return { sku: it.sku, productId: "", slug: "", name: { en: it.sku, ar: it.sku }, icon: "📦", hue: 160, unitPrice: 0, listPrice: 0, priceAtAdd: it.priceAtAdd, priceChanged: false, qty: 0, requestedQty: it.qty, stock: 0, status: "unavailable" as const, lineTotal: 0 };
    }
    const { p, v } = hit;
    const stock = v ? v.stock : p.stock;
    const unit = v?.price ?? p.finalPrice;
    const qty = clampQty(it.qty, stock);
    const status: LineStatus = stock === 0 ? "out_of_stock" : qty < it.qty ? "reduced" : "ok";
    return {
      sku: it.sku, productId: String(p._id), slug: p.slug, name: p.name, variantLabel: v?.label, icon: p.icon, hue: p.hue, image: p.images?.[0]?.url,
      unitPrice: unit, listPrice: p.price, priceAtAdd: it.priceAtAdd, priceChanged: Math.abs(unit - it.priceAtAdd) > 0.001,
      qty, requestedQty: it.qty, stock, status, lineTotal: Math.round(unit * qty * 100) / 100,
    };
  });
}

export function summarize(lines: CartLine[]): CartView {
  const ok = lines.filter((l) => l.qty > 0);
  return {
    lines, itemCount: ok.reduce((a, l) => a + l.qty, 0),
    subtotal: Math.round(ok.reduce((a, l) => a + l.lineTotal, 0) * 100) / 100,
    hasIssues: lines.some((l) => l.status !== "ok" || l.priceChanged),
  };
}

/** Server-validated cart view: prices and stock always come from the catalogue, never from the stored cart. */
export async function getCartView(): Promise<CartView> {
  const o = await owner(false);
  if (!o) return summarize([]);
  await connectDb();
  const cart = await Cart.findOne(o).lean();
  const items = cart?.items ?? [];
  return summarize(buildLines(items, await resolve(items.map((i) => i.sku))));
}

export async function getCartCount() {
  return (await getCartView()).itemCount;
}

export type CartResult = { ok: boolean; error?: "unavailable" | "out_of_stock" | "too_many_lines" | "invalid"; count: number; qty?: number };

async function mutate(fn: (items: { sku: string; qty: number; priceAtAdd: number }[]) => Promise<{ items: { sku: string; qty: number; priceAtAdd: number }[]; error?: CartResult["error"]; qty?: number }>): Promise<CartResult> {
  const o = await owner(true);
  if (!o) return { ok: false, error: "invalid", count: 0 };
  await connectDb();
  const cart = (await Cart.findOne(o)) ?? new Cart({ ...o });
  const res = await fn(cart.items.map((i) => ({ sku: i.sku, qty: i.qty, priceAtAdd: i.priceAtAdd })));
  if (res.error) return { ok: false, error: res.error, count: summarize(buildLines(cart.items, await resolve(cart.items.map((i) => i.sku)))).itemCount };
  cart.set("items", res.items);
  if ("guestId" in o) cart.expiresAt = new Date(Date.now() + GUEST_TTL_MS);
  await cart.save();
  const view = summarize(buildLines(res.items, await resolve(res.items.map((i) => i.sku))));
  return { ok: true, count: view.itemCount, qty: res.qty };
}

export function addItem(sku: string, qty: number) {
  return mutate(async (items) => {
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) return { items, error: "invalid" };
    const hit = (await resolve([sku])).get(sku);
    if (!hit) return { items, error: "unavailable" };
    const stock = hit.v ? hit.v.stock : hit.p.stock;
    if (stock === 0) return { items, error: "out_of_stock" };
    const price = hit.v?.price ?? hit.p.finalPrice;
    const existing = items.find((i) => i.sku === sku);
    if (!existing && items.length >= MAX_LINES) return { items, error: "too_many_lines" };
    const next = clampQty((existing?.qty ?? 0) + qty, stock);
    const out = existing ? items.map((i) => (i.sku === sku ? { sku, qty: next, priceAtAdd: price } : i)) : [...items, { sku, qty: next, priceAtAdd: price }];
    return { items: out, qty: next };
  });
}

export function setQty(sku: string, qty: number) {
  return mutate(async (items) => {
    if (!Number.isInteger(qty) || qty < 0 || qty > MAX_QTY) return { items, error: "invalid" };
    if (qty === 0) return { items: items.filter((i) => i.sku !== sku) };
    const hit = (await resolve([sku])).get(sku);
    if (!hit) return { items, error: "unavailable" };
    const stock = hit.v ? hit.v.stock : hit.p.stock;
    if (stock === 0) return { items, error: "out_of_stock" };
    const price = hit.v?.price ?? hit.p.finalPrice;
    const next = clampQty(qty, stock);
    return { items: items.map((i) => (i.sku === sku ? { sku, qty: next, priceAtAdd: price } : i)), qty: next };
  });
}

export const removeItem = (sku: string) => mutate(async (items) => ({ items: items.filter((i) => i.sku !== sku) }));

/** Merge quantities of two item lists by SKU (no duplicate lines), clamped by stock. Pure given `stockOf`. */
export function mergeItems(
  base: { sku: string; qty: number; priceAtAdd: number }[], extra: { sku: string; qty: number; priceAtAdd: number }[],
  stockOf: (sku: string) => number | undefined,
) {
  const map = new Map(base.map((i) => [i.sku, { ...i }]));
  for (const e of extra) {
    const cur = map.get(e.sku);
    map.set(e.sku, cur ? { ...cur, qty: cur.qty + e.qty } : { ...e });
  }
  return [...map.values()]
    .map((i) => ({ ...i, qty: clampQty(i.qty, stockOf(i.sku) ?? 0) || Math.min(i.qty, MAX_QTY) }))
    .slice(0, MAX_LINES);
}

/** After sign-in/sign-up: fold the guest cart into the user's cart and drop the guest cart + cookie. */
export async function mergeGuestCart(userId: string) {
  const jar = await cookies();
  const guestId = jar.get(GUEST_COOKIE)?.value;
  if (!guestId) return;
  await connectDb();
  const guest = await Cart.findOne({ guestId });
  if (guest?.items.length) {
    const userCart = (await Cart.findOne({ user: userId })) ?? new Cart({ user: userId });
    const guestItems = guest.items.map((i) => ({ sku: i.sku, qty: i.qty, priceAtAdd: i.priceAtAdd }));
    const userItems = userCart.items.map((i) => ({ sku: i.sku, qty: i.qty, priceAtAdd: i.priceAtAdd }));
    const found = await resolve([...new Set([...guestItems, ...userItems].map((i) => i.sku))]);
    const stockOf = (sku: string) => { const h = found.get(sku); return h ? (h.v ? h.v.stock : h.p.stock) : undefined; };
    userCart.set("items", mergeItems(userItems, guestItems, stockOf));
    await userCart.save();
  }
  await Cart.deleteOne({ guestId });
  jar.delete(GUEST_COOKIE);
}
