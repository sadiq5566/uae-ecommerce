"""Generic watermark remover: finds faint/solid marks (text or logo) ANYWHERE on a plain background - any corner, any edge, the middle,
several marks per picture, any wording - and paints them out. No template and no fixed position: the mark is found because it
differs from the smooth background around it, so it does not matter what it says.

How:  1. a big median blur gives the "mark-free" background (strokes thinner than the kernel vanish)
      2. pixels that differ from it = candidate ink; only counted where the background is flat (not on product edges / texture)
      3. ink that is close together is grouped into marks; groups that are too big to be a watermark are left alone
      4. every mark is inpainted from the surrounding background

  python -I scripts/remove-watermark.py --stdio                 image bytes on stdin -> cleaned .webp on stdout
        exit 0 = cleaned, 3 = no watermark found (nothing written), 4 = skipped (reason on stderr), 2 = unreadable
  python -I scripts/remove-watermark.py <in_dir_or_file> <out_dir> [--debug]   --debug also writes <name>.mask.png

Tuning (env vars, all optional): WM_TOLERANCE (min ink contrast, default auto), WM_MAX_W / WM_MAX_H (largest mark, fraction of image),
WM_MAX_AREA (most that may be painted, fraction of image), WM_PAD (extra px painted around a mark).
"""
import os, sys
import cv2
import numpy as np

env = lambda k, d: float(os.environ[k]) if os.environ.get(k) else d
MAX_W = env("WM_MAX_W", 0.5)          # a mark wider than this (fraction of the image) is a product/scene, not a watermark
MAX_H = env("WM_MAX_H", 0.2)
MAX_AREA = env("WM_MAX_AREA", 0.08)   # never paint more than this share of the picture
MIN_TOL = env("WM_TOLERANCE", 0)      # 0 = derive from the picture's own noise
PAD = env("WM_PAD", 0)                # 0 = derive from image size
WORK = 1000                           # detection runs on a copy at most this many px on the long side
MIN_INK = 60                          # ink pixels (at WORK scale) a group needs to count as a mark


def decode(data):
    img = cv2.imdecode(data, cv2.IMREAD_UNCHANGED)
    if img is None:
        return None
    if img.dtype != np.uint8:
        img = cv2.convertScaleAbs(img, alpha=255.0 / (65535.0 if img.dtype == np.uint16 else 1.0))
    if img.ndim == 2:
        img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
    elif img.shape[2] == 4:
        if img[..., 3].min() == 255:
            img = img[..., :3]
        else:  # transparent pictures: flatten on white, detection needs a solid background
            a = img[..., 3:4].astype(np.float32) / 255.0
            img = (img[..., :3] * a + 255 * (1 - a)).astype(np.uint8)
    return img


