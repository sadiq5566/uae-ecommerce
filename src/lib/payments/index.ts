import { mockProvider } from "./mock";
import { stripeProvider } from "./stripe";
import { tabbyProvider } from "./tabby";
import type { PaymentMethod } from "@/models/order";
import type { PaymentProvider } from "./types";

/**
 * The "primary" provider is selected by PAYMENT_PROVIDER. "mock" is refused in production, so a misconfigured deploy can never
 * fake payments; with no provider, online card payment is simply unavailable and only COD is offered.
 */
export function getProvider(): PaymentProvider | null {
  const id = process.env.PAYMENT_PROVIDER;
  if (id === "mock") return process.env.NODE_ENV === "production" ? null : mockProvider;
  if (id === "stripe") return process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET && (process.env.STRIPE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) ? stripeProvider : null;
  // case "network": return networkProvider; … (add adapters here)
  return null;
}

/** Tabby (Pay in 4) runs alongside the primary provider whenever its three variables are set. */
const tabbyEnabled = () => !!(process.env.TABBY_SECRET_KEY && process.env.TABBY_MERCHANT_CODE && process.env.TABBY_WEBHOOK_SECRET);

/** Every provider that is really configured, in checkout display order. */
export function getProviders(): PaymentProvider[] {
  return [getProvider(), tabbyEnabled() ? tabbyProvider : null].filter((p): p is PaymentProvider => !!p);
}

export const getProviderById = (id: string | undefined) => getProviders().find((p) => p.id === id) ?? null;
export const getProviderForMethod = (m: PaymentMethod) => getProviders().find((p) => (p.methods as readonly string[]).includes(m)) ?? null;
