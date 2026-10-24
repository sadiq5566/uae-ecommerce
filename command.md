# Rayana Collection — commands

Site: https://rayanacollection.store · Server folder: `/var/www/rayanacollection` · pm2 name: `rayanacollection` · port: `3002`
Shared images folder: `/var/www/shared-uploads`

> Passwords and keys live only in `.env` / `.env.local`. Never paste them into chats, commits or this file.

---

## 1. On your PC (Windows PowerShell)

```
cd C:\Users\butts\projects\uae-ecommerce
npm run dev            # dev server, http://localhost:3000   (only for local work, never on the server)
npm run typecheck      # TypeScript check, must print nothing
npm run build          # production build
```

PowerShell eats `--` flags in `npm run`. If a script says "Usage: --from=... " or ignores a flag, run it with `npx tsx` directly (see section 5).

---

## 2. Deploy on the server (production)

Always production mode: `build` + `start`. Never `npm run dev` on the server (it is slow, compiles on every request and causes 502/504).

```
cd /var/www/rayanacollection
git pull
npm ci
npm run build 2>&1 | tee build.log
pm2 restart rayanacollection --update-env
pm2 logs rayanacollection --lines 20 --nostream
curl -I http://localhost:3002/en          # must be HTTP 200
```

First time, or if the process was started wrongly (dev mode, wrong port, old env):

```
pm2 delete rayanacollection
npm run build
PORT=3002 pm2 start npm --name rayanacollection -- start
pm2 save
```

Upgrade Next.js security patch (same major version, no breaking changes):

```
npm install next@16.4.3
npm run build
```

---

## 3. Shared uploads folder (`public/uploads` -> `/var/www/shared-uploads`)

The app saves and serves images from `public/uploads`. On the server that folder must be a **symlink** to `/var/www/shared-uploads`, so images survive every deploy.

Check what it is now:

```
cd /var/www/rayanacollection
ls -ld public/uploads            # "lrwxrwxrwx ... -> /var/www/shared-uploads" = correct link
ls -la public/uploads            # a real folder ("drwx...") that contains "shared-uploads" means the link was made INSIDE it (wrong)
findmnt public/uploads           # prints something only if it is a bind mount
```

**Fix when it is a normal folder (or has a wrong link inside it):**

```
cd /var/www/rayanacollection
[ -L public/uploads/shared-uploads ] && rm public/uploads/shared-uploads     # removes only the wrong link inside, never the files
rmdir public/uploads                                                         # only works if the folder is empty (safe)
ln -s /var/www/shared-uploads public/uploads
ls -ld public/uploads                                                        # must show:  public/uploads -> /var/www/shared-uploads
ls public/uploads | head -3                                                  # must list the .webp files
```

`rmdir` refuses to delete a folder that still has files in it. If it refuses, STOP and look at `ls -la public/uploads` before doing anything else.

**Disconnect the link (for example before a build), then connect again after:**

```
unlink public/uploads                                       # works on a symlink only; the images stay in /var/www/shared-uploads
npm run build
ln -s /var/www/shared-uploads public/uploads
```

Rules that keep your images safe:
- Never write a trailing slash: `rm -rf public/uploads/` follows the link and deletes the shared files.
- `unlink` on "Is a directory" means it is not a symlink (see the check above); do not force it.
- If it is a bind mount (`findmnt` prints a line): `umount public/uploads` to disconnect, `mount --bind /var/www/shared-uploads public/uploads` to connect. Never `rm` a mounted folder.
- After every `git pull` / build, run `ls -ld public/uploads` and confirm the link is still there.
- Images are served at `/uploads/<24 hex chars>.png|jpg|webp`.

Permissions if uploads fail:

```
chown -R root:root /var/www/shared-uploads      # use the user pm2 runs as
chmod -R u+rwX,go+rX /var/www/shared-uploads
```

---

## 4. Environment variables (`.env`) and the 502 / "Invalid environment configuration" error

502 Bad Gateway = nginx cannot reach the app = the app is not running on port 3002. Find out why:

```
pm2 status
pm2 logs rayanacollection --lines 30 --nostream
curl -I http://localhost:3002/en
ss -ltnp | grep node                         # which port each node process listens on
grep -rn "proxy_pass" /etc/nginx/sites-enabled/ /etc/nginx/conf.d/    # nginx must point to the same port
```

Payment error `STRIPE_SECRET_KEY: required when PAYMENT_PROVIDER=stripe`:

