# Database Schema (MongoDB + Mongoose)

Complete schema of the Souq UAE e-commerce store, taken from `src/models/*.ts`. It is meant to be handed to another project or AI assistant as a spec.
**22 files → 25 collections** (reviews.ts defines 3 collections).
Database: MongoDB, ODM: Mongoose, language: TypeScript. All schemas use `{ timestamps: true }` unless noted.

---

## 1. Conventions used everywhere

| Convention | Meaning |
|---|---|
| **i18n field** `{ en, ar }` | Every customer-facing text is bilingual (English + Arabic). Written as `name: { en: "...", ar: "..." }` |
| **Money** | Plain `Number` in **AED** (2 decimals). Calculations are done in integer fils (×100) and rounded half-up |
| **Snapshots** | Orders/returns copy names, prices and addresses at the time of purchase. Later catalogue edits never change history |
| **Append-only ledgers** | `AuditLog`, `InventoryMovement` (only `createdAt`, never updated) |
| **TTL indexes** | `expiresAt` with `expires: 0` auto-deletes the document at that time (sessions, resets, rate limits, guest carts, webhooks) |
| **Singletons** | `Settings` (`key:"store"`) and `Homepage` (`key:"home"`): one document each |
| **Placeholder visuals** | `icon` (emoji) + `hue` (0–360) are shown until real images are uploaded |
| **Model registration** | `models.X ?? model("X", schema)`, so Next.js hot reload doesn't re-register |
| **Images** | Only URLs are stored (never binaries in MongoDB). Local files live at `/uploads/<24hex>.png|jpg|webp` |
| **Slugs** | lowercase, unique; products/categories keep `slugHistory[]` so old URLs redirect (301) |

---

## 2. Relationship map

```
User ──< Address
User ──< Session            (TTL)
User ──< PasswordReset      (TTL)
User ──1 Cart               (or guestId for anonymous carts)
User ──< Order ──< (items snapshot of Product)
User ──< Review >── Product         Review ──< ReviewVote / ReviewReport
User.wishlist[] ──> Product

Category ──< Category       (parent, 2 levels max)
Category ──< Product
Product  ──< InventoryMovement >── Order / User(actor)

Order ──< ReturnRequest
Order ──1 CouponRedemption >── Coupon
Order ──< WebhookEvent

Coupon.products/categories/excludeProducts/excludeCategories ──> Product / Category
DeliveryZone  (matched to Order.address.emirate)
Settings, Homepage (singletons) · Article, ContentPage (CMS) · Lead (marketing) · AuditLog · RateLimit
```

---

## 3. Catalogue

### `categories` — Category
| field | type | notes |
|---|---|---|
| `slug` | String | required, **unique**, lowercase, trim |
| `slugHistory[]` | [String] | old slugs for redirects |
| `name` | i18n | required (en, ar) |
| `description` | `{en, ar}` | optional |
| `parent` | ObjectId → Category | default `null` = top level, **indexed**. Max two levels |
| `icon` | String | default `🛍️` |
| `hue` | Number | default 160 |
| `image` | String | URL |
| `order` | Number | default 0 (sort) |
| `active` | Boolean | default true |
| `attributes[]` | `{key, label: i18n}` | defines the filters for products in this category (e.g. `color`, `size`) |
| `seo` | `{title:{en,ar}, description:{en,ar}}` | |

Indexes: `{active:1, order:1}`, unique `slug`, `parent`.

