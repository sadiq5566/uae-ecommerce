# Hosting guide (what to buy, in what order)

Prices below are rough monthly figures from memory — **check each provider's pricing page before paying**.

## 1. What this site needs (3 pieces + a domain)

| Piece | What it does | Options |
|---|---|---|
| **App server** | runs Next.js (storefront + admin + API) | Vercel · Render/Railway · a VPS (Hetzner, DigitalOcean, Contabo) |
| **Database** | MongoDB (products, orders, users) | **MongoDB Atlas** (recommended) or MongoDB on your VPS |
| **Image storage + CDN** | all product pictures | **Cloudflare R2** (recommended) · AWS S3 + CloudFront · Cloudinary · Vercel Blob |
| **Domain + HTTPS** | your address | any registrar; HTTPS is automatic on Vercel/Cloudflare/Caddy |

Why images need their own storage: on Vercel/Render/Railway the app's disk is **temporary** — files in `public/uploads` disappear on every deploy. This repo's "local" image driver is also **switched off in production on purpose**, and there is **no production storage adapter yet** (`docs/deployment.md`). So before launch one adapter (R2/S3) must be added — small job, can be built for you.

## 2. Your current numbers (measured)
- `public/uploads`: **529 MB, 712 files** (cleaned PNGs, ~0.75 MB each).
- Product records still pointing at another website's images (`amaraswatches.shop`, `cdn.shopify.com`): **704 images** — they break if that site changes/removes them, so they must be copied to your own storage too.
- Database: under 1 MB today (344 products). MongoDB is not the problem; **images are the size**.
- Shrink first: convert to **WebP, max ~1400 px**. 529 MB → roughly **40–80 MB**, pages load faster, storage and bandwidth cost almost nothing.
- Rule of thumb after shrinking: ~0.7 MB of images per product → 1,000 products ≈ 1 GB, 10,000 ≈ 7 GB.

## 3. Recommended setups

### A. Easiest / least maintenance (recommended to start)
| Item | Choice | ≈ cost |
|---|---|---|
| App | **Vercel Pro** (Hobby is not allowed for commercial sites) | ~$20 |
| Database | **MongoDB Atlas** — start M0 (free) only for testing; for real orders use a paid cluster with backups (M10 ≈ $55–60) or a smaller shared tier if available | $10–60 |
| Images | **Cloudflare R2** (10 GB free, no download fees) + custom domain `img.yourshop.ae` | ~$0–2 |
| Domain | `.ae` / `.com` | ~$1–4 |
| **Total** | | **≈ $30–85** |

Next.js image optimisation on Vercel is metered; if usage grows, serve the already-small WebP files straight from R2 (`unoptimized`) or use Cloudflare's image resizing.

### B. Cheapest (you manage a server)
| Item | Choice | ≈ cost |
|---|---|---|
| Server | VPS 2 vCPU / 4 GB RAM (Hetzner, DigitalOcean, Contabo) running Node 20+ with **PM2 + Nginx/Caddy** | $6–20 |
| Database | Atlas (managed backups) **or** MongoDB on the same VPS with nightly `mongodump` to off-site storage | $0–60 |
| Images | R2/S3 (best) or the VPS disk behind Nginx (needs a small code change; disk must be backed up) | $0–5 |
| **Total** | | **≈ $10–45** |

Needs someone comfortable with Linux: updates, firewall, SSL renewal, backups, restarts.

### Region / speed for UAE customers
Pick the closest regions: Atlas on AWS **Middle East (UAE `me-central-1`)** or Bahrain `me-south-1` if offered for your tier; app in the same cloud region (or Frankfurt/Mumbai if the UAE region isn't available on your plan). Put Cloudflare (free plan) in front for caching and DDoS protection.

## 4. Do these in order
1. **Shrink images** (WebP, ~1400 px) — script can be added next to `clean-images`.
2. **Create storage**: Cloudflare account → R2 bucket → public access via custom domain (`img.yourshop.ae`) → API token (write) .
3. **Build the production image adapter** (S3-compatible, works for R2/S3) and set `STORAGE_DRIVER=r2` + keys. Admin uploads and `clean-images` then write to R2.
4. **Migrate existing images**: upload `public/uploads/*` to R2, download the 704 remote images and upload them too, rewrite product/variant URLs in MongoDB (script prints a rollback map, like `clean-images`). Then set `IMAGE_HOSTS=img.yourshop.ae` only.
5. **Atlas**: create the cluster, a database user with readWrite on the `souq_uae_prod` DB only, allow your host's IPs, enable backups. Export your dev data (`mongodump` of products/categories/coupons/settings…) and `mongorestore` into prod — **don't** copy demo users or test orders.
6. **Deploy the app** (connect the GitHub repo to Vercel, or `git pull && npm ci && npm run build && pm2 start` on the VPS). Set the environment variables (section 5). The database must be reachable at build time.
7. Run `npm run db:indexes` then `npm run db:migrate` against the production DB (with prod `MONGODB_URI`/`MONGODB_DB` exported).
8. **Create the real owner account** (see `docs/security.md`). Never run `npm run seed` on production: the demo logins (`owner@example.test`, password `Demo-Pass-2026!`) are public in this repo. Delete any demo users that exist in the data you restored.
9. Schedule `GET https://<site>/api/cron/maintenance` every 5 min with header `Authorization: Bearer $CRON_SECRET` (Vercel Cron / GitHub Actions / cron-job.org) — expires unpaid orders and applies scheduled sale prices.
10. Domain + HTTPS, set `NEXT_PUBLIC_SITE_URL=https://yourshop.ae`, submit `sitemap.xml` to Google.
11. Test a full order (COD), a return, an admin login, an image upload, and **a database restore into staging** before taking real orders.

## 5. Environment variables to set on the host
`NEXT_PUBLIC_SITE_URL` · `MONGODB_URI` · `MONGODB_DB=souq_uae_prod` · `CRON_SECRET` · `IMAGE_HOSTS` (your image domain) · `IMAGE_BLOCKLIST` (optional) · `STORAGE_DRIVER` + storage keys (after the adapter exists) · payment variables once a gateway adapter exists (`PAYMENT_PROVIDER`, `PAYMENT_WEBHOOK_SECRET`). Full list and comments: `.env.example`.

## 6. Still missing for a real launch (not hosting, but required)
- **Payment gateway** for the UAE (Network International, Telr, PayTabs, Checkout.com, Stripe…) — only COD works until an adapter is written. Gateway accounts usually need a trade licence.
- **Email provider** (Resend / SES / SendGrid) for password reset and order emails — currently logs only.
- Real policy text in Admin → Pages (the seeded pages are placeholders), VAT settings, delivery zones/fees, store name/contact.
- Remove the "Demo store — sample data only" footer text and the 11 demo categories (Electronics, Fashion, …) that have no products.
- Product images: only publish photos you own or have written permission to use (supplier/brand/other-store images need permission).
- Error reporting (Sentry) and an uptime check on `GET /api/health`.

## 7. Backups
Atlas backups (test a restore!), versioning on the R2 bucket, and keep a copy of `.env` secrets in a password manager. Images live in R2; the database stores only their URLs.
