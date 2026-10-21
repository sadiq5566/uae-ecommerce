# Commands cheat sheet

Run everything from the project folder: `C:\Users\butts\projects\uae-ecommerce`.
All DB commands read `MONGODB_URI` / `MONGODB_DB` from `.env.local` (local: `mongodb://127.0.0.1:27017`, db `souq_uae_dev`).

## Run the app
| Command | What it does |
|---|---|
| `npm install` | install dependencies (first time / after pulling) |
| `npm run dev` | dev server at http://localhost:3000 (admin: `/admin`). **Restart after changing `.env.local`** (e.g. `IMAGE_HOSTS`) |
| `npm run build` then `npm run start` | production build / serve it |

## Checks
| Command | What it does |
|---|---|
| `npm run typecheck` | TypeScript check (`tsc --noEmit`) |
| `npm run lint` | ESLint |
| `npm run test` | all tests (DB tests use separate `souq_uae_test_*` databases; skipped if MongoDB is down) |
| `npx vitest run tests/csv.test.ts` | one test file |
| `npm run format` | Prettier |

## Database scripts
| Command | What it does |
|---|---|
| `npm run seed` | add demo categories, products, articles, coupons, demo logins (dev DB only) |
| `npm run seed -- --reset` | wipe catalogue collections first, then seed |
| `npm run db:indexes` | create/verify all indexes (run on every deploy) |
| `npm run db:indexes -- --sync` | also DROP indexes that are no longer in the schema |
| `npm run db:migrate` | run pending forward-only migrations in `scripts/migrations/` |
  
Demo logins after seeding (development only): `owner@example.test`, `catalog@example.test`, `ops@example.test`, `content@example.test`, `customer@example.test` — password `Demo-Pass-2026!`.

## Product images
| Command | What it does |
|---|---|
| `npm run clean-images` | DRY RUN: shows which remote product images would have the corner "AMARA WATCHES" logo removed |
| `npm run clean-images -- --apply` | do it: saves cleaned copies to `public/uploads/` and updates products. Original→new URL map goes to `scripts/clean-images.map.json` (for rollback) |

Only plain/uniform backgrounds are cleaned; others are listed as "skipped". Run it again after each CSV import that brings remote images. `public/uploads` is dev-only storage (git-ignored).

## Bulk import / export (admin UI, not a command)
- `/admin/import` → upload `.csv` / `.jsonl` / `.ndjson` (max 2 MB, 5,000 rows) → **1 · Upload & preview** → **2 · Import**.
- Sample template and export: buttons on the same page. Column rules: `docs/csv-import.md`.
- Scraper format: columns `sku, name_en, brand, category_slug, description_en, color, size, price, old_price, image_urls`.
  Rows with the same `group` (or same name) and a `color`/`size` merge into one product with options. New products start as `draft` — publish them in the admin.
- Remote image hosts must be listed in `.env.local`: `IMAGE_HOSTS=amaraswatches.shop,cdn.shopify.com` (restart `npm run dev` after editing).

## Local MongoDB
| Command | What it does |
|---|---|
| `sc query MongoDB` | is the Windows service running? |
| `net start MongoDB` / `net stop MongoDB` | start / stop it (run PowerShell as Administrator) |
| `netstat -ano \| findstr 27017` | is it listening on port 27017? |

Browse data with MongoDB Compass: connect to `mongodb://127.0.0.1:27017`, open database `souq_uae_dev`.

## Scraper (separate folder: `C:\Users\butts\projects\scrapper`)
Format spec: `C:\Users\butts\projects\scrapper\CSV_FORMAT.md`. Run it with its config so the output has the 10 columns above:
`python scraper.py ... --config mysite.json` (see that folder's own docs for the remaining arguments).

## Git
| Command | What it does |
|---|---|
| `git status` / `git diff` | what changed |
| `git add -A` then `git commit -m "message"` | commit |

## Remove unwanted images (e.g. stray screenshots)
| Command | What it does |
|---|---|
| `npm run remove-images` | DRY RUN: counts images whose URL contains a word from `IMAGE_BLOCKLIST` (`.env.local`, currently `Screenshot_`) |
| `npm run remove-images -- --apply` | removes them from all products (gallery + option pictures); removed URLs saved in `scripts/remove-images.backup.json` |
| `npm run remove-images -- word1,word2 --apply` | same, with explicit words |

CSV/JSONL imports also skip any image URL containing an `IMAGE_BLOCKLIST` word, so they don't come back. Restart `npm run dev` after editing `.env.local`.