### `products` — Product
| field | type | notes |
|---|---|---|
| `slug` | String | required, **unique**, lowercase |
| `slugHistory[]` | [String] | old slugs → 301 |
| `sku` | String | required, **unique**, UPPERCASE. This is the key for CSV import |
| `name` | i18n | required |
| `description` | `{en, ar}` | default `""` |
| `category` | ObjectId → Category | required |
| `brand` | String | |
| `price` | Number | required, ≥ 0 (list price) |
| `salePrice` | Number | ≥ 0 |
| `saleStartsAt`, `saleEndsAt` | Date | optional sale window |
| `finalPrice` | Number | required. **Derived** in a `pre("validate")` hook = `effectivePrice()`. Indexed for filter/sort |
| `stock` | Number | default 0, ≥ 0. With variants = sum of variant stock |
| `lowStockThreshold` | Number | default 5 |
| `variants[]` | `{sku (UPPER, required), label: i18n, stock, price?, image?, swatch?}` | no `_id`. Colours/sizes |
| `attrs` | Map<String,String> | values for the category's `attributes` keys |
| `specs[]` | `{label: i18n, value: i18n}` | spec table |
| `tags[]` | [String] | |
| `images[]` | `{url, alt:{en,ar}}` | |
| `icon`, `hue` | String, Number | placeholder visuals (default `📦`, 160) |
| `ratingAvg` | Number | 0–5, recalculated from approved reviews |
| `ratingCount`, `viewCount`, `soldCount` | Number | default 0 |
| `featured` | Boolean | default false |
| `status` | enum | `draft` (default) · `published` · `archived` |
| `seo` | `{title, description}` bilingual | |

`effectivePrice(p, now)`: returns `salePrice` if `salePrice < price` **and** now is inside the sale window (when set); otherwise `price`.

Indexes:
- Text index `product_text` on `name.en, name.ar, description.en, description.ar, brand, tags`. Weights: names 10, brand 5, tags 3. `default_language: "none"` so Arabic matches.
- `{status, category, finalPrice}`, `{status, createdAt:-1}`, `{status, viewCount:-1}`, `{status, soldCount:-1}`, `{status, featured}`, `{status, brand}`
- `{slugHistory}`, `{"variants.sku"}`; unique `slug`, unique `sku`.

### `reviews` — Review
| field | type | notes |
|---|---|---|
| `product` | → Product | required |
| `user` | → User | required |
| `order` | → Order | the delivered order that makes it a verified purchase |
| `rating` | Number | required 1–5 |
| `title` | String | ≤100 |
| `body` | String | required, 10–2000 chars |
| `authorName` | String | required, ≤60 (first name + initial, never the email) |
| `verified` | Boolean | default false |
| `status` | enum | `pending` (default) · `approved` · `rejected` · `hidden` |
| `helpfulCount`, `flagCount` | Number | default 0 |
| `moderatedBy` → User, `moderatedAt` | | |
| `demo` | Boolean | seeded sample, dev only |

Indexes: **unique `{product, user}`** (one review per customer per product), `{product, status, createdAt:-1}`, `{status, flagCount:-1, createdAt:-1}`.

### `reviewvotes` — ReviewVote
`review` (ObjectId, required), `user` (ObjectId, required), `createdAt`. Unique `{review, user}` (one "helpful" vote per user).

### `reviewreports` — ReviewReport
`review`, `user` (required), `reason` enum `spam|offensive|irrelevant|other` (default `other`), `createdAt`. Unique `{review, user}`.

### `inventorymovements` — InventoryMovement (append-only)
| field | type | notes |
|---|---|---|
| `product` | → Product | required, indexed |
| `sku` | String | required (variant SKU if applicable) |
| `delta` | Number | required, positive or negative |
| `reason` | enum | `order_placed, order_cancelled, order_expired, manual_adjustment, restock, correction, return_restock, exchange_dispatched` |
| `order` → Order, `actor` → User, `note` | | |

Only `createdAt` (no `updatedAt`).

---

## 4. Customers & auth

### `users` — User
| field | type | notes |
|---|---|---|
| `email` | String | required, **unique**, lowercase |
| `name` | String | required, ≤100 |
| `phone` | String | |
| `passwordHash` | String | required, **`select:false`** (never returned unless explicitly selected) |
| `role` | enum | `customer` (default) · `owner` · `catalog_manager` · `operations_manager` · `content_editor`. Indexed |
| `status` | enum | `active` (default) · `disabled` |
| `locale` | enum | `en` (default) · `ar` |
| `wishlist[]` | [→ Product] | bounded list (`WISHLIST_MAX`) |
| `lastLoginAt` | Date | |

