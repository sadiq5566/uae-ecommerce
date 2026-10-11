# Admin guide (Phase 5)

Open `/admin` (English-only, outside the `/en` `/ar` routes). Sign in with a staff account; the sidebar only shows what your role may use, and **every page and action re-checks the permission on the server** (`guard()` for pages, `actor()` for server actions, route handlers check too). Unauthorised direct URLs redirect to a 403 page.

| Role | Permissions |
|---|---|
| Owner / Admin | everything incl. staff roles, customer account status, audit log, settings |
| Catalogue manager | dashboard, products, categories, inventory, promotions |
| Operations manager | dashboard, orders (read/update), customers (masked), inventory, review moderation, delivery |
| Content editor | dashboard, articles, pages, homepage |

Assign roles in **Staff & roles** (the person must register first; changing a role signs them out; you can't change your own role or remove the last owner). Demo staff logins (dev only) are created by `npm run seed`.

## Modules
- **Dashboard** — sales, orders, AOV, status counts, sales per day, best sellers, low stock, most sold/viewed, recent activity. Date range: today / 7 / 30 / 90 days / custom (UAE time). *Sales* = orders created in the range with status confirmed→delivered (COD included); pending-payment, cancelled and refund orders are excluded.
- **Products** — search/filter, bulk publish/unpublish/archive/delete (published products can't be deleted), full editor (bilingual content, price/sale with optional schedule, images with alt text and order, variants, specs, category attributes, SEO, featured). Unique slug/SKU validation, slug changes keep a 301 redirect, stock edits are logged.
- **Categories** — two levels, attributes (drive storefront filters), image, SEO, order, active; cycles prevented; can't delete a category with subcategories or non-archived products.
- **Inventory** — adjust (± or set) with a reason and note; conditional on the stock you saw so concurrent orders aren't overwritten; movement history.
- **CSV import/export** — see `docs/csv-import.md`.
- **Orders** — search by number/email/name/phone, filter by status/payment/date; detail shows the purchase snapshot, fee breakdown, payment reference and timeline; status changes follow the allowed transitions (cancellation needs a note and restores stock/coupon). **Refunds:** "Start refund" asks the provider if an adapter supports it; the order only becomes *refunded* when the provider confirms (webhook) — or, for COD cash refunds / owner overrides, when a reference is recorded manually.
- **Reviews** — queue (pending/flagged/approved/rejected/hidden). Reviews are verified-purchase only (delivered order) and invisible until approved; ratings are recalculated from approved reviews; 3 customer reports re-queue a review.
- **Promotions** — coupons: percent/fixed, cap, min subtotal, dates (UAE time), total and per-customer limits, include/exclude categories and SKUs, optional stacking with sale prices. Used coupons are deactivated, not deleted. Product **sale prices** (with optional start/end) are on the product page.
- **Delivery** — zones (emirates, fee, optional free-over threshold, estimate); warns when an emirate isn't covered.
- **Settings** — store name/contact/logo, minimum order, free delivery threshold, COD enable/fee/limit, VAT (off by default), payment window. Gateway keys are never stored here.
- **Articles / Pages / Homepage** — bilingual journal posts (draft/published, optional schedule), editable About/Contact/FAQ/Delivery/Returns/Privacy/Terms/Help pages (seeded with clearly marked placeholders — **you must write the real policy text**), hero banners/campaigns with date windows and section toggles. Text supports blank-line paragraphs, `## headings` and `- lists`; HTML is never rendered.
- **Customers** — lookup with masked email for non-owners; owners can disable/enable accounts (disabling signs the user out).
- **Audit log** — every sensitive change (who, what, when).

## Images
Product/category/article/banner images are URLs. In development, uploads go to `public/uploads` (`STORAGE_DRIVER=local`, magic-byte checked, ≤4 MB, PNG/JPEG/WebP). **Production has no storage by default** — implement `ImageStorage` (`src/lib/storage.ts`) for S3/R2/Cloudinary/Vercel Blob and select it with `STORAGE_DRIVER`, or paste URLs from a CDN host listed in `IMAGE_HOSTS` (also used for `next/image` `remotePatterns`).

## Scheduled work
Call `GET /api/cron/maintenance` with `Authorization: Bearer $CRON_SECRET` every ~5 minutes: cancels unpaid online orders past their window (restocking), and applies scheduled sale prices. Scheduled articles and banners need no job (filtered by date when read).
