# Implementation status

Source of truth: `PROJECT_SPEC.md`.

## Growth update (offers, guest checkout, tracking, returns, leads)
Automatic offers (free delivery ≥ AED 200, 10 % at ≥ AED 500, 10 % first order — one discount per order), welcome popup + infinite offer ticker, cart progress, public Offers page, guest checkout + Buy now, public order tracking (order no. + phone), 7-day free returns (store-credit coupon or free exchange) with admin flow, lead capture + Marketing page. Details and limits: `docs/growth-features.md`. Verified: tsc, eslint, build, 224 tests (new: offers pricing, guest/buy-now/first-order/tracking/returns on real MongoDB) and a real-Chrome run of the whole customer + admin journey (EN/AR, desktop/mobile).

## Phase checklist
- [x] Phase 0 — Inspect & plan (empty repo → Next.js 16.4, React 19, Tailwind 4, npm)
- [x] Phase 1 — Foundation (see below)
- [x] Phase 2 — Data & catalogue (schemas, seed, listing/detail, search, filters, SEO)
- [x] Phase 3 — Identity & shopping (auth, addresses, wishlist, server-validated cart)
- [x] Phase 4 — Checkout & orders (delivery, coupons, COD, payment adapter)
- [x] Phase 5 — Admin
- [x] Phase 6 — i18n completion, a11y, polish
- [x] Phase 7 — Hardening & deployment

