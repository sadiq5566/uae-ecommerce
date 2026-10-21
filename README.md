# Rayana Collection — multi-category e-commerce platform for the UAE

Storefront + admin dashboard in **English and Arabic (RTL)**, built with Next.js 16 (App Router), React 19, TypeScript (strict), Tailwind 4, MongoDB (Mongoose) and Zod. Specification: `PROJECT_SPEC.md` · build log and known gaps: `IMPLEMENTATION_STATUS.md`.

## What's included
- **Storefront:** home (admin-managed hero banners), nested categories, product pages (variants, gallery, specs, reviews), search with suggestions, data-driven filters/sorting/pagination (URL-shareable), deals / new arrivals, wishlist, cart, checkout, accounts (profile, UAE address book, orders, tracking), journal/articles, editable policy pages, SEO (metadata, hreflang, JSON-LD, sitemap, robots), light/dark/system theme, accessible (axe-clean) and responsive.
- **Commerce rules:** server-validated carts (guest → account merge), delivery zones/fees/free-delivery threshold, COD, coupons, optional VAT, atomic stock handling, idempotent orders, explicit order lifecycle, payment-provider abstraction with signed/idempotent webhooks, refunds recorded only when confirmed.
- **Admin (`/admin`):** dashboard, products/categories/inventory, CSV import/export, orders & refunds, reviews moderation, promotions, delivery, settings, articles/pages/homepage, customers, staff roles, audit log — all permission-checked on the server.

## Quick start (development)
```bash
npm install
cp .env.example .env.local        # set MONGODB_URI (local mongod or Atlas)
npm run seed -- --reset           # demo catalogue, content and logins (dev databases only)
npm run dev                       # http://localhost:3000  ·  admin: /admin
```
Demo logins (password printed by the seed script, **development only**): `owner@`, `catalog@`, `ops@`, `content@`, `customer@example.test`.
Card payments in development use a clearly labelled **test-only mock provider** (`PAYMENT_PROVIDER=mock`); without it only cash on delivery is offered. Password-reset and order emails are printed to the server console in development — nothing is sent.

## Scripts
| | |
|---|---|
| `npm run dev` / `build` / `start` | run / production build / serve |
| `npm run typecheck` · `lint` · `test` | `tsc` · ESLint · Vitest (unit + real-MongoDB integration tests; DB tests skip if MongoDB is down) |
| `npm run seed [-- --reset]` | dev-only demo data (refuses production / non-dev database names) |
| `npm run db:indexes` · `db:migrate` | deploy-time index creation · forward-only migrations |

## Project layout
`src/app` routes (`[lang]` storefront, `admin`, `api`) · `src/features/*` domain modules (catalog, cart, checkout, orders, reviews, content, admin…) · `src/components` shared UI · `src/lib` env, db, auth, payments, storage, i18n, security headers · `src/models` Mongoose schemas/indexes · `src/messages` en/ar dictionaries · `scripts` seed/indexes/migrations · `tests` · `docs`.

## Documentation
`docs/deployment.md` (go-live, environments, cron, backups, monitoring, rollback) · `docs/security.md` (controls, limitations, launch checklist) · `docs/auth.md` · `docs/data-model.md` · `docs/checkout-orders-payments.md` · `docs/admin.md` · `docs/csv-import.md` (columns, formats, examples) · `docs/accessibility-i18n.md`.

## Before you go live — things only you can provide
A MongoDB Atlas cluster, hosting/domain, a **payment gateway account** (cards/Apple Pay/Google Pay need a provider adapter — interface and webhook handling are ready, the provider integration is not), an email provider, production image storage, VAT/legal confirmation and real policy text. Details and status: `docs/deployment.md`, `IMPLEMENTATION_STATUS.md`.
