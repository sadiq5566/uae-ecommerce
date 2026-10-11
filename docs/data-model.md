# Catalogue data model (Phase 2)

**categories** — `slug` (unique), bilingual `name`/`description`, `parent` (null = top level; one nesting level in the seed), `icon`/`hue` (placeholder visuals), `order`, `active`, `attributes[]` (`{key,label}` — these drive each category's filters), `seo`.

**products** — `slug`/`sku` (unique), bilingual `name`/`description`, `category`, `brand`, `price`, `salePrice`, `finalPrice` (derived in a pre-validate hook; indexed for filter/sort), `stock`, `variants[]` (`sku`, `label`, `stock`, `price`), `attrs` (map matching category attribute keys), `specs[]`, `images[]` (URLs only — no binaries in MongoDB), `ratingAvg/ratingCount` (will be recalculated from moderated reviews), `viewCount`, `soldCount`, `featured`, `status` (draft/published/archived), `seo`.

## Indexes
`product_text` (name/description/brand/tags, `default_language: none` so Arabic matches), `{status,category,finalPrice}`, `{status,createdAt}`, `{status,viewCount}`, `{status,soldCount}`, `{status,featured}`, `{status,brand}`; unique `slug` and `sku`.
Inspect a query plan in `mongosh`:
```js
db.products.find({status:"published", category: ObjectId("…"), finalPrice:{$lte:300}}).sort({finalPrice:1}).explain("executionStats")
```
Look for `IXSCAN` and `totalDocsExamined` close to `nReturned`.

## Search
`listProducts()` in `src/features/catalog/service.ts` is the only search entry point (swap in a dedicated engine later). Order: `$text` match or exact SKU → if zero results, case-insensitive prefix/substring regex on name/brand/SKU (bounded, paginated).

## Views & popularity
`POST /api/views?id=` increments `viewCount` once per browser per product per 30 min (httpOnly cookie), ignores bot user-agents, stores no IP/user data. "Most viewed" = `viewCount` desc; "popular/best sellers" = `soldCount` desc (updated by orders in Phase 4). Both are all-time for now; time-windowed counters can be added later.

## Seeding
`npm run seed` (upsert) or `npm run seed -- --reset` (wipes categories+products). Refuses to run if `NODE_ENV=production` or the DB name lacks `dev`/`local`/`test`. All seeded data is fictional demo data, including ratings.
