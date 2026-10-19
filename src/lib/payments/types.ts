import type { PaymentMethod } from "@/models/order";

/**
 * Payment gateway adapter. Business code only talks to this interface, so a real gateway (Network International,
 * Telr, PayTabs, Checkout.com, Stripe… — confirm UAE availability and Apple Pay / Google Pay support with your
 * provider and merchant account) is a new file, not a rewrite.
 */
export type PaymentEventType = "payment.succeeded" | "payment.failed" | "payment.cancelled" | "refund.succeeded";

export type PaymentEvent = {
  id: string; // provider event id — used for idempotency
  type: PaymentEventType;
  orderNumber: string;
  providerRef: string;
  amount: number; // AED, as reported by the provider
  currency: string;
  reason?: string;
};

/** Extra order details some gateways (Tabby) require to score the customer. */
export type BuyerDetails = {
  name: string; phone: string; email?: string; city: string; address: string; lang: "en" | "ar"; registeredSince?: Date;
  items: { title: string; quantity: number; unitPrice: number; category: string }[];
};

export interface PaymentProvider {
  id: string;
  /** Methods this provider can really process (e.g. Apple Pay only if domain-verified & enabled at the gateway). */
  methods: readonly Exclude<PaymentMethod, "cod">[];
  testOnly: boolean;
  /** Create a hosted payment session; the customer is redirected to `redirectUrl`. */
  createPayment(input: { orderNumber: string; amount: number; currency: string; method: PaymentMethod; returnUrl: string; email?: string; buyer?: BuyerDetails }): Promise<{ redirectUrl: string; providerRef: string }>;
  /** Verify the signature of a raw webhook request and parse it. Return null when invalid. */
  verifyWebhook(rawBody: string, headers: Headers): PaymentEvent | null;
  /** Optional: re-check a verified event against the provider's server API (and e.g. capture) before it is applied. Return null to reject. */
  confirmEvent?(event: PaymentEvent): Promise<PaymentEvent | null>;
  /** Ask the provider's server API for the truth about a payment (used for reconciliation). Optional. */
  fetchStatus?(providerRef: string): Promise<"paid" | "failed" | "pending">;
  /** Request a refund. Must NOT be reported as done until the provider confirms via refund.succeeded. */
  refund?(input: { providerRef: string; amount: number }): Promise<{ accepted: boolean }>;
}
