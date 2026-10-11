# Checkout, orders & payments (Phase 4)

## Price calculation (one function: `features/checkout/pricing.ts`)
Run in integer **fils**, rounding half up, on the server at quote time *and again* at order time. The browser only sends selections (address id, method, coupon code, idempotency key) plus the total it saw; if the recomputed total differs the order is refused with the new total (`total_changed`).

1. **Item subtotal** — Σ current effective price × qty (sale prices already applied; list price kept for display).
2. **Coupon** — one per order, on eligible lines only (included products/categories, minus exclusions). Percent (optional cap) or fixed; never above the eligible subtotal. **Does not stack with item sale prices** unless the coupon has `stackWithSale`. Needs `minSubtotal` on the eligible amount. Valid dates, `active`, total usage limit and per-customer limit are checked server-side; usage is claimed atomically.
3. **Discounted subtotal** = 1 − 2.
4. **Delivery** — fee of the zone matching the address' emirate (`deliveryZones`); free when (3) ≥ the zone's `freeThreshold` or the store's `freeDeliveryThreshold`. No zone for the emirate ⇒ not deliverable.
5. **COD fee** — `settings.codFee` for cash on delivery. COD can also be capped (`codMaxOrder`).
6. **VAT** — off by default (`settings.tax.enabled`). Inclusive: informational amount inside the price. Exclusive: added to (3)+(4)+(5). **Confirm the correct treatment for your business before enabling.**
7. **Total**. Minimum order (`settings.minOrder`) is checked on the item subtotal before the coupon.
Edit the rules in the `settings` / `deliveryzones` / `coupons` collections (admin UI: Phase 5; demo values come from `npm run seed`).

## Orders
- **Snapshot:** items (name/SKU/variant/price/list price/coupon share), address, delivery zone/estimate, all totals, coupon and payment info are copied onto the order; later catalogue/address/settings edits never change history.
- **Lifecycle:** `pending_payment → confirmed → processing → packed → out_for_delivery → delivered`; `cancelled` is possible before dispatch; `refund_pending → refunded` only for money actually collected. Transition table + guards: `features/orders/status.ts`; applied atomically (conditional update) by `updateOrderStatus` in `lifecycle.ts`, which also restores stock, gives back coupon use, sets COD to `cod_collected` on delivery, and records a timeline entry (`by`: customer / system / payment / staff id). The admin UI (Phase 5) must call this with a staff user after `requirePermission("orders:write")`.
- **COD:** order is `confirmed` immediately, payment status `cod_pending`; becomes `cod_collected` when marked delivered.
- **Order numbers:** `UAE-XXXXXXXX` (random, unambiguous alphabet, unique index).

## Stock & duplicate protection (no transactions required)
- Each line is an **atomic conditional update** (`stock >= qty` is in the filter), so the last unit can never be sold twice. If a later line fails, earlier lines are restored (compensation) and the never-exposed order is deleted. Variants decrement the variant and the product total. Every change is logged in `inventorymovements`.
- **Idempotency:** the order is inserted *first* under a unique `(user, idempotencyKey)` index. Double-clicks, retries and parallel submissions return the same order and take stock once. Restoring stock is guarded by a `stockReserved` flag, so double-cancel/expiry can't double-restore.
- Works on a standalone MongoDB. Multi-document transactions (Atlas/replica set) could further tighten crash-recovery; a crash between "order inserted" and "stock taken" leaves an unpaid/never-reserved order that the expiry job cancels (stock is only released if it had been reserved).
- Online-payment orders reserve stock and expire after `pendingPaymentMinutes` (default 30). Schedule `GET /api/cron/maintenance` with `Authorization: Bearer $CRON_SECRET` every few minutes (e.g. Vercel Cron).

## Payments
- **Adapter interface:** `lib/payments/types.ts` (`createPayment`, `verifyWebhook`, optional `fetchStatus`/`refund`). Register adapters in `lib/payments/index.ts` (`PAYMENT_PROVIDER`). Only methods the provider declares are shown at checkout, so **Apple Pay / Google Pay never appear unless an adapter really supports them**. Apple Pay needs a domain-verified merchant and a gateway that enables it; Google Pay needs gateway + merchant setup. Pick a gateway with documented UAE availability (e.g. Network International, Telr, PayTabs, Checkout.com, Stripe — verify current UAE support and fees with each) and write one adapter file.
- **No faking:** the browser return page never marks an order paid. Only `POST /api/webhooks/payments` does — after HMAC-SHA256 signature + timestamp (5 min) verification on the raw body, then idempotent processing keyed by provider event id (`webhookevents`, unique index), and only if provider ref, **amount and currency match** the order. Failed/cancelled payments leave the order retryable ("Complete payment"). A payment that arrives after expiry becomes `refund_pending` instead of being fulfilled. `refund.succeeded` moves `refund_pending → refunded`; nothing is called refunded until the provider confirms.
- **Mock provider (TEST ONLY):** `PAYMENT_PROVIDER=mock` (+ `PAYMENT_WEBHOOK_SECRET`) in development shows a clearly labelled test payment page whose buttons send *correctly signed* events through the real verification path. It is refused in production by `getProvider()` and by env validation; `/pay/mock/*` returns 404 there.
- No provider configured ⇒ only cash on delivery is offered.
- Card data never touches this app (hosted page / provider components only).

## Notifications
`features/orders/notify.ts` sends confirmation / status / payment-failed messages (en/ar) through the `Mailer` abstraction (console in dev, no-op in prod until a provider is added) and an `SmsProvider` stub (dev log only). Failures never fail an order.

## Environment
`PAYMENT_PROVIDER`, `PAYMENT_WEBHOOK_SECRET` (≥16 chars), `CRON_SECRET` (≥16 chars) — see `.env.example`. Local production builds use `.env.production.local` (blank provider).
