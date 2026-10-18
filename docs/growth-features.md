# Growth features: offers, guest checkout, tracking, returns, leads

Everything below is configurable from **Admin → Settings** (offers, popup, return window) and **Admin → Promotions** (coupon codes).

## Offers (one discount per order)
Rules live in `features/checkout/pricing.ts` (pure, unit-tested in `tests/offers.test.ts`).

| Offer | Default | Where to change |
|---|---|---|
| Free delivery | basket ≥ AED 200 | Settings → Delivery rules (a delivery zone can override) |
| Spend discount | 10 % when spending ≥ AED 500 | Settings → Automatic offers |
| First-order discount | 10 % | Settings → Automatic offers |
| Coupon codes | any | Promotions |

- **Only one discount per order**: the largest of coupon / spend discount / first-order discount. They never stack. On a tie the customer's coupon wins. A coupon that loses is *not consumed* and the checkout tells the customer a better offer was applied.
- **Free delivery** is judged on the basket value after sale prices and after a *coupon*, but **not** after the automatic offers (a AED 219 basket with the 10 % first-order discount still ships free).
- **First order** = no earlier non-cancelled order under the same account, phone number **or** email, so a guest can't reuse it by changing their name. A cancelled first order does not use it up.
- Optional caps (max AED discount) exist for both automatic offers.
- Admin can mark a coupon **"Advertise on the Offers page"**; it then appears at `/{en,ar}/offers` with a copy button.
- Surfaces: top ticker (infinite scrolling line, pauses on hover, static for reduced-motion), welcome popup, cart progress bar ("Add AED X for free delivery"), `/offers` page, checkout summary lines.

## Welcome popup + lead capture
- Shown once per visitor per **campaign version** (Settings → Welcome popup → bump the version to show it again), after a configurable delay; never on checkout/payment/login/track pages.
- Optional email / phone capture with an explicit, pre-ticked opt-in checkbox. Newsletter form in the footer uses the same pipeline.
- Stored in `leads` (one row per email/phone). Ordering adds the buyer to the list **without** marketing consent. Only opted-in leads are exported (**Admin → Marketing & leads**, owner-only CSV).
- Sending SMS/email campaigns needs a provider (not connected) — export the list into your tool.

## Guest checkout and Buy now
- No account needed: name, phone, optional email, emirate/area/building. Members still use saved addresses.
- **Buy now** (`/checkout?buy=SKU&qty=N`) checks out one item; the cart is untouched. Price, stock and offers are recomputed on the server; the URL only carries a SKU and quantity.
- Duplicate submits are safe (idempotency key), COD is the default method, card appears only when a payment provider is configured.
- Guest coupon limits are per phone number.

## Order tracking
- Every order has a secret `trackToken`. Guests land on `/{lang}/track/{orderNumber}?k=…` after ordering (bookmarkable).
- `/{lang}/track` accepts **order number + phone**; rate-limited (10 / 15 min per IP). A wrong phone and an unknown order give the same message.
- The tracking page shows the same status steps/timeline staff update in **Admin → Orders**.

## Returns & exchanges (free, 7 days by default)
- Window: `returnWindowDays` after the *delivered* timestamp (Settings; 0 turns returns off).
- Customer picks items + quantities and either **store credit** (a single-use coupon worth what they actually paid for those items, valid 90 days; delivery fee isn't credited) or a **free exchange** to another variant (size/colour) of the same product.
- Staff flow in **Admin → Returns**: Approve → Items received (optionally restock) → Complete. Completing a credit issues the coupon code and notifies the customer; completing an exchange takes the replacement from stock atomically (fails cleanly and can be retried if it sold out).
- Quantities can't exceed what was bought; rejected/withdrawn requests free the items again.

## Not included / needs your input
- Email/SMS delivery is still a stub (`lib/mailer.ts`), so credit codes and status updates are shown on the tracking page and logged in dev, not actually sent.
- Linking earlier guest orders to an account created later (by phone/email) isn't automatic yet.
- Abandoned-cart recovery and scheduled campaigns need a messaging provider first.
- Terms for returns/offers (legal text, AR + EN) must come from the business.
