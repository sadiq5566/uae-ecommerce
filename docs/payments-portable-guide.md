# Portable payments guide — Stripe (card) + Tabby (Pay in 4)

Copy this setup into any project. The payment code is split in three layers so you only rewrite the part that is specific to your app.

```
┌───────────────────────────────┐
│ 1. Provider adapters (portable) │  stripe.ts, tabby.ts, signature.ts, types.ts, index.ts   → copy as-is
├───────────────────────────────┤
│ 2. Glue to YOUR orders          │  create payment · webhook handler · mark paid          → rewrite (≈60 lines)
├───────────────────────────────┤
│ 3. UI                           │  pay page + Payment Element form                       → restyle freely
└───────────────────────────────┘
```

Layer 1 has no dependency on this store's database, UI or i18n. It only needs `fetch` and `node:crypto`.

---

## 1. What to copy

| File (in this repo) | Layer | Notes |
|---|---|---|
| `src/lib/payments/types.ts` | 1 | `PaymentProvider` interface, `PaymentEvent`, `BuyerDetails` |
| `src/lib/payments/signature.ts` | 1 | HMAC-SHA256 helper (used by Stripe signature check) |
| `src/lib/payments/stripe.ts` | 1 | PaymentIntents + webhook verification + refund |
| `src/lib/payments/tabby.ts` | 1 | Optional. Tabby session / capture / refund / webhook |
| `src/lib/payments/index.ts` | 1 | Registry: which providers are configured (reads env) |
| `src/features/orders/payment-events.ts` | 2 | Example of "apply a verified event to an order" — adapt to your DB |
| `src/app/api/webhooks/payments/route.ts`, `…/tabby/route.ts` | 2 | Thin route handlers |
| `src/app/[lang]/pay/card/[number]/page.tsx` | 3 | Server page: auth the order, get client secret, render form |
| `src/features/orders/stripe-embedded.tsx` | 3 | Client: Stripe Payment Element, themed from CSS variables |
| `scripts/tabby-webhook.ts` | – | One-off script to register the Tabby webhook |
| `tests/stripe.test.ts`, `tests/tabby.test.ts` | – | Adapter tests (vitest) |

Install (client only): `npm i @stripe/stripe-js @stripe/react-stripe-js`. The server side uses plain `fetch`, no Stripe SDK.

The interface everything hangs on (`types.ts`):

```ts
export type PaymentEventType = "payment.succeeded" | "payment.failed" | "payment.cancelled" | "refund.succeeded";
export type PaymentEvent = { id: string; type: PaymentEventType; orderNumber: string; providerRef: string; amount: number; currency: string; reason?: string };

export interface PaymentProvider {
  id: string;                                   // "stripe" | "tabby" | …
  methods: readonly string[];                   // checkout methods this provider serves, e.g. ["card"]
  testOnly: boolean;
  createPayment(input: { orderNumber: string; amount: number; currency: string; method: string; returnUrl: string; email?: string; buyer?: BuyerDetails }): Promise<{ redirectUrl: string; providerRef: string }>;
  verifyWebhook(rawBody: string, headers: Headers): PaymentEvent | null;   // null = bad signature
  confirmEvent?(e: PaymentEvent): Promise<PaymentEvent | null>;            // re-check with provider API (Tabby)
  fetchStatus?(providerRef: string): Promise<"paid" | "failed" | "pending">;
  refund?(i: { providerRef: string; amount: number }): Promise<{ accepted: boolean }>;
}
```

Adding another gateway later = one new file implementing this interface + one line in `index.ts`.

---

## 2. Environment variables

```env
# Which "primary" provider is active (card). Leave empty = online card payment off.
PAYMENT_PROVIDER=stripe

STRIPE_PUBLISHABLE_KEY=pk_test_…      # safe for the browser
STRIPE_SECRET_KEY=sk_test_…           # server only — never NEXT_PUBLIC_
STRIPE_WEBHOOK_SECRET=whsec_…         # from `stripe listen` (local) or the dashboard endpoint (live)

# Optional — Tabby (Pay in 4). All three or none.
TABBY_SECRET_KEY=sk_test_…
TABBY_MERCHANT_CODE=…                 # from your Tabby integration manager
TABBY_WEBHOOK_SECRET=<random 16+ chars you choose>
```

