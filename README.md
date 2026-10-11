# Souq UAE — e-commerce platform

Next.js 16 (App Router) · TypeScript · Tailwind 4 · MongoDB (Mongoose) · English/Arabic (RTL).
Spec: `PROJECT_SPEC.md`. Progress: `IMPLEMENTATION_STATUS.md`.

## Run locally
```bash
cp .env.example .env.local     # set MONGODB_URI (local mongod or Atlas)
npm install
npm run seed                   # demo catalogue into the dev database
npm run dev                    # http://localhost:3000
```
Scripts: `npm run build | lint | typecheck | test`.

## Structure
`src/app/[lang]` routes · `src/components` shared UI · `src/features` feature modules · `src/lib` env/db/i18n · `src/messages` en/ar dictionaries · `tests` · `docs`.

## Notes
- Locale is the first URL segment (`/en`, `/ar`); `src/proxy.ts` redirects bare URLs.
- Theme: light/dark/system, stored in `localStorage`.
- Requires MongoDB (local `mongod` or Atlas). `npm run seed -- --reset` wipes catalogue collections (dev DBs only).
- Data model, indexes and search notes: `docs/data-model.md`. Auth/session/cart design: `docs/auth.md`.
- Demo logins after `npm run seed`: `customer@example.test` / `owner@example.test` (password printed by the seed script; dev only).
- Checkout, orders, payments, stock rules: `docs/checkout-orders-payments.md`. Dev card payments use a TEST-ONLY mock provider (`PAYMENT_PROVIDER=mock`); without it only cash on delivery is offered.
- Admin (`/admin`), roles, CSV, content, reviews: `docs/admin.md`, `docs/csv-import.md`. Cron: `GET /api/cron/maintenance` (Bearer `CRON_SECRET`).
- Accessibility, RTL/i18n, theming, performance notes: `docs/accessibility-i18n.md`.
- Password-reset emails print to the server console in development (no mail provider configured).
