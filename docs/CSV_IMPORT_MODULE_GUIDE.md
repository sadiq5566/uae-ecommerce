# Admin CSV Product Import — How It Works & How to Reuse It in Another Repo

This repo's admin panel bulk-creates/updates **products** (and categories) from a CSV (or JSONL) file.
Flow: **upload → preview (nothing written) → confirm → import in batches of 100**.
Stack: Next.js App Router + Server Actions, MongoDB/Mongoose, TypeScript. No CSV library: the parser is hand-written (about 100 lines).

---

## 1. End-to-end flow

```
Admin page (/admin/import)
   │  1. user picks file → <form action={previewImportAction}>
   ▼
previewImportAction  (server action, actions.ts)
   ├─ permission check (products:write)
   ├─ size/type checks (≤2 MB, .csv/.jsonl)
   ├─ parseCsv / parseJsonl        → { headers, rows }          (lib/csv.ts)
   ├─ mapColumns                   → canonical column names     (aliases, unknown/dupe columns)
   ├─ rowObject                    → one {column: value} per row
   ├─ groupVariantRows             → merges Shopify-style colour/size rows into 1 product + variants
   ├─ productCtx                   → ONE DB read: categories, existing SKUs, slug owners
   └─ validateProductRows          → per-row {action: create|update|error, errors, doc}   (pure, no DB)
   ▼  returns preview to browser (counts, first 60 rows, errors, unknown columns)
Browser (import-wizard.tsx)
   │  2. user clicks "Import N valid rows"
   │  sends valid rows in chunks of 100
   ▼
importBatchAction  (server action)
   ├─ permission re-check + input sanitising (never trusts the browser)
   ├─ re-runs validateProductRows on the batch (fresh DB context)
   ├─ per row: Product.findOne / new Product → doc.set(...) → save()
   ├─ writes InventoryMovement if stock changed
   ├─ audit log entry + revalidatePath
   └─ returns per-row results (created / updated / failed)
   ▼
Browser shows summary + "Download error report (CSV)"
```

Key design ideas worth keeping in the new repo:

- **Validation is a pure function** (`validateProductRows`) — no DB inside it. The DB context (existing SKUs, categories) is loaded once and passed in, so it is trivially unit-testable.
- **Validate twice**: once for the preview, again on the server per batch. The browser is never trusted.
- **Bad rows never block good rows, and are never silently skipped**: they're listed with line numbers and downloadable as an error CSV.
- **SKU is the upsert key**: SKU exists → update; otherwise → create.
- **Only columns present in the file are written; an empty cell = "leave unchanged"**. So a file with just `sku,price` updates prices only.
- **New products default to `draft`** (never published by accident).

---

## 2. Files to copy (this repo → new repo)

| File | Role | Portable? |
|---|---|---|
| `src/lib/csv.ts` | CSV parser (RFC 4180, BOM, quotes), JSONL parser, `toCsv` writer with formula-injection guard, `mapColumns` (aliases), `rowObject` | ✅ copy as-is, no dependencies |
| `src/features/admin/csv/products.ts` | `PRODUCT_COLUMNS` (aliases), `PRODUCT_TEMPLATE_HEADERS`, `validateProductRows` (all the rules) | ✅ copy; adapt fields to your product schema |
| `src/features/admin/csv/group.ts` | merges rows of the same product (colour/size) into one product with variants | ⚪ optional (only if your source files are Shopify/scraper style) |
| `src/lib/variant-name.ts` | `baseName()` strips trailing " - Red" from names (used by group.ts) | ⚪ optional |
| `src/features/admin/csv/categories.ts` | same idea for categories | ⚪ optional |
| `src/features/admin/csv/actions.ts` | the two server actions (preview + batch import), DB context loaders | 🔧 adapt (models, auth, audit) |
| `src/features/admin/csv/import-wizard.tsx` | client UI: upload, preview table, progress bar, error report | 🔧 adapt UI components |
| `src/app/admin/import/page.tsx` | page with template/export links + wizard | 🔧 adapt |
| `src/app/api/admin/export/route.ts` | GET endpoint: sample template + export of all products | 🔧 adapt |
| `src/lib/image-url.ts` | `IMAGE_HOSTS` allow-list + `IMAGE_BLOCKLIST` | ✅ copy |
| `tests/csv.test.ts` | unit tests for parser/validator | ✅ copy, keep green while adapting |