def detect(img):
    """Returns (mask at full resolution or None, status, reason). status: 'cleaned' | 'no-logo' | 'skipped'."""
    H, W = img.shape[:2]
    s = min(1.0, WORK / max(H, W))
    small = cv2.resize(img, (round(W * s), round(H * s)), interpolation=cv2.INTER_AREA) if s < 1 else img
    h, w = small.shape[:2]
    k = max(9, int(0.04 * max(h, w)) // 2 * 2 + 1)

    bg = cv2.medianBlur(small, k)
    resid = np.abs(small.astype(np.int16) - bg.astype(np.int16)).max(axis=2).astype(np.float32)

    # flat background = smooth, no steep steps (product outline) nearby
    g = cv2.GaussianBlur(cv2.cvtColor(bg, cv2.COLOR_BGR2GRAY).astype(np.float32), (0, 0), 2)
    grad = np.hypot(cv2.Sobel(g, cv2.CV_32F, 1, 0), cv2.Sobel(g, cv2.CV_32F, 0, 1)) / 8.0
    steep = (grad > 3.0).astype(np.uint8)
    flat = cv2.dilate(steep, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))) == 0
    if flat.mean() < 0.05:
        return None, "skipped", "no flat background to compare against"

    tol = MIN_TOL or max(3.0, 5.0 * float(np.median(resid[flat])) + 2.0)
    ink = ((resid > tol) & flat).astype(np.uint8)

    # a flat region that is mostly "ink" is texture (fabric, leather, a product close-up) not background -> never touch it
    # and only flat regions that reach the picture's edge are background; a smooth patch inside the product (strap, dial) is not
    n, lab, stats, _ = cv2.connectedComponentsWithStats(flat.astype(np.uint8), connectivity=4)
    edge_flat = np.zeros((h, w), bool)
    for i in range(1, n):
        x, y, bw, bh, area = stats[i]
        on_edge = x == 0 or y == 0 or x + bw >= w or y + bh >= h
        if not on_edge or (area > 400 and ink[lab == i].mean() > 0.12):
            ink[lab == i] = 0
        else:
            edge_flat |= lab == i
    # the picture's background colour(s): the colours that cover a real share of that edge-connected flat area
    q = (bg[edge_flat] // 16).astype(np.int32)
    codes, counts = np.unique(q[:, 0] * 256 + q[:, 1] * 16 + q[:, 2], return_counts=True) if len(q) else ([], [])
    bg_cols = [np.array([c // 256, (c // 16) % 16, c % 16]) * 16 + 8 for c, n_ in zip(codes, counts) if n_ >= 0.1 * len(q)]
    if int(ink.sum()) < MIN_INK:
        return None, "no-logo", ""

    # join letters of one mark into a single blob, then judge each blob
    j = max(3, int(0.012 * max(h, w))) | 1
    joined = cv2.morphologyEx(ink, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (j * 2 + 1, j)))
    n, lab, stats, _ = cv2.connectedComponentsWithStats(joined, connectivity=8)
    keep = np.zeros((h, w), np.uint8)
    too_big = False
    for i in range(1, n):
        x, y, bw, bh, _a = stats[i]
        blob = (lab == i)
        if int((blob & (ink > 0)).sum()) < MIN_INK:
            continue
        # a mark sits on the background; ink whose surroundings are another colour (strap, dial, shadow) belongs to the product
        here = np.median(bg[blob & (ink > 0)], axis=0)
        if not any(np.abs(here - c).max() <= 28 for c in bg_cols):
            continue
        if bw > w * MAX_W or bh > h * MAX_H:
            too_big = True
            continue
        keep[blob & (ink > 0)] = 1
    if not keep.any():
        return None, ("skipped" if too_big else "no-logo"), ("marked area is too large to be just a watermark" if too_big else "")

    pad = int(PAD or max(3, 0.006 * max(h, w)))
    keep = cv2.dilate(keep, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * pad + 1, 2 * pad + 1)))
    if keep.mean() > MAX_AREA:
        return None, "skipped", "too much of the picture would be painted - not a plain background"
    mask = cv2.resize(keep, (W, H), interpolation=cv2.INTER_NEAREST) if s < 1 else keep
    return mask, "cleaned", ""


def clean(img):
    """img: BGR uint8. Returns (cleaned image or None, status, reason, mask or None)."""
    mask, status, why = detect(img)
    if status != "cleaned":
        return None, status, why, None
    r = max(3, round(0.004 * max(img.shape[:2])))
    return cv2.inpaint(img, mask, r, cv2.INPAINT_TELEA), "cleaned", "", mask


def main():
    if "--stdio" in sys.argv:  # used by lib/watermark-remove.ts: image bytes on stdin -> cleaned .webp bytes on stdout
        img = decode(np.frombuffer(sys.stdin.buffer.read(), np.uint8))
        if img is None:
            sys.exit(2)
        out, status, why, _ = clean(img)
        if status == "no-logo":
            sys.exit(3)
        if status == "skipped":
            sys.stderr.write(why)
            sys.exit(4)
        ok, buf = cv2.imencode(".webp", out, [cv2.IMWRITE_WEBP_QUALITY, 92])
        sys.stdout.buffer.write(buf.tobytes())
        return
    src, dst = sys.argv[1], sys.argv[2]
    debug = "--debug" in sys.argv
    files = [src] if os.path.isfile(src) else [os.path.join(src, n) for n in sorted(os.listdir(src)) if n.lower().endswith((".webp", ".jpg", ".jpeg", ".png"))]
    os.makedirs(dst, exist_ok=True)
    tally = {"cleaned": 0, "no-logo": 0, "skipped": 0, "unreadable": 0}
    for f in files:
        img = decode(np.fromfile(f, np.uint8))
        if img is None:
            tally["unreadable"] += 1
            print("unreadable:", f)
            continue
        out, status, why, mask = clean(img)
        tally[status] += 1
        name = os.path.splitext(os.path.basename(f))[0]
        if status == "skipped":
            print(f"skipped: {f} - {why}")
        if out is not None:
            cv2.imencode(".webp", out, [cv2.IMWRITE_WEBP_QUALITY, 92])[1].tofile(os.path.join(dst, name + ".webp"))
            if debug:
                cv2.imencode(".png", mask * 255)[1].tofile(os.path.join(dst, name + ".mask.png"))
    print(f"done: {len(files)} file(s) - {tally}")


if __name__ == "__main__":
    main()
