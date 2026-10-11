import { mockProvider } from "./mock";
import type { PaymentProvider } from "./types";

/**
 * Selected by PAYMENT_PROVIDER. "mock" is refused in production, so a misconfigured deploy can never fake payments;
 * with no provider, online payment is simply unavailable and only COD is offered.
 */
export function getProvider(): PaymentProvider | null {
  const id = process.env.PAYMENT_PROVIDER;
  if (id === "mock") return process.env.NODE_ENV === "production" ? null : mockProvider;
  // case "stripe": return stripeProvider; case "network": return networkProvider; … (add adapters here)
  return null;
}
