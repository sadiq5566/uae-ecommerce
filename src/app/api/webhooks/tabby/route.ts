import { handleWebhook } from "@/features/orders/payment-events";

export const dynamic = "force-dynamic";

/** Tabby webhook (authenticated by the X-Auth-Key header you registered; the payment is re-read from Tabby's API before use). */
export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > 100_000) return new Response("too large", { status: 413 });
  const { status, body } = await handleWebhook(raw, req.headers, "tabby");
  return new Response(body, { status });
}