```
cd /var/www/rayanacollection
grep -n "PAYMENT_PROVIDER\|STRIPE" .env .env.local .env.production .env.production.local 2>/dev/null
echo "shell: [$PAYMENT_PROVIDER]"
pm2 env $(pm2 id rayanacollection | tr -d '[] ') | grep -i "PAYMENT\|STRIPE"
```

- Cash on delivery only: set `PAYMENT_PROVIDER=` (empty). Do not use `mock` in production, the app refuses it.
- Card payments: set `PAYMENT_PROVIDER=stripe` and fill `STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`. Webhook URL: `https://rayanacollection.store/api/webhooks/payments`.
- Files override each other: shell/pm2 env > `.env.production.local` > `.env.local` > `.env.production` > `.env`. Editing only `.env` is not enough if a higher file sets the value.
- If the value comes from pm2's saved environment, recreate the process (section 2, "First time").
- Clear old log lines before re-checking: `pm2 flush rayanacollection`.

Database variables: `MONGODB_URI=mongodb+srv://USER:PASSWORD@cluster0.kv4iqjx.mongodb.net/rayanacollection` and `MONGODB_DB=rayanacollection`. Atlas must allow the server's IP (Network Access).

---

## 5. Copy a database (cartsheaven -> rayanacollection)

Source is only read. The target collections are dropped and re-created with `--replace`. This cannot be undone: take an Atlas snapshot first if the target holds anything you need.

Dry run (shows counts, writes nothing):

```
npx tsx --env-file=.env.local scripts/copy-db.ts --from=cartsheaven --to=rayanacollection
```

Copy and replace:

```
npx tsx --env-file=.env.local scripts/copy-db.ts --from=cartsheaven --to=rayanacollection --apply --replace
```

Copy only some collections:

```
npx tsx --env-file=.env.local scripts/copy-db.ts --from=cartsheaven --to=rayanacollection --apply --replace --collections=products,collections,imagedocs
```

Without `--replace` it refuses to touch a collection that already has documents. (`npm run copy-db -- --from=...` also works in Git Bash / Linux, but not reliably in PowerShell.)

---

## 6. Content scripts (journal articles and store pages)

Both are a dry run unless you add `--apply`. They write into the database in `MONGODB_DB`, so run them where the right `.env.local` is.

```
npm run seed-journal                  # dry run: 4 original journal articles, covers = real product photos
npm run seed-journal -- --apply       # write them; old smartphone / kitchen / deals articles become drafts

npm run seed-pages                    # dry run: About, Contact, FAQ, Delivery, Returns
npm run seed-pages -- --apply         # write them (published)
```

If PowerShell drops `-- --apply`, use: `npx tsx --env-file=.env.local scripts/seed-journal.ts --apply` (same for `seed-pages.ts`).

- Pages and articles are edited later in Admin -> Pages / Articles (an article can be written in one language only).
- The page texts contain fees and limits (delivery AED 15/20/25, free over AED 200 / AED 300 north, minimum AED 50, COD up to AED 3,000, 7-day returns, 90-day store credit, WhatsApp +971 58 985 7250). If you change these in Admin -> Settings or Delivery, update the pages too.
- Privacy, Terms and Help pages are not generated: write them yourself in Admin -> Pages.
- Homepage content is cached for 60 seconds.

---

## 7. Database maintenance

```
npm run db:indexes                    # create / verify indexes (run on every deploy)
npm run db:indexes -- --sync          # also drop indexes that are no longer in the schema
npm run db:migrate                    # forward-only migrations
npm run clean-images                  # dry run: watermark removal on remote product photos
npm run clean-images -- --apply       # re-host cleaned images (keeps your own storage, not other shops' links)
```

---

## 8. Git

```
git status
git diff
git add -A
git commit -m "message"
git push
```

Check `git status` before deploying: uncommitted files (for example `lib/`) are missing on the server, which causes build errors such as "Cannot find module '../lib/models/ImageDoc'".

---

## 9. Quick checklist after a deploy

1. `curl -I http://localhost:3002/en` returns 200
2. `pm2 logs rayanacollection --lines 20 --nostream` shows `Ready` and no `Invalid environment configuration`
3. `ls -ld public/uploads` shows the link to `/var/www/shared-uploads`
4. https://rayanacollection.store/en and /ar load, product images show
5. Change any password that was ever pasted into a chat (Atlas database user, admin accounts)
