"use server";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getProvider } from "@/lib/payments";
import { signedMockEvent } from "@/lib/payments/mock";
import { handleWebhook } from "./payment-events";
import { getOrderForUser } from "./queries";

/**
 * TEST-ONLY: plays the gateway's role by sending a correctly SIGNED event through the same verification and
 * processing path as the real webhook. Unavailable unless the mock provider is active (never in production).
 */
export async function mockPayAction(fd: FormData) {
  const provider = getProvider();
  if (!provider || provider.id !== "mock") throw new Error("Mock payments are disabled");
  const user = await getCurrentUser();
  const number = String(fd.get("orderNumber") ?? "");
  const lang = String(fd.get("locale") ?? "en") === "ar" ? "ar" : "en";
  if (!user) redirect(`/${lang}/login`);
  const order = await getOrderForUser(number, user.id);
  if (!order?.payment.providerRef) redirect(`/${lang}/account/orders`);
  const outcome = String(fd.get("outcome"));
  const type = outcome === "succeed" ? "payment.succeeded" : outcome === "fail" ? "payment.failed" : "payment.cancelled";
  const { body, headers } = signedMockEvent({
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, type, orderNumber: number, providerRef: order.payment.providerRef,
    amount: order.totals.total, currency: "AED", reason: outcome === "fail" ? "card_declined (simulated)" : undefined,
  });
  await handleWebhook(body, headers);
  redirect(`/${lang}/account/orders/${number}${outcome === "succeed" ? "?placed=1" : ""}`);
}
