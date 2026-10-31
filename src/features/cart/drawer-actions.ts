"use server";
import { getCurrentUser } from "@/lib/auth/session";
import { getProvider } from "@/lib/payments";
import { getAddresses, type AddressView } from "@/features/account/service";
import { creditSummary } from "@/features/credit/service";
import { getPublicOffers, type PublicOffers } from "@/features/offers/service";
import { availableMethods } from "@/features/checkout/prepare";
import type { PaymentMethod } from "@/models/order";
import { getBuyNowView, getCartView, type CartView } from "./service";

export type DrawerData = {
  cart: CartView; offers: PublicOffers;
  /** Everything the "Order now" popup needs, so it can open without another round trip. */
  quick: { guest: boolean; addresses: AddressView[]; methods: PaymentMethod[]; testMode: boolean; defaultName?: string; defaultPhone?: string; credit?: { balance: number } };
};

async function quickData(): Promise<DrawerData["quick"]> {
  const user = await getCurrentUser();
  const [methods, addresses, credit] = await Promise.all([availableMethods(), user ? getAddresses(user.id) : Promise.resolve([]), user ? creditSummary(user.id) : Promise.resolve(null)]);
  return { guest: !user, addresses, methods, testMode: !!getProvider()?.testOnly, defaultName: user?.name, defaultPhone: user?.phone, credit: credit && credit.balanceFils > 0 ? { balance: credit.balance } : undefined };
}

/** One call for the slide-out cart: the validated cart plus the shopper's saved addresses and payment methods. */
export async function getCartDrawerAction(): Promise<DrawerData> {
  const [cart, offers, quick] = await Promise.all([getCartView(), getPublicOffers(), quickData()]);
  return { cart, offers, quick };
}

/** "Order now" on a product: a one-item view (the real cart is untouched) plus what the order popup needs. */
export async function getQuickOrderAction(sku: string, qty: number): Promise<{ cart: CartView; quick: DrawerData["quick"] } | null> {
  if (typeof sku !== "string" || !/^[A-Za-z0-9_-]{1,60}$/.test(sku)) return null;
  const [cart, quick] = await Promise.all([getBuyNowView(sku.toUpperCase(), Number(qty)), quickData()]);
  return cart.lines.length === 1 && cart.lines[0].status === "ok" ? { cart, quick } : null;
}

/** Just the cart, for refreshing the slide-out after a quantity change. */
export async function getCartOnlyAction(): Promise<CartView> {
  return getCartView();
}
