#!/usr/bin/env python3
"""
Remove the wrongly-added stock handbag photos from product galleries in MongoDB.

How it finds them (same rule used on rayanacollection.store):
  an image is "filler" if, within one collection, it
    - is NEVER the main (first) image of any product,
    - is used by at least --min-products products (default 20), and
    - appears in at least --min-categories different categories (default 3).
Only filler images are removed, and only from position 2 onward, so every
product keeps its main image and its own photos.

Usage (run on your own computer):
    pip install pymongo dnspython
    export MONGODB_URI='mongodb+srv://USER:PASSWORD@cluster0.xxxx.mongodb.net/oasishomemarket'

    python fix_bag_photos.py                     # DRY RUN: only reports, changes nothing
    python fix_bag_photos.py --apply             # makes a backup, then updates

Options:
    --db NAME            database name (default: taken from the URI)
    --collections a,b    only these collections (default: every collection that looks like products)
    --min-products N     default 20
    --min-categories N   default 3
"""
import argparse, json, os, sys, time
from collections import defaultdict
from pymongo import MongoClient, UpdateOne


def image_url(img):
    if isinstance(img, str):
        return img
    if isinstance(img, dict):
        return img.get("url") or img.get("src") or ""
    return ""


def looks_like_products(coll):
    d = coll.find_one({"images": {"$type": "array", "$ne": []}})
    return bool(d) and isinstance(d.get("images"), list)


def find_filler(coll, min_products, min_cats):
    uses = defaultdict(lambda: {"n": 0, "cats": set(), "primary": 0})
    for d in coll.find({}, {"images": 1, "category": 1}):
        imgs = d.get("images") or []
        cat = d.get("category") or ""
        for i, im in enumerate(imgs):
            u = image_url(im)
            if not u:
                continue
            e = uses[u]
            e["n"] += 1
            e["cats"].add(cat)
            if i == 0:
                e["primary"] += 1
    return {u for u, e in uses.items()
            if e["primary"] == 0 and e["n"] >= min_products and len(e["cats"]) >= min_cats}


def load_env_file():
    """Fill missing env vars from .env.local / .env (project root, or current dir)."""
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    for base in (os.getcwd(), root):
        for name in (".env.local", ".env"):
            p = os.path.join(base, name)
            if not os.path.isfile(p):
                continue
            for line in open(p, encoding="utf-8"):
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                k = k.strip().removeprefix("export ").strip()
                os.environ.setdefault(k, v.strip().strip("\"'"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--db")
    ap.add_argument("--collections")
    ap.add_argument("--min-products", type=int, default=20)
    ap.add_argument("--min-categories", type=int, default=3)
    a = ap.parse_args()

    load_env_file()
    uri = os.environ.get("MONGODB_URI")
    if not uri:
        sys.exit("Set MONGODB_URI first (see top of file).")
    client = MongoClient(uri, serverSelectionTimeoutMS=20000)
    dbname = a.db or os.environ.get("MONGODB_DB")
    db = client[dbname] if dbname else client.get_default_database()
    names = a.collections.split(",") if a.collections else db.list_collection_names()
    print(f"Database: {db.name}   mode: {'APPLY' if a.apply else 'DRY RUN (no changes)'}\n")

    stamp = time.strftime("%Y%m%d-%H%M%S")
    total_changed = 0
    for name in names:
        coll = db[name]
        if not looks_like_products(coll):
            continue
        filler = find_filler(coll, a.min_products, a.min_categories)
        if not filler:
            print(f"[{name}] no filler images found")
            continue

        ops, backup, per_cat = [], [], defaultdict(int)
        for d in coll.find({"images.0": {"$exists": True}}):
            imgs = d["images"]
            keep = [im for i, im in enumerate(imgs) if i == 0 or image_url(im) not in filler]
            if len(keep) != len(imgs):
                backup.append({"_id": str(d["_id"]), "images": json.loads(json.dumps(imgs, default=str))})
                per_cat[d.get("category", "?")] += 1
                ops.append(UpdateOne({"_id": d["_id"]}, {"$set": {"images": keep}}))

        print(f"[{name}] filler images: {len(filler)}   products to fix: {len(ops)}   by category: {dict(per_cat)}")
        if a.apply and ops:
            fn = f"backup_{db.name}_{name}_{stamp}.json"
            with open(fn, "w", encoding="utf-8") as f:
                json.dump(backup, f, ensure_ascii=False)
            print(f"   backup written: {fn}")
            res = coll.bulk_write(ops, ordered=False)
            print(f"   updated: {res.modified_count}")
            total_changed += res.modified_count

    if not a.apply:
        print("\nDry run only. Check the numbers above, then run again with --apply.")
    else:
        print(f"\nDone. Total products updated: {total_changed}")
        print("To undo: re-set each product's 'images' from the backup_*.json file.")


if __name__ == "__main__":
    main()