- Test and live use different key sets and **different `whsec_`** values. Keep live keys out of `.env.local` on dev machines; set them in the host's environment settings.
- `.env*` is git-ignored here; only `.env.example` (blank values) is committed.
- If any secret was ever pasted into chat, a screenshot or a commit, rotate it in the Stripe dashboard.

---

## 3. Stripe flow (what happens, in order)

1. **Place order** (your code): create the order as `pending_payment`, reserve stock, **keep the cart**.
2. `provider.createPayment(...)` → server creates a `PaymentIntent` (`amount` in minor units, `currency`, `payment_method_types[0]=card`, `metadata[orderNumber]`). Save `providerRef = pi_…` on the order. Redirect the customer to your own pay page.
3. **Pay page** (server): check the viewer owns the order (logged-in user, or a secret tracking token for guests), fetch the PaymentIntent's `client_secret` (only while it is still payable), render the client form.
4. **Payment Element** (client): `stripe.confirmPayment({ elements, confirmParams: { return_url } })`. Card data goes browser → Stripe iframe → Stripe. Your server never sees it.
5. **Webhook** `payment_intent.succeeded` → `verifyWebhook` (signature + 5‑min replay window) → apply to the order: check provider ref, **amount and currency match the order**, then mark paid, set status confirmed, empty the cart.
6. The browser return page **never** marks an order paid. It only shows status (and polls/refreshes until the webhook lands).

### Events to subscribe to
`payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.canceled`, `refund.created`, `refund.updated`

Local: 
```bash
stripe listen --events payment_intent.succeeded,payment_intent.payment_failed,payment_intent.canceled,refund.created,refund.updated --forward-to localhost:3000/api/webhooks/payments
```
Live: dashboard → Developers → Webhooks → Add endpoint `https://<site>/api/webhooks/payments` with the same 5 events.

### Refunds
`provider.refund({ providerRef, amount })` creates a Stripe refund with `metadata[orderNumber]` and `metadata[providerRef]`. The order is **not** marked refunded until the `refund.updated/created` webhook arrives with `status=succeeded` (the metadata is how the webhook finds the order).

### Test cards
`4242 4242 4242 4242` (success) · `4000 0000 0000 9995` (declined) · `4000 0025 0000 3155` (3‑D Secure). Any future expiry, any CVC.

---

## 4. Webhook handler contract (layer 2 — the part you rewrite)

Whatever your DB is, the handler must do these things. This is the safety-critical part:

```ts
export async function handleWebhook(raw: string, headers: Headers, providerId?: string) {
  const provider = providerId ? getProviderById(providerId) : getProvider();
  if (!provider) return { status: 404 };
  let event = provider.verifyWebhook(raw, headers);          // 1. authenticate the sender
  if (!event) return { status: 400 };
  if (provider.confirmEvent) {                                // 2. (Tabby) re-read from provider API, capture
    try { event = await provider.confirmEvent(event); } catch { return { status: 503 }; } // 503 → provider retries
    if (!event) return { status: 400 };
  }
  await processPaymentEvent(provider.id, event);              // 3. apply exactly once
  return { status: 200 };
}
```

`processPaymentEvent` must:
1. **Idempotency** — insert `(provider, event.id)` into a table with a unique index; a duplicate insert = already handled → return 200.
2. Find the order by `event.orderNumber`; ignore unknown / COD orders (still return 200).
3. Reject if `order.payment.providerRef !== event.providerRef`.
4. On `payment.succeeded`: reject if `currency` or `amount` (compare in minor units) differs from the order total. Then, atomically, `pending_payment → confirmed` and set paid fields. If the order was already cancelled/expired, mark it `refund_pending` instead of fulfilling.
5. On `payment.failed / cancelled`: set payment status failed (order stays retryable).
6. On `refund.succeeded`: move to `refunded`.
7. Always answer 2xx for verified events (even irrelevant ones) so the provider stops retrying; 400 only for bad signatures.

Read the **raw** body (`await req.text()`) before any JSON parsing — signature checks need the exact bytes.

---

## 5. Tabby (Pay in 4) specifics