External things these files import and that your new repo must provide (or replace):

| Import | What it is | Replace with |
|---|---|---|
| `@/lib/admin/guard` → `actor(permission)` | returns the logged-in admin if they hold the permission, else null | your auth/role check |
| `@/lib/admin/audit` → `audit(...)` | writes an audit-log row | your logger (or remove) |
| `@/lib/db` → `connectDb()` | Mongoose connection | your DB connect |
| `@/models/product`, `category`, `inventory-movement` | Mongoose models | your models |
| `effectivePrice()` from the product model | final price = sale price if the sale is active, else price | your pricing helper |

---

## 3. Step-by-step: add this module to another repo

1. **Copy the pure files first**: `lib/csv.ts`, `lib/image-url.ts`, `csv/products.ts`, (optionally `group.ts`, `variant-name.ts`, `categories.ts`) and `tests/csv.test.ts`. Add a vitest setup (`npm i -D vitest`). Make the tests pass.
2. **Edit `PRODUCT_COLUMNS` and `validateProductRows`** to match the new repo's product schema:
   - Left side = canonical column name; array = accepted aliases (`name_en: ["name","title"]`).
   - In the validator, each `doc["field.path"] = value` line maps a column to a Mongoose path. Rename these to your fields.
   - Delete rules you don't need (Arabic names, variants, attributes…).
3. **Write the DB context loader** (`productCtx` in `actions.ts`). It must return:
   - `categories`: Map(slug or name → `{id, attrKeys}`)
   - `bySku`: Map(sku → existing product summary)
   - `slugOwner`: Map(slug → sku that owns it)
   - `present`: Set of columns in the uploaded file
4. **Write the two server actions** (`previewImportAction`, `importBatchAction`). Copy `actions.ts` and swap models, the permission name and `audit`.
5. **Build the UI** (`import-wizard.tsx`): file input → `useActionState(previewImportAction)` → show counts/errors → loop over 100-row chunks calling `importBatchAction` → show results + error-report download.
6. **Add the export/template route** (`/api/admin/export?type=products|products-template`) so admins can download a sample and edit-and-reimport. Keep `toCsv`, because it prepends a BOM (Arabic/Excel need it) and neutralises formulas.
7. **Env**: set `IMAGE_HOSTS` (comma-separated hostnames allowed for remote image URLs) and optionally `IMAGE_BLOCKLIST`. Restart the dev server after changing `.env.local`.
8. **Next.js note**: this repo runs a newer Next.js than most training data. Server actions need `"use server"` at the top of the file, and the client component needs `"use client"`. Check the new repo's Next version if something differs.

---

## 4. CSV format (product columns)

Key column: **`sku`** (required on every row).

| column | rules |
|---|---|
| `sku` | letters/numbers/`. _ -`, 2–40 chars, case-insensitive. Exists → update, else create. Duplicates inside the file are rejected |
| `slug` | optional; auto-generated from `name_en`. On a name clash the SKU is appended. Changing a slug keeps the old one in `slugHistory` (redirects) |
| `name_en`, `name_ar` | required on create (≤200). If `name_ar` is missing, the English name is reused |
| `description_en/ar` | ≤5000 chars |
| `category_slug` | required on create. Accepts slug **or** English name. Unknown → auto-created as a top-level category |
| `brand` | ≤60 |
| `price` | 0–1,000,000, dot decimal, rounded to 2 places |
| `old_price` | if `old_price > price`, the file's `price` is treated as the discounted price (old → price, price → sale price) |
| `sale_price` | must be lower than `price` |
| `stock` | whole number ≥ 0. Logged to inventory history ("CSV import"). Not allowed for products that have variants |
| `stock_status` | `In Stock` / `Out of Stock` (also available/yes/true, sold out/no/false). Used when there is no numeric `stock`; In Stock → 20 units by default |
| `low_stock_threshold` | whole number ≥ 0 (default 5 on create) |
| `status` | `draft` / `published` / `archived`. New products default to `draft` |
| `featured` | true/false/1/0/yes/no |
| `tags` | `a\|b\|c` (max 20, lowercased) |
| `image_urls` | `url1\|url2` (max 10); replaces the product's images. Must be https on an allowed host or an uploaded `/uploads/<24hex>.png/jpg/webp` |
| `attributes` | `key:value\|key2:value2`; keys must exist on the category |
| `variants` | `Label~SKU~stock~price~imageUrl\|Label2~…`, only the label is required (max 30). SKU empty → `<sku>-<label>`. Product stock = sum of the variants |
| `color`, `size`, `group` | for Shopify-style files: rows with the same base name + category + brand (or the same `group`) merge into one product with a variant per row. Product SKU becomes `<first sku>-P` |

