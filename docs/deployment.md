# Deployment & operations

Target: Next.js on Vercel (or any Node 20+/24 host) + MongoDB Atlas. Nothing is Vercel-specific except the cron suggestion.

## 1. Accounts and decisions you need to provide
| Needed | Why | Status in this repo |
|---|---|---|
| MongoDB Atlas cluster (M10+ recommended for backups) | database | works with any MongoDB 6+; standalone is fine too (no multi-document transactions are required — stock/idempotency use atomic updates + compensation) |
| Hosting (Vercel/Node server) + domain + TLS | serving | build & start tested locally |
| **Payment gateway** with UAE availability (e.g. Network International, Telr, PayTabs, Checkout.com, Stripe — verify current UAE support/fees) | cards, Apple Pay, Google Pay | **adapter interface + signed-webhook handling done; the provider adapter itself is NOT written** (needs your merchant account). Until then only cash on delivery is offered. Apple Pay needs domain verification + gateway enablement; Google Pay needs gateway/merchant setup |
| Email provider (Resend/SES/SendGrid…) | password reset, order emails | `Mailer` interface + console dev driver only; production logs "not sent" |
| SMS provider (optional) | delivery notifications | interface + dev logger only |
| Object storage (S3/R2/Cloudinary/Vercel Blob) | product images | `ImageStorage` interface; **no production adapter yet** (use CDN URLs + `IMAGE_HOSTS` meanwhile) |
| Error reporting (Sentry etc.) | monitoring | `instrumentation.ts` `onRequestError` hook ready; add the SDK |
| VAT/legal advice | tax settings, policies | VAT is off by default; legal pages are placeholders |

## 2. Environments
Use three isolated environments, each with its **own database and secrets**: local (`souq_uae_dev`), staging (`souq_uae_staging`), production (`souq_uae_prod`). Staging should use the gateway's sandbox. Preview deployments must never point at the production database.

Environment variables: see `.env.example` (names + safe placeholders only).

## 3. First deploy
1. Atlas: create a database user with **readWrite on the app database only**; allow your host's egress IPs (or use Vercel's Atlas integration / private networking); enable backups.
2. Set env vars in the host. `next build` renders the home page from MongoDB, so the database must be reachable **at build time**.
3. `npm run build` → deploy.
4. Create indexes: `npm run db:indexes` (with the production `MONGODB_URI`/`MONGODB_DB` exported), then `npm run db:migrate`. Runtime auto-indexing is disabled in production unless `MONGODB_AUTO_INDEX=true`.
5. Create the first owner (see `docs/security.md` checklist step 3), then configure the store in **Admin → Settings / Delivery / Pages / Homepage**; add categories and products (CSV import available).
6. Schedule the maintenance job every ~5 minutes: `GET https://<site>/api/cron/maintenance` with header `Authorization: Bearer $CRON_SECRET` (Vercel Cron, GitHub Actions, any scheduler). Without it unpaid card orders are never expired and scheduled sale prices don't start/end.
7. Payments: when you add a gateway adapter, register the webhook URL `https://<site>/api/webhooks/payments` in the gateway dashboard and set `PAYMENT_WEBHOOK_SECRET`.
8. Submit `https://<site>/sitemap.xml` to search engines; check `robots.txt`.

## 4. Schema changes (migrations)
Forward-only, additive, idempotent scripts in `scripts/migrations/NNN-name.ts` run by `npm run db:migrate` (applied names are stored in `_migrations`). Deploy order: **migrate first (backwards-compatible), then ship the code**; remove old fields in a later release. Mongoose schemas define validation and indexes; `npm run db:indexes -- --sync` also drops indexes that were removed from the schemas (run deliberately). Take an Atlas snapshot before destructive migrations.

## 5. Inspecting query performance
```js
// mongosh
db.products.find({status:"published", category: ObjectId("…"), finalPrice:{$lte:300}}).sort({finalPrice:1}).explain("executionStats")
db.orders.find({status:"pending_payment", expiresAt:{$lt:new Date()}}).explain("executionStats")
```
Look for `IXSCAN`, and `totalDocsExamined` ≈ `nReturned`. Atlas Performance Advisor/Profiler shows slow queries in production. Indexes are defined next to each model in `src/models/*`.

## 6. Monitoring & logging
- Uptime: probe `GET /api/health` (200 = app + database reachable, 503 otherwise).
- Logs: server errors are emitted as one JSON line each (`instrumentation.ts`: message, digest, path, method, route) — ship stdout to your log service; the `digest` shown on the error page ("ref: …") matches it. No bodies, cookies or personal data are logged.
- Alerts to set: health failing, 5xx rate, Atlas CPU/connections/replication lag, failed webhook deliveries in the gateway dashboard, `refund_pending`/`pending_payment` orders older than a day (Admin dashboard "Needs attention").
- Audit trail: Admin → Audit log.

## 7. Backups & recovery
- Atlas continuous/cloud backups with point-in-time recovery; test a restore into staging **before launch** and quarterly. Alternative for self-hosted MongoDB: nightly `mongodump --uri … --gzip --archive=…` to off-site storage.
- Images live in object storage (enable versioning there); the database only stores URLs.
- Order/stock data is the critical dataset (`orders`, `inventorymovements`, `products`, `users`, `coupons`, `couponredemptions`).

## 8. Rollback
- **Code:** redeploy the previous build (Vercel "Promote previous deployment"). Because migrations are additive, the old code keeps working with the newer database.
- **Data:** restore from Atlas snapshot only for data corruption; for a bad migration, write a compensating migration.
- **Config:** every sensitive admin change is in the audit log; settings/zones/coupons can be edited back in Admin.
- Incident toggles available without a deploy: disable COD or change fees in Admin → Settings; unpublish products in bulk; disable a customer account; remove the payment provider env var to fall back to COD only.

## 9. Local development / commands
```bash
npm install && cp .env.example .env.local   # point MONGODB_URI at a local/Atlas dev database
npm run seed -- --reset                     # DEV ONLY demo data (refuses non-dev DB names / production)
npm run dev                                 # http://localhost:3000   (admin: /admin — demo owner@example.test)
npm run typecheck && npm run lint && npm test && npm run build
npm run db:indexes && npm run db:migrate    # deploy-time database tasks
```
Resetting a local database: `mongosh souq_uae_dev --eval 'db.dropDatabase()'` then re-seed. Tests use throw-away databases `souq_uae_test_*` on the same MongoDB (skipped automatically if MongoDB isn't running).
