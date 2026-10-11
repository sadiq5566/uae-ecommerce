# CSV import & export

Admin → **CSV import/export** (permission: `products:write` for products, `categories:write` for categories).

Flow: **upload → preview (nothing written) → confirm**. The whole file is validated first; rows with errors are never imported, never silently skipped — they are listed with line numbers and can be downloaded as an error CSV. Valid rows are imported in batches of 100 with a progress bar; every batch is validated again on the server. Limits: 2 MB, 5,000 rows. UTF-8 (a BOM is fine, Arabic is supported). Download the sample template from the same page.

**Safety:** files are parsed as plain text and nothing is evaluated. Exports prefix cells that start with `= + - @` (or tab/CR) with `'` so spreadsheets can't run them as formulas. Image URLs must be `https` on a host listed in `IMAGE_HOSTS` or an uploaded `/uploads/…` file.

## Products (key: `sku`)
| column | notes |
|---|---|
| `sku` | **required**, letters/numbers `. _ -`, 2–40, case-insensitive; matches an existing product → update, else create |
| `slug` | optional on create (generated from `name_en`), lowercase letters/numbers/hyphens, must be unique; changing it keeps the old URL as a redirect |
| `name_en`, `name_ar` | required to create (≤200) |
| `description_en`, `description_ar` | ≤5000 |
| `category_slug` | required to create; must exist |
| `brand` | ≤60 |
| `price`, `sale_price` | numbers ≥ 0 (dot decimal); `sale_price` < `price` |
| `stock` | whole number ≥ 0; logged in the inventory history (`CSV import`). Not allowed for products with variants |
| `low_stock_threshold` | whole number ≥ 0 |
| `status` | `draft` / `published` / `archived`; **new products default to `draft`** |
| `featured` | `true/false/1/0/yes/no` |
| `tags` | `tag1\|tag2` (max 20) |
| `image_urls` | `url1\|url2` (max 10) — replaces the product's images |
| `attributes` | `key:value\|key2:value2` — keys must be defined on the product's category |

Header names are case-insensitive; common aliases work (`name`→`name_en`, `quantity`→`stock`, `images`→`image_urls`…). Unknown columns are reported and ignored. **Only the columns present in your file are written, and an empty cell leaves the existing value unchanged** — so a file with just `sku,price` updates prices only. Variants, specifications and per-variant stock are edited in the admin, not via CSV.

## Categories (key: `slug`)
`slug` (required), `parent_slug` (must be a top-level category; two levels only), `name_en`, `name_ar` (required to create), `description_en`, `description_ar`, `icon`, `order` (0–10000), `active`, `attributes` (`key:English label/Arabic label|key2:…`). Parents may appear in the same file; the importer processes parents first.

## Examples
```csv
sku,slug,name_en,name_ar,category_slug,price,sale_price,stock,status,tags,image_urls,attributes
EX-1001,example-phone,Example Phone,هاتف مثال,mobiles,1999,1799,25,published,new|5g,https://cdn.example.com/a.jpg,storage:256GB
```
Update only prices and stock:
```csv
sku,price,stock
EX-1001,1899,40
```
```csv
slug,parent_slug,name_en,name_ar,attributes
smartwatches,electronics,Smartwatches,ساعات ذكية,color:Colour/اللون|size:Size/المقاس
```