Roles → permissions (`src/lib/auth/permissions.ts`). Example: `catalog_manager` = dashboard, products:write, categories:write, inventory:write, promotions:write. Other permissions: orders:read/write, customers:read, reviews:moderate, users:manage, etc.

### `addresses` — Address
`user` (→ User, required, indexed), `label` (≤40), `recipientName` (req, ≤100), `phone` (req), `emirate` (req, enum below), `area` (req, ≤100), `street` (≤150), `building` (req, ≤100), `unit` (≤40), `landmark` (≤150), `instructions` (≤300), `isDefault` (Boolean).
Emirates enum: `abu-dhabi, dubai, sharjah, ajman, umm-al-quwain, ras-al-khaimah, fujairah`.

### `sessions` — Session
`tokenHash` (required, unique. **Only the SHA-256 hash of the cookie token is stored**, so a DB leak can't be replayed), `user` (→ User, required, indexed), `expiresAt` (required, **TTL**), `createdAt`.

### `passwordresets` — PasswordReset
`tokenHash` (required, unique), `user` (→ User, required, indexed), `expiresAt` (required, **TTL**). No timestamps option.

### `ratelimits` — RateLimit
`key` (required, unique), `count` (default 0), `resetAt` (required, **TTL**). Used for throttling login/forms.

---

## 5. Cart & checkout

### `carts` — Cart
| field | type | notes |
|---|---|---|
| `user` | → User | **unique, sparse** |
| `guestId` | String | **unique, sparse**. From an httpOnly cookie for anonymous visitors |
| `items[]` | `{sku (req), qty (req, 1–10), priceAtAdd (req)}` | no `_id`. Stored by SKU (variant SKU if any). **Prices are not trusted from here**; the server re-prices at checkout |
| `expiresAt` | Date | **TTL**, set for guest carts only |

Rule: exactly one owner, either `user` or `guestId`. Guest cart merges into the user cart on login.

### `deliveryzones` — DeliveryZone
`key` (req, unique), `name` (i18n req), `emirates[]` (req), `fee` (req, ≥0), `freeThreshold` (≥0, overrides the store-wide threshold), `estimate` (i18n req, e.g. "1–2 business days"), `active` (default true). Index `{active, emirates}`.

### `coupons` — Coupon
| field | type | notes |
|---|---|---|
| `code` | String | required, **unique**, UPPERCASE, regex `^[A-Z0-9_-]{3,30}$` |
| `description` | `{en, ar}` | |
| `type` | enum | `percent` · `fixed` (required) |
| `value` | Number | required, percent 0–100 or fixed AED |
| `maxDiscount` | Number | cap for percent coupons |
| `minSubtotal` | Number | default 0 |
| `startsAt`, `endsAt` | Date | |
| `active` | Boolean | default true |
| `public` | Boolean | default false. Listed on the storefront Offers page |
| `usageLimit` | Number | ≥1; unset = unlimited |
| `usedCount` | Number | default 0 |
| `perCustomerLimit` | Number | default 1 |
| `products[]`, `categories[]` | → Product / Category | empty = applies to all |
| `excludeProducts[]`, `excludeCategories[]` | | |
| `stackWithSale` | Boolean | default false. Coupons don't stack with item sale prices unless true. **One coupon per order, always** |

### `couponredemptions` — CouponRedemption
`coupon` (→ Coupon, req), `user` (→ User), `phone` (guest redemptions are limited per phone), `order` (→ Order, req), `amount` (req).
Indexes: `{coupon, user}`, sparse `{coupon, phone}`, **unique `{order}`**.

---

## 6. Orders

### `orders` — Order
Everything is a snapshot.

| field | type | notes |
|---|---|---|
| `orderNumber` | String | required, **unique** |
| `user` | → User | indexed; absent for guest orders |
| `guest` | Boolean | default false. Guests find their order by order number + phone, or via `trackToken` |
| `trackToken` | String | indexed, secret link token |
| `email` | String | lowercase |
| `source` | enum | `cart` (default) · `buy_now` |
| `locale` | enum | `en` · `ar` |
| `idempotencyKey` | String | required. Prevents duplicate submissions |
| `status` | enum | required, indexed: `pending_payment, confirmed, processing, packed, out_for_delivery, delivered, cancelled, refund_pending, refunded` |
| `items[]` | `{productId, sku, name:{en,ar}, variantLabel:{en,ar}, icon, image, qty, unitPrice, listPrice, lineTotal, couponShare(default 0)}` | |
| `address` | `{recipientName, phone, emirate, area, street, building, unit, landmark, instructions}` | copy of the address |
| `delivery` | `{zone, zoneName:{en,ar}, estimate:{en,ar}}` | |
| `totals` | `{listSubtotal, itemDiscounts, subtotal, couponDiscount, offerDiscount(0), deliveryFee, codFee, tax, taxIncluded, total, currency("AED")}` | |
| `coupon` | `{code, discount}` | |
| `offer` | `{kind: "tier"\|"first_order", percent, discount}` | automatic offer applied |
| `payment` | `{method, status, provider, providerRef, amount, paidAt, failureReason}` | method: `card, apple_pay, google_pay, cod`. status: `pending, paid, failed, cod_pending, cod_collected, refund_pending, refunded` |
| `stockReserved` | Boolean | default false |
| `expiresAt` | Date | unpaid online-payment orders are cancelled and stock released after this |
| `timeline[]` | `{status, at, by, note}` | full status history |

Indexes: unique `orderNumber`; **unique `{user, idempotencyKey}`**; `{user, createdAt:-1}`; `{status, expiresAt}`; sparse `{payment.providerRef}`; `trackToken`.
One discount per order: the best of coupon / spend-tier / first-order wins.

### `returnrequests` — ReturnRequest
| field | type | notes |
|---|---|---|
| `number` | String | required, unique |
| `order` | → Order | required |
| `orderNumber` | String | required, indexed |
| `user` | → User | optional (guest returns allowed) |
| `contact` | `{name, phone, email, locale}` | |
| `resolution` | enum | `credit` (store credit coupon) · `exchange` |
| `reason` | enum | `wrong_size, wrong_color, defective, not_as_described, changed_mind, other` |
| `note` | String | ≤500 |
| `items[]` | `{sku (req), productId, name, variantLabel, qty (≥1), value, exchangeSku, exchangeLabel}` | |
| `status` | enum | `requested` (default) · `approved` · `received` · `completed` · `rejected` · `cancelled`. Indexed |
| `creditAmount`, `creditCode` | Number, String | value of the single-use credit coupon |
| `restocked` | Boolean | default false |
| `staffNote` | String | |
| `timeline[]` | `{status, at, by, note}` | |

### `webhookevents` — WebhookEvent
`provider` (req), `eventId` (req), `type`, `order` (→ Order), `outcome` enum `processed|ignored|rejected` (default `processed`), `note`, `createdAt` (**TTL 90 days**).
**Unique `{provider, eventId}`** makes webhook processing idempotent under retries and races.

---

## 7. Store configuration & content

### `settings` — Settings (singleton, `key:"store"`)
Never holds secrets.

| group | fields (defaults) |
|---|---|
| identity | `storeName {en:"Souq UAE", ar:"سوق الإمارات"}`, `currency "AED"`, `supportEmail`, `supportPhone`, `logo` |
| money | `minOrder 50`, `freeDeliveryThreshold 200`, `baseDeliveryFee 15` (used when no zone matches) |
| COD | `codEnabled true`, `codFee 0`, `codMaxOrder 3000` (0 = no limit) |
| tax | `tax {enabled false, rate 0.05, pricesIncludeTax true, label {en:"VAT", ar:"ضريبة القيمة المضافة"}}`. VAT is **off by default** |
| payments | `pendingPaymentMinutes 30` (≥5): unpaid card orders release stock after this |
| offers.tier | `{enabled true, minSubtotal 500, percent 10, maxDiscount?}` |
| offers.firstOrder | `{enabled true, percent 10, maxDiscount?}` |
| offers.modal | `{enabled true, delaySeconds 2, version "1", collectLeads true, title{en,ar}, body{en,ar}}`. Bump `version` to show the welcome modal again to everyone |
| returns | `returnWindowDays 7` (0–90) |

### `homepages` — Homepage (singleton, `key:"home"`)
- `banners[]`: `{id, active (true), order (0), eyebrow, title, subtitle, ctaLabel (all i18n), ctaHref, image, hue (160), startsAt, endsAt}` (campaigns can be scheduled)
- `sections`: booleans (default true) `deals, featured, newArrivals, popular, mostViewed, journal`

### `articles` — Article (blog / journal)
`slug` (req, unique), `title`, `excerpt`, `body` (all `{en,ar}`, body is plain text, blank line = paragraph), `category` (free label), `cover`, `coverAlt` (i18n), `icon` (default `📰`), `hue`, `author` (≤80), `status` enum `draft|published` (default `draft`), `publishAt` (a published article with a future date goes live then), `seo {title, description}`. Index `{status, publishAt:-1}`.

### `contentpages` — ContentPage
Editable static pages. `slug` (req, unique, enum `about, contact, faq, delivery, returns, privacy, terms, help`), `title`, `body` (i18n), `published` (default false), `updatedBy` (→ User). Legal text is supplied by the merchant.

### `leads` — Lead (marketing contacts)
`email` (lowercase, ≤254), `phone` (≤20), `name` (≤100), `source` enum `welcome_modal|newsletter|checkout|register|exit_intent` (req), `locale` (`en`/`ar`), `marketingConsent` (default false; **only message people who opted in**), `consentAt`, `unsubscribedAt`, `orders` (count), `tags[]`.
Indexes: unique sparse `email`, unique sparse `phone`, `{createdAt:-1}`.

### `auditlogs` — AuditLog (append-only)
`actor` (→ User, req), `actorEmail`, `action` (req, e.g. `product.update`, `product.csv_import`), `entity` (req, e.g. `product`), `entityId`, `summary` (≤300), `meta` (Mixed). Only `createdAt`. Never stores secrets, passwords or full personal data.
Indexes: `{createdAt:-1}`, `{entity, entityId, createdAt:-1}`, `{actor, createdAt:-1}`.

---

## 8. Business rules that live in the data model

1. **Effective price**: `finalPrice = effectivePrice(product)`; recomputed on every save. Always filter/sort on `finalPrice`, never on `price`.
2. **Stock** changes only through code paths that also write an `InventoryMovement` (order placed/cancelled/expired, restock, correction, returns).
3. **Orders are idempotent**: unique `{user, idempotencyKey}`.
4. **Webhooks are idempotent**: unique `{provider, eventId}`.
5. **Unpaid card orders expire** (`expiresAt`), after which they are cancelled and stock is released.
6. **One review per customer per product**; reviews start `pending` and only `approved` ones count in `ratingAvg`.
7. **Categories nest max two levels**; category `attributes` define which product `attrs` keys are valid and which filters appear.
8. **Coupons**: one per order, don't stack with sale prices unless `stackWithSale`; per-customer limit is enforced by user, or by phone for guests; one redemption row per order.
9. **Sessions/reset tokens store only hashes**; `passwordHash` is `select:false`.
10. **Products are never published by import**: new rows default to `draft`.

---

## 9. Using this in another project

- Copy the model files you need from `src/models/`. Each is standalone and only depends on `mongoose`.
- Minimum for a store: `user, session, category, product, cart, order, settings`. Add the others as features are needed.
- `product.ts` exports `effectivePrice()`, so keep it with the model, since the CSV importer also uses it.
- Create indexes at deploy time (this repo: `npm run db:indexes`, and forward-only migrations with `npm run db:migrate`). The text index on products needs `default_language: "none"` for Arabic search.
- To drop Arabic/bilingual support, replace each `i18n` object with a plain `String`.
- To drop the UAE-specific parts, change the `EMIRATES` enum in `address.ts`, the `DeliveryZone.emirates`, and `currency`/`tax` defaults in `settings.ts`.
