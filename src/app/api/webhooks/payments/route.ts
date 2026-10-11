import { handleWebhook } from "@/features/orders/payment-events";

export const dynamic = "force-dynamic";

/**
 * Payment gateway webhook. The RAW body is needed for signature verification, so it is read as text before any parsing.
 * Always responds 2xx for verified events (even duplicates) so the gateway stops retrying; 400 for bad signatures.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > 100_000) return new Response("too large", { status: 413 });
  const { status, body } = await handleWebhook(raw, req.headers);
  return new Response(body, { status });
}