- **Checkout**: `POST https://api.tabby.ai/api/v2/checkout` with `Authorization: Bearer <secret>`. Needs buyer `name / phone / email`, `shipping_address {city,address,zip}`, `order {reference_id, items[]}`, `buyer_history.registered_since`, `lang`, `merchant_code`, `merchant_urls {success,cancel,failure}`. Amounts are strings with 2 decimals. Phone must be international (`+9715…`) — see `tabbyPhone()`.
- **Response**: if `status === "rejected"` or there is no `configuration.available_products.installments[0].web_url`, Tabby declined → show "use another payment method". Otherwise redirect to `web_url` and save `payment.id`.
- **Return**: Tabby redirects to success/cancel/failure with `?payment_id=`. Treat as navigation only.
- **Webhook** (registered via `npm run tabby:webhook -- https://<site>/api/webhooks/tabby`): authenticated by the custom header `X-Auth-Key: $TABBY_WEBHOOK_SECRET` (Tabby has no HMAC signature). Statuses are lowercase (`authorized`, `closed`, `rejected`, `expired`). Because the header is the only authentication, `confirmEvent()` **re-reads the payment from Tabby's API and checks order reference + status** before anything is applied.
- **Capture is mandatory**: only captured payments settle to you. `confirmEvent()` captures an `AUTHORIZED` payment for the full amount (with `reference_id` for idempotency).
- **Refund**: `POST /v2/payments/{id}/refunds` (only `CLOSED` payments). Confirmed by a webhook with `status=closed` and `refunds[]`.
- Tabby needs the customer's **email**: make the email field required when Tabby is selected (the server enforces it too).
- Verify the capture/refund/retrieve endpoint paths against Tabby's current API reference on your first test payment.

---

## 6. UI (layer 3) — keep it replaceable

The pay page only needs: `publishableKey`, `clientSecret`, `returnUrl`, a few translated labels, and a locale.

`StripeEmbedded` styles Stripe's form from **your site's CSS variables** so it matches light and dark themes automatically:

```ts
const css = getComputedStyle(document.documentElement);
const v = (n: string) => css.getPropertyValue(n).trim();
const appearance = {
  theme: dark ? "night" : "stripe",
  variables: { colorPrimary: v("--brand"), colorBackground: v("--surface"), colorText: v("--fg"),
               colorTextSecondary: v("--muted"), colorDanger: v("--danger"), borderRadius: "12px" },
  rules: { ".Input": { border: `1px solid ${v("--line")}`, boxShadow: "none" },
           ".Input:focus": { border: `1px solid ${v("--brand")}` } },
};
```

In another project, change only the variable names (`--brand`, `--surface`, …) to your own tokens, and the labels. Rules to remember:
- Render the form after mount (the theme is only known in the browser) — see `useSyncExternalStore` in the component.
- Key `<Elements>` by theme so switching light/dark rebuilds it.
- Load Stripe once: use `loadStripe` from `@stripe/stripe-js` (don't append your own `<script>`; it breaks under React Strict Mode).
- Pass `locale` (`en`/`ar`) to `Elements` for translated field labels / RTL.

### Content-Security-Policy (production)
If you set a CSP, allow Stripe only when Stripe is enabled:
```
script-src  … https://js.stripe.com
connect-src … https://api.stripe.com https://m.stripe.network https://r.stripe.com
frame-src   https://js.stripe.com https://hooks.stripe.com
```
See `contentSecurityPolicy(imageHosts, stripe)` in `src/lib/security-headers.ts`.

---

## 7. Checklist for a new project

1. Copy layer‑1 files; `npm i @stripe/stripe-js @stripe/react-stripe-js`.
2. Add the env vars; test keys first.
3. Order model: statuses `pending_payment → confirmed …`, `payment {method, status, provider, providerRef, paidAt}`, unique `orderNumber`, `expiresAt` for unpaid orders, and an `idempotencyKey`.
4. Webhook‑events collection with a unique `(provider, eventId)` index.
5. Add the two route handlers + `processPaymentEvent` (section 4).
6. Add the pay page + `StripeEmbedded`; map the CSS variables.
7. Cron job to expire unpaid orders and release stock.
8. Register the webhook (`stripe listen` locally, dashboard for live); copy the printed `whsec_`.
9. Pay with a test card → order flips to confirmed **only after** the webhook; try a declined card; try a refund.
10. Go live: live keys in host env settings, live webhook endpoint with its own `whsec_`, HTTPS, CSP allow‑list.