Header matching ignores case, spaces and dashes (`Stock Status` = `stock_status`). Aliases: `name`→`name_en`, `quantity/qty`→`stock`, `images/image_url`→`image_urls`, `category`→`category_slug`, `availability`→`stock_status`, etc. Unknown columns are reported and ignored. If two columns map to the same field, the first non-empty cell wins.

Minimal files that work:

```csv
sku,price,stock
EX-1001,1899,40
```
```csv
sku,name_en,name_ar,category_slug,price,stock,status,image_urls
EX-1002,Example Phone,هاتف مثال,mobiles,1999,25,published,https://cdn.example.com/a.jpg
```

Limits: **2 MB**, **5,000 rows**, UTF-8 (BOM OK). JSONL (`.jsonl/.ndjson`) is also accepted, one object per line, same field names.

---

## 5. Validation rules summary (what produces an error row)

- missing/invalid `sku`; duplicate SKU in the file
- create without `name_en`, `category_slug` or `price` (and `name_ar` unless it can fall back to English)
- text too long; invalid slug; slug already owned by another SKU or duplicated in the file
- price/sale/old price not a number, negative, or over 1,000,000; `sale_price >= price`
- `stock` not a whole number; `stock` given for a product that has variants
- invalid `status`, `featured`, `stock_status`
- more than 10 images or 30 variants; image URL not on an allowed host
- variant: no label, bad SKU, duplicate SKU, SKU equal to the product SKU, bad stock/price, price above the product price
- attribute not defined on the category, or malformed `key:value`

Each error row carries: file line number, SKU and a readable message (all listed in the preview and in the downloadable error CSV).

---

## 6. Security notes (keep these when porting)

- **CSV/formula injection**: `csvCell()` prefixes cells starting with `= + - @ TAB CR` with `'`. Use it for **all** exports.
- **Imports never evaluate anything**: the parser only produces strings.
- **Permission check in both server actions** (preview *and* import), not just on the page.
- **Server re-validation** of every batch: field names are filtered against the known column list, values are truncated to 6000 chars, and batches over 100 rows are rejected.
- **Image URL allow-list** (`IMAGE_HOSTS`): stops arbitrary external URLs from being stored.
- **Size/row caps** and a binary-file check (NUL bytes).
- **Audit log** entry per batch (who, how many created/updated/failed).

---

## 7. Gotchas learned in this repo

- Arabic/Excel: always write exports with a UTF-8 **BOM** (`toCsv` does this).
- Preview and import must apply the **same transformations** (grouping, defaults). Here grouping is done once in the preview, and the already-merged rows are sent to the import step.
- Merged rows keep the line number of their first source row, so error messages still point to a real line in the file.
- Categories: parents must be imported before their children (the wizard sorts them); only two levels are allowed (this also rules out cycles).
- Stock changes through CSV create an `InventoryMovement` so the inventory history stays correct.
- `IMAGE_HOSTS` is empty by default, so remote image URLs are **rejected until you add the host**.
- Tests: DB integration tests use separate `souq_uae_test_*` databases; pure validators need no DB.

---

## 8. Quick test checklist for the new repo

1. Download the sample template, import it → 1 product is created as `draft`.
2. Re-upload the same file → the action becomes `update`.
3. Upload `sku,price` only → only the price changes.
4. Upload a file with a bad price and an unknown column → the error row appears in the preview, the unknown column is flagged, and the good rows still import.
5. Upload a 6,000-row file → rejected with "Too many rows".
6. Export all products and re-import them → no unexpected changes.
