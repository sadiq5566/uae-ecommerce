# Changes — payments, checkout & performance (19 Oct 2026)

See `docs/payments-portable-guide.md` for the reusable, project-independent version of the payment setup.

## 1. Newsletter banner ("Get deals in your inbox")
- Banner no longer uses the inverted `bg-fg text-bg` panel (light box with dark inputs in dark mode). It uses theme tokens (`bg-surface-2`, `border-line`, `text-fg`, `text-muted`); input has explicit text/placeholder colours.
- Files: `src/components/footer.tsx`, `src/components/newsletter.tsx`.

## 2. Stripe card payments
- New provider adapter `src/lib/payments/stripe.ts`: PaymentIntents + Payment Element, webhook signature check (HMAC‑SHA256, 5‑min tolerance), refunds with metadata so the refund webhook can find the order. No Stripe SDK server-side (plain `fetch`).
- Own pay page `src/app/[lang]/pay/card/[number]/page.tsx` + `src/features/orders/stripe-embedded.tsx`: two-column layout (payment card + order summary), styled from the site's CSS variables, follows light/dark theme, English/Arabic labels (`pay.*` in messages).
- Env: `PAYMENT_PROVIDER=stripe`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (validated in `src/lib/env.ts`; card option is hidden if any is missing).
- Webhook events: `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.canceled`, `refund.created`, `refund.updated` → `POST /api/webhooks/payments`.
- Local: `stripe listen --events <the five above> --forward-to localhost:3000/api/webhooks/payments`.
- CSP (production) allows Stripe hosts only when `PAYMENT_PROVIDER=stripe` (`src/lib/security-headers.ts`, `next.config.ts`).
- Tests: `tests/stripe.test.ts`.

## 3. Tabby (Pay in 4)
- Adapter `src/lib/payments/tabby.ts`, webhook route `src/app/api/webhooks/tabby/route.ts`, registration script `npm run tabby:webhook -- https://<site>/api/webhooks/tabby`.
- Webhook is authenticated by `X-Auth-Key`; `confirmEvent()` re-reads the payment from Tabby, checks order reference/status, then **captures** it. Order is confirmed only after that.
- Env (all three or none): `TABBY_SECRET_KEY`, `TABBY_MERCHANT_CODE`, `TABBY_WEBHOOK_SECRET`.
- Email is required at checkout when Tabby is selected (client + server, `email_required` error in en/ar).
- Capture/refund/retrieve endpoint paths were not shown in the docs pages fetched; they follow Tabby's API reference (`/v2/payments/{id}/captures`, `/refunds`, `GET /v2/payments/{id}`) — verify on the first test payment.
- Tests: `tests/tabby.test.ts`.

## 4. Multiple providers at once
- `src/lib/payments/index.ts` now has `getProvider()` (primary: stripe/mock), `getProviders()`, `getProviderById()`, `getProviderForMethod()`.
- `PaymentProvider` gained optional `confirmEvent()`; `createPayment` accepts `buyer` details; `handleWebhook(raw, headers, providerId?)` supports per-provider routes.
- Order `payment.method` enum now includes `tabby`; admin refunds use the provider stored on the order.

## 5. Checkout
- Method order: **Cash on delivery (default) → Card → Tabby** (`availableMethods` in `src/features/checkout/prepare.ts`).
- Coupon section collapsed (open when a coupon is applied / public offers exist); optional address fields (street, unit, landmark, instructions) sit under "More delivery details (optional)".
- **Cart is kept while an online payment is pending** and emptied only when the payment succeeds (`place.ts`, `payment-events.ts`; guests via `order.cartGuestId`). COD still empties it at order time. Cart badge is re-read from the server instead of being zeroed.
- "Buy now": spinner + disabled state while navigating, route prefetched, `checkout/loading.tsx` skeleton.

## 6. Bug fixes
- **"This product is no longer available" on Add to cart**: product cards never set `hasVariants`, so variant products showed a plain "Add to cart" with the parent SKU. `card()` in `src/features/catalog/service.ts` now sets it ("Choose options" button).
- Cart badge no longer reset to 0 by a rejected add-to-cart.
- Lint error in admin bulk selection (`bulk-select.tsx`): selection reset moved from an effect to render-time state.
- Stripe.js loaded twice / form stuck loading: replaced hand-rolled script loader with `@stripe/stripe-js` + `@stripe/react-stripe-js`.

## 7. Performance & navigation
- Categories, public offers (60 s) and public coupons (30 s) cached across requests via `src/lib/cross-request-cache.ts` (falls back to a plain call under vitest).
- Listing pages: facets query runs in parallel with the product query; cards load only the fields they show (first image only).
- Every page change starts at the top, instantly (`src/components/scroll-to-top.tsx`).
- Measured: DB queries are 15–40 ms locally; first visit to a route in `next dev` costs ~4–5 s (compile). Judge speed with `npm run build && npm start`.

## New / changed dependencies
`@stripe/stripe-js`, `@stripe/react-stripe-js` (client only).

## Operational to-do
- Put the five Stripe webhook events on every endpoint (local `stripe listen`, dashboard for live).
- Live keys only in the host's environment settings; rotate any key that was ever shared outside `.env.local`.
- Register the Tabby webhook once per environment with a public HTTPS URL.
- Pending-payment orders hold stock until `pendingPaymentMinutes` (default 30); schedule `GET /api/cron/maintenance` (Bearer `CRON_SECRET`) every ~5 min.