## Phase 7 done
- **Security review & hardening** (`docs/security.md`): security headers + production CSP (unit-tested module, verified live with no violations across storefront/account/admin), `__Host-` cookies in production, staff sessions 3 days, `noindex` + `no-store` on admin/API/account areas, server-action argument hardening, robots updated, `poweredByHeader` off.
- **Operations:** `/api/health`, `instrumentation.ts` (boot-time config warnings, structured error logging hook), `db:indexes` + `db:migrate` scripts (production auto-indexing off), complete `.env.example`, env schema covers every variable, `docs/deployment.md` (environments, first deploy, cron, query inspection, monitoring, backups, rollback), final README.
- Dependency audit: production dependencies 0 vulnerabilities; 5 dev-only advisories (linter's `braces`) documented, not shipped. `zod` patched.

## Verified (Phase 7)
`tsc`, `eslint`, `npm run build` pass; `npm test` = 193 tests in 14 files (5 consecutive green runs; new: security headers, cookie policy, session hardening, hostile-argument handling). Live checks on `next start`: headers on public/private/redirect responses, cache policy (home ISR 60 s, product/category/cart/account per-request or `no-store`, API `no-store`), `robots.txt`, health, cron/webhook auth (401/400/404/413), mock-pay page 404 in production, cookies (`__Host-session`, HttpOnly, Secure, SameSite=Lax), reflected-XSS probe escaped, query-operator injection probes (no 500s), dotfile/source exposure probes (404), open-redirect probes, CSP violation listener across 22 pages as customer/owner/guest (none).
Not verified: a real payment gateway/webhook delivery, real email/SMS, object storage, load/soak testing, penetration testing by a third party, Atlas backup restore, behaviour behind your actual CDN/proxy.

## Remaining blockers (need your decisions/accounts — none are code defects)
1. Payment gateway adapter (+ Apple Pay/Google Pay enablement) — merchant account required.
2. Email (and optional SMS) provider.
3. Production image storage adapter (or CDN URLs via `IMAGE_HOSTS`).
4. VAT treatment, shipping/returns/privacy/terms text (EN + AR) from the business.
5. MFA/email verification for staff accounts is recommended before scale.
## Phase 6 done
- **Accessibility:** axe-core (WCAG 2.0/2.1/2.2 AA + best practice) found and I fixed: colour contrast (new `gold-ink` / `gold-fg` / `danger-solid` tokens, marquee), unnamed sort select, heading order, a `<dl>` containing non-term content, unlabeled file input, empty table header, non-focusable scrollable tables, small password toggle. Final: **0 violations** over storefront, account, checkout and all admin pages × EN/AR × light/dark × mobile/desktop. Keyboard: skip link focuses `<main>`, dialogs trap/return focus, search combobox pattern. Details: `docs/accessibility-i18n.md`.
- **i18n/RTL:** remaining aria labels localised; localized `<title>` on all private pages; language switch keeps query/hash; RTL drawers now open from the reading-start side; bidi fixes ("4.3 / 5"), topbar separator; visual review of RTL + dark screenshots.
- **UX:** search-as-you-type suggestions (accessible combobox, `/api/suggest`, rate-limited), product image gallery with thumbnails, change-password form (signs out other devices), localized error boundary with support reference, `global-error`, root/admin `not-found`, skeletons (only where they can't cause soft-404/redirect problems), header/newsletter reflow at large text.
- **Performance (measured, mobile Lighthouse on the production build):** home 92–93 (EN/AR), product 93–94, category ≈ 83–90, login 96; a11y 100, best-practices 100, CLS 0. Changes: Arabic font trimmed + not preloaded, Zod removed from client bundles (emirates list split out), shared scroll-reveal observer.
- Fixed along the way: loading boundaries made unknown product/category/article URLs and auth redirects return HTTP 200 → removed them where needed (verified 404/307 again).

## Verified (Phase 6)
`tsc`, `eslint`, `npm run build` pass; `npm test` = 180 tests (12 files; new: search suggestions + change-password against real MongoDB). Real-Chrome checks: axe sweeps (storefront 13 routes, account/checkout, 19 admin pages), keyboard/interaction script (23 checks), overflow sweep at 320/360/768/1024/1440 px in EN/AR for 17 routes (none), auth/cart regression (23/23), admin E2E regression on `next dev` (32 + 42 checks), Lighthouse runs listed above.
Not verified: real screen readers (VoiceOver/NVDA/TalkBack), Safari/Firefox, real devices, user testing, text-only zoom ≥150 % at ≤320 px (some content wraps awkwardly), performance on the real host/CDN with real product photos.

## Known issues / placeholders
- Simulated mobile LCP ≈ 3.0–3.8 s locally; needs re-measuring with real images/CDN. Category pages are the heaviest (12 cards × interactive controls).
- Admin remains English-only (by design). No live-region announcements for toasts beyond `role=status`.
- Search suggestions use MongoDB text/regex (fine for thousands of products; use a search engine beyond that).
- Everything listed under earlier "Known issues" about payments/email/storage still applies.

## Next
Phase 7 — hardening & deployment: security review of all flows (authz, injection, headers/CSP, cookies), dependency audit (`npm audit`), env validation in production, index/migration notes, production checklist (backups, monitoring, error reporting, rollback), final README/.env.example/docs pass, run full test/lint/type/build.
## Phase 5 done
- Admin at `/admin` (English-only): role-filtered nav, server-side permission checks on every page/action/route handler, audit log for sensitive actions. Details: `docs/admin.md`.
- Dashboard with UAE-time date ranges; products (bulk actions, full editor, image upload w/ magic-byte check, variants, specs, scheduled sales, slug redirects), categories (cycles/unsafe delete blocked), inventory ledger + adjustments.
- CSV import (preview → validate → batched confirm, progress, error report) and export for products/categories; formula-injection-safe (`docs/csv-import.md`).
- Orders operations (search/filter/detail/status/cancel/refund controls), customers (masked), staff roles, coupons, delivery zones, store settings.
- Reviews: verified-purchase submission, moderation queue, helpful votes, reports (3 → re-queue), rating distribution/sorting, ratings derived from approved reviews, JSON-LD aggregateRating only when reviews exist.
- Content: articles (draft/publish/schedule), editable static pages (placeholders until the merchant writes real text), homepage hero banners/campaigns + section toggles; storefront `/journal`, `/journal/[slug]`, `/[lang]/[page]`; sitemap includes them.
- `GET /api/cron/maintenance` (expires unpaid orders, applies scheduled sale prices) replaces `/api/cron/maintenance`.

## Verified (Phase 5)
`tsc`, `eslint`, `npm run build` pass; `npm test`: 172 tests (3× repeated, all green) incl. real-MongoDB integration tests for authorization on every admin action (guest/customer/staff-role matrix), product/category/inventory rules, CSV import (partial failures, no unspecified overwrites, formula text stored verbatim), order ops & refunds, roles (last owner, self-change, forced sign-out), coupons/zones/settings, content scheduling/validation, reviews (eligibility, duplicates, moderation, helpful, reports) and scheduled sales. Real-Chrome E2E on `next dev`: access control (guest/customer/ops/content-editor), category/product creation with real PNG upload + disguised-SVG refusal, variants, slug-change 308 redirect, inventory, CSV preview/import/error report/export escaping, COD order → ops processing → delivered → customer review → moderation → public review with XSS text escaped, dashboard figures, coupon/settings, banners (EN/AR), articles, pages, role assignment + forced sign-out, audit log, mobile admin (no overflow). 60+ checks passed; bugs found and fixed along the way: disabled stock input blocked product save, star rating reset after a validation error, banner validation errors weren't shown.
Not verified: other browsers, screen readers, large catalogues (>5k rows), real object storage, real payment/refund provider calls.

## Known issues / placeholders
- Admin UI is English-only (storefront is bilingual). Admin text inputs for Arabic content are provided.
- Image **storage adapter for production is not implemented** (dev local disk only); use CDN URLs + `IMAGE_HOSTS` or add an adapter.
- No per-variant CSV import; no CSV mapping UI (header aliases only).
- Product images are optional; the storefront falls back to emoji placeholders.
- Staff creation = promote an existing registered account (no invite emails — mail provider is still a stub).
- Orders admin doesn't yet support editing items/address or partial refunds.
- Legal/policy pages ship as clearly marked placeholders — the merchant must supply reviewed text (EN + AR).
- Search suggestions, change-password form, email verification, guest checkout: still not built.

## Next
Phase 6: complete English/Arabic polish (admin Arabic optional), accessibility pass (keyboard/screen reader/contrast), responsive edge cases, empty/loading/error states, performance review (images, caching), UX refinement.
## Phase 4 done
- Pricing engine (integer fils, explicit order of operations), delivery zones/fees/free threshold, COD fee/limit, min order, configurable VAT (off by default), coupons (percent/fixed, dates, limits, per-customer, product/category include/exclude, no stacking with sale prices by default).
- Checkout page: saved/inline addresses, payment methods (only those really available), coupon box, live server-computed fee breakdown, delivery estimate, double-submit-safe placement, "totals changed" recovery.
- Orders: immutable snapshot, lifecycle state machine with guards + timeline, COD handling, cancellation (stock + coupon restore), expiry job, order list/detail/tracking pages, confirmation/status notifications (mailer + SMS interfaces).
- Stock: atomic conditional decrement per line, compensation on partial failure, inventory ledger, idempotent restore.
- Payments: provider adapter interface, TEST-ONLY mock provider (refused in production), signed/idempotent webhook route with amount/currency/ref checks, refund-confirmation handling, `/api/cron/maintenance`.
- Details: `docs/checkout-orders-payments.md`.

## Verified (Phase 4)
`tsc`, `eslint`, `npm run build` pass; `npm test` = 104 tests incl. real-MongoDB integration tests (concurrent last-unit purchase, idempotent parallel submits, rollback, variants, coupon limits under concurrency, webhook signature/duplicate/amount-mismatch, expiry, late payment → refund, lifecycle, double-cancel). Real-Chrome E2E on `next dev` (mock provider): address add → fee breakdown → coupons (expired/unknown/ineligible/valid) → COD double-click = 1 order, stock/cart/coupon updated → card via mock page (fail → retry → success), return URL does not mark paid, webhook 400/200/duplicate, cron auth, orders list, Arabic RTL; 31/31 checks, no page errors. `next start`: mock page & webhook 404, mobile order page checked visually (no overflow).
Not verified: any real payment gateway (no credentials), Apple Pay/Google Pay, real emails/SMS, multi-region behaviour, load.

## Known issues / placeholders
- **No real payment gateway integrated** — needs a merchant account + one adapter file; until then production offers COD only. Apple Pay / Google Pay depend on that gateway.
- Admin UI for zones/coupons/settings/order management is Phase 5 (data is seeded; `updateOrderStatus` is ready for it). Staff cannot yet view other customers' orders.
- Delivery fees are per emirate (zone), not per area/community.
- Guest checkout is not offered (sign-in required).
- Refund initiation from admin (calling `provider.refund`) not wired yet; refunds are only recorded when confirmed.
- Email/SMS providers are stubs. Order-confirmation page auto-refreshes (polling) while waiting for the webhook.
- A hard crash between order insert and stock reservation leaves an order the expiry job later cancels (no double-restore); full transactions need a replica set.
- Mongoose `autoIndex` builds indexes on first connection; for large production collections create indexes via a migration step instead.

## Next
Phase 5: protected admin (roles/permissions), dashboard & reports, product/category/inventory management, CSV import/export, orders operations (calls `updateOrderStatus`), reviews + moderation, promotions, delivery & settings, articles, homepage content, audit log.
## Phase 3 done
- Auth: register, login, logout, forgot/reset password, profile (name/phone/language). DB-backed sessions, scrypt hashing, rate limits, roles + permission map. Details & deviation note: `docs/auth.md`.
- UAE address book (max 10, default handling, +971 phone normalisation, emirate list, ownership-checked).
- Wishlist (heart on cards + product page, `/wishlist`), requires sign-in.
- Server-validated cart (`/cart`): add/update/remove, stock clamping, price-change/availability flags, guest cookie cart + merge on sign-in. Header shows live cart/wishlist counts via `/api/session` (pages stay cacheable).
- Account area `/account`, `/account/addresses`, `/account/orders` (empty state until Phase 4).
- Form UX: localised validation keys, input preserved on error, password show/hide, spinners.
- Dev seed adds demo staff/customer users.

## Verified (Phase 3)
`tsc`, `eslint`, `npm test` (53 tests: password, permissions, safeNext, UAE phone, schemas, cart clamping/merge/price rules), production build pass. Real-Chrome (Playwright, kept outside the repo) E2E against `next start` + local MongoDB: guest cart → wishlist-gate → register (validation, input kept) → cart merged without duplicates → qty change/remove → wishlist add → address invalid/valid + default → profile save → sign-out → wrong password → login (open-redirect ignored) → login rate limit → forgot/reset (single-use token, sessions revoked) → Arabic RTL. 23/23 + 5/5 checks passed.
Not verified: visual QA; screen-reader pass; multi-tab race conditions on cart writes (last write wins, acceptable until checkout re-validates).

## Known issues / placeholders
- Checkout button on the cart is disabled until Phase 4.
- Footer/header links to journal, contact, FAQ, delivery, returns, about, privacy, terms still 404 (content pages: Phase 5/6) and cause 404 prefetch noise in the console.
- No change-password-while-signed-in form yet (reset flow covers it), no email verification, no account deletion/data export.
- Email provider is a stub (console in dev, no-op in prod) — needs a provider + `MAIL_PROVIDER` config before real password-reset emails work.
- Auth is self-built, not a library (see `docs/auth.md`).
- Rate limiting is Mongo-backed; fine for a single region, replace with Redis for high traffic.

## Next
Phase 4: delivery zones/fees, coupons/promotions, checkout with server-side totals, idempotent order creation + stock decrement, order lifecycle, COD, payment-provider abstraction (+ webhooks), order confirmation notifications, order history.
## Phase 2 done
- Mongoose models `Category`, `Product` (+ indexes, text index, derived `finalPrice`); see `docs/data-model.md`.
- `npm run seed [-- --reset]`: 11 categories (2 nested), 28 demo products, bilingual. Dev-DB-only guard.
- Service layer `src/features/catalog/service.ts` (search behind one interface, facets, collections, sitemap data).
- Pages: `/[lang]/c/[slug]`, `/p/[slug]`, `/search`, `/deals`, `/new`; home now reads the DB (revalidate 60s).
- Filters: price, brand, rating, in-stock, on-sale, category attributes; sort (6 options); pagination (12/page). All server-validated (Zod), URL-driven, GET form works without JS, mobile filter drawer.
- Product page: gallery/placeholder visual, price/discount, stock state, variants, quantity, delivery info, specs, related, JSON-LD (Product + BreadcrumbList), view tracking (cookie-deduped, bots ignored).
- SEO: canonical + hreflang per page, noindex on search/filtered/paginated URLs, sitemap with categories/products, real 404 status for unknown slugs.
- Nav/footer categories come from DB (degrades to empty menu if DB is down).

## Verified (Phase 2)
`tsc`, `eslint`, `npm test` (16 tests), `npm run build` pass. Against seeded local MongoDB via `next start`: all routes 200; unknown category/product/path 404; counts checked for category scope (parent includes children), text/partial/Arabic/SKU search, price, brand, attribute, on-sale, in-stock filters; sorting; page 2; sitemap (42 URLs); noindex on filtered URLs; view API validation.
Not verified: visual QA in a browser; Core Web Vitals; search suggestions (not built).

## Known issues / placeholders
- `next build` needs a reachable MongoDB (home page prerenders from DB).
- Products use emoji placeholder visuals; `images[]` + `next/image` are wired but the remote host allowlist in `next.config.ts` is empty until storage is chosen (Phase 5).
- Ratings are seeded demo values; no review UI/moderation yet (Phase 5). JSON-LD omits `aggregateRating` on purpose.
- Variant stock is displayed, but cart/stock enforcement is Phase 3/4. Cart is still the browser-only demo.
- Journal articles are demo placeholders. Links to cart, wishlist, account, journal, legal pages still 404.
- Search suggestions/autocomplete not implemented.

## Next
Phase 3: auth (secure sessions, roles), profile, UAE addresses, wishlist, server-validated guest/user cart with merge.
