# Security overview (Phase 7 review)

Scope: everything in this repository. Not covered: your hosting account, MongoDB Atlas configuration, DNS/TLS, payment-gateway dashboard, email provider — see `docs/deployment.md`.

## Controls in place
| Area | Control |
|---|---|
| Transport/headers | HSTS (prod), `X-Frame-Options: DENY`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`, no `X-Powered-By`. **CSP (prod):** `default-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`, `base-uri/form-action 'self'`, `connect-src 'self'`, images only from self/data/blob + `IMAGE_HOSTS`. Source: `src/lib/security-headers.ts` (unit-tested). |
| Authentication | scrypt hashes, 256-bit random session tokens stored hashed, `httpOnly` + `SameSite=Lax` + `Secure` cookies, `__Host-` prefix in production, customer sessions 30 days, **staff sessions 3 days**, sessions revoked on password change/reset/role change/disable, generic login errors, constant-time verification, login/register/reset/change-password/coupon/review/checkout/upload rate limits. |
| Authorization | Permission map checked on the server for every admin page (`guard`), server action (`actor`) and route handler; resource ownership is part of every customer query (addresses, orders, carts, wishlist). Verified by an automated guest/customer/staff-role matrix. |
| CSRF | Mutations are Server Actions (Next compares `Origin` with the host; behind a proxy make sure it forwards `x-forwarded-host`) + `SameSite=Lax`; the upload route also checks `Origin`; no state-changing GET routes. |
| Input handling | Zod/typed validation on every action; server actions are treated as public endpoints (argument types re-checked); query-string filters are parsed through an allow-list (operators like `brand[$ne]` are ignored); regexes built from user input are escaped; CSV import is size/row-bounded and never evaluates content; prototype-pollution keys are dropped. |
| Output encoding | React escapes everything; the only raw HTML is two constant/escaped scripts (theme bootstrap, JSON-LD with `<` escaped). User text (reviews, articles, pages) is rendered as plain text. |
| Uploads | Admin only, ≤ 4 MB, type detected from magic bytes (PNG/JPEG/WebP), random filenames, stored outside MongoDB; remote image hosts are an allow-list. SVG is rejected. |
| Payments | No card data ever touches the app. Only a signed webhook (HMAC-SHA256 + 5-minute timestamp window + raw-body verification) can mark an order paid; events are idempotent (unique `provider+eventId`), amount/currency/reference are checked, the mock provider is refused in production, cron/health secrets use constant-time compare. |
| Data minimisation | No passwords/tokens/cookies/bodies in logs; reset links are only printed in development; reviews show first name + initial; staff see masked customer emails unless owner; audit log stores summaries, not secrets. |
| Dependencies | `npm audit --omit=dev` → 0 vulnerabilities. `npm audit` reports 5 *dev-only* advisories (`braces` via `eslint-config-next`, ReDoS in glob patterns of the linter) — not shipped; fixing would downgrade Next's lint config. Re-check before each release. |

## Known limitations / decisions to revisit
- **CSP uses `'unsafe-inline'` for scripts/styles** (Next's inline bootstrap + the no-flash theme script). A nonce-based CSP (`proxy.ts` per-request nonce + `strict-dynamic`) is stronger but forces every page to render dynamically (no ISR for the home page). Revisit if you add third-party scripts. When you integrate a payment SDK / analytics / error reporting, add their hosts to `script-src`/`connect-src`/`frame-src`.
- **Client IP for rate limiting** is read from `x-forwarded-for`/`x-real-ip`. That is safe behind Vercel/Cloudflare/most load balancers that overwrite the header; if clients can reach the app directly the value is spoofable.
- **Self-built authentication** (documented in `docs/auth.md`); no MFA, no email verification, no device list. Recommended before scale: MFA for staff, email verification, breached-password check.
- **Registration reveals whether an email exists** (rate-limited); login and password reset do not.
- **Rate limiting is Mongo-backed** (fixed window): fine for one region; use Redis/Upstash for high traffic (`RateLimiter` interface).
- Public product/category pages are rendered per request (never cached) so price/stock are fresh; the home page is cached for 60 s (card prices/stock there can be up to a minute stale — the cart and checkout always re-validate on the server).
- No WAF/DDoS protection in the app — use your host/CDN.
- Image uploads are not virus-scanned.

## Checklist before launch
1. Set all environment variables from `.env.example` in the host; `NEXT_PUBLIC_SITE_URL` must be `https://…` (boot logs warn otherwise).
2. Remove the demo data/accounts (`@example.test`); never run `npm run seed` against production (it refuses non-dev database names).
3. Create the first owner: register a normal account, then promote it directly in MongoDB (`db.users.updateOne({email:"you@…"},{$set:{role:"owner"}})`), and change that account's password.
4. Rotate `PAYMENT_WEBHOOK_SECRET` / `CRON_SECRET` if they were ever shared; keep them out of the repository.
5. Run a staging pass with your real payment gateway in sandbox mode (webhook signature, duplicate delivery, failed/cancelled payments, refunds).
6. Review the policy pages (privacy, terms, returns…) — they ship as placeholders.
