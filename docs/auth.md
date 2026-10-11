# Authentication, sessions & security (Phase 3)

**Approach.** Self-contained, DB-backed sessions (no third-party auth library). Next.js' guide recommends a maintained library for production; the spec asks for one too. This implementation keeps the security-critical parts small and testable (`src/lib/auth/*`) and can be swapped for Better Auth / Auth.js behind `getCurrentUser()` / `requirePermission()` if you prefer — nothing else in the app depends on the internals.

- **Passwords:** scrypt (N=2^17, r=8, p=1), per-password salt, parameters stored in the hash for future upgrades, constant-time compare, dummy-hash verification for unknown emails (no timing oracle). Min 10 chars, max 128, no composition rules.
- **Sessions:** 32-byte random token in an `httpOnly`, `SameSite=Lax`, `Secure` (production) cookie, 30-day absolute lifetime. Only the SHA-256 of the token is stored (`sessions`, TTL-indexed). Sign-out deletes the row; password reset deletes all of a user's sessions.
- **CSRF:** all mutations are Server Actions (Next.js verifies `Origin` against `Host`) + `SameSite=Lax` cookies. No state-changing GET routes. `/api/session` is read-only and `no-store`.
- **Authorization:** checked on the server in the data-access layer (`requireUser`, `requirePermission`), never only in UI. Roles: `customer`, `owner`, `catalog_manager`, `operations_manager`, `content_editor` → permission map in `src/lib/auth/permissions.ts` (least privilege; `owner` has all). Admin UI arrives in Phase 5 and must call `requirePermission`.
- **Ownership:** addresses are always queried with `{ _id, user }`, so users cannot read/edit others' addresses; carts are keyed by session user or an unguessable guest cookie.
- **Rate limits** (`src/lib/rate-limit.ts`, Mongo-backed fixed window behind a `RateLimiter` interface — swap for Redis/Upstash): login 5/15 min per email+IP and 30/15 min per IP; register 10/h per IP; forgot-password 5/h per email+IP; reset 10/h per IP. Coupon/review/checkout limits arrive with those features.
- **Enumeration:** login failure message is identical for unknown email/wrong password/disabled; forgot-password always responds the same. (Registration does reveal "email already exists" — standard UX trade-off, rate-limited.)
- **Password reset:** 32-byte token, only its hash stored, 1-hour expiry, single use (atomic delete), page sends `no-referrer`. Email goes through `src/lib/mailer.ts`: in development the link is printed to the server console (nothing is sent); in production with no provider it logs a warning without the link. Add a real provider (Resend/SES/SendGrid) in `getMailer()`.
- **Open redirect:** `?next=` accepts only same-site relative paths (`safeNext`).
- **Privacy:** no passwords/tokens in logs or echoed form state; session API exposes only name, role, cart count and wishlist ids.

## Carts
Stored by SKU (variant SKU when applicable) with quantity only. `getCartView()` re-reads price and stock from the catalogue on every view; quantities are clamped to stock and a per-line max of 10, lines can be flagged *price changed / reduced / out of stock / unavailable*. Guest carts use an httpOnly `cart_id` cookie (30-day TTL); on sign-in/sign-up `mergeGuestCart` folds them into the user cart by SKU (no duplicates, clamped to stock). Checkout (Phase 4) will recompute everything again server-side.

## Demo accounts (development only)
`npm run seed` creates `owner@`, `catalog@`, `ops@`, `content@`, `customer@example.test` with the public demo password printed by the script. Never seed or use them in production.
