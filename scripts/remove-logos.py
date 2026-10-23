"""Removes the four known store logos by template, on ANY background (plain white or a photo):

  rimal  "RIMAL collection"   bottom-left   (rimal.club)
  amara  "AMARA"              bottom-right  (amaraswatches.shop)
  lune   "LUNE MAISON DUBAI"  bottom-right  (lunecollection.shop)
  wg     "WG" monogram        top-right     (wristgallerydubai.shop)

Each logo is the same artwork at the same place on every picture, scaling with the picture's WIDTH (geometry in scripts/logo-templates/geometry.json
measured on a 1000 px wide picture, the artwork itself in scripts/logo-templates/<name>.png; rimal keeps scripts/rimal-template.*).
So nothing is guessed: the letter shapes are placed at the known spot and filled in from the pixels around them (inpainting).

A picture is only touched when a logo is really there: the logo's letter shapes must correlate with the picture's fine detail at the expected spot
consistently on one side, which random photo content does not do. A small position search absorbs rounding differences.

  python -I scripts/remove-logos.py --stdio                    image bytes on stdin -> cleaned .webp on stdout (exit 3 = no logo, 2 = unreadable)
  python -I scripts/remove-logos.py --score <file> [...]       prints each logo's detection score per file (for tuning)
  python -I scripts/remove-logos.py <in_dir_or_file> <out_dir> cleans files (only those that carry a logo are written)
"""
import json, os, sys
import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
MIN_NCC = float(os.environ.get("LOGO_MIN_NCC", 0.2))           # correlation between the logo artwork and the picture's fine detail (0.2 = faint logo on a photo; absent logos stay below 0.15)
MAX_SHIFT = float(os.environ.get("LOGO_MAX_SHIFT", 8))         # how far (px on a 1000 px wide picture) the logo may sit from its expected spot
MASK_LEVEL = 0.12                                              # template pixels above this share of full strength count as letter


def _logos():
    geo = json.load(open(os.path.join(HERE, "logo-templates", "geometry.json")))
    out = {}
    for name, g in geo.items():
        out[name] = dict(g, strength=g["peak"], tpl=cv2.imread(os.path.join(HERE, "logo-templates", name + ".png"), cv2.IMREAD_GRAYSCALE))
    r = json.load(open(os.path.join(HERE, "rimal-template.json")))  # 1000 x 1000 reference picture
    out["rimal"] = dict(anchor="bl", width=r["width"], height=r["height"], margin_x=r["left"], margin_y=r["src_height"] - (r["top"] + r["height"]), strength=80,
                        tpl=cv2.imread(os.path.join(HERE, "rimal-template.png"), cv2.IMREAD_GRAYSCALE), rimal=True)
    return out


LOGOS = _logos()


def decode(data):
    img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_UNCHANGED)
    if img is None:
        return None
    if img.dtype != np.uint8:
        img = cv2.convertScaleAbs(img, alpha=255.0 / (65535.0 if img.dtype == np.uint16 else 1.0))
    if img.ndim == 2:
        return cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
    if img.shape[2] == 4:  # transparent PNG: the shop shows it on white
        a = img[..., 3:4].astype(np.float32) / 255.0
        return (img[..., :3].astype(np.float32) * a + 255.0 * (1 - a)).astype(np.uint8)
    return img


def place(logo, w, h, dx=0, dy=0):
    """(letter mask 0/255 of the logo's own box, left, top, scale), or None when the picture is too small for the logo / the box leaves the picture."""
    s = w / 1000.0
    tw, th = max(1, round(logo["width"] * s)), max(1, round(logo["height"] * s))
    left = (w - round(logo["margin_x"] * s) - tw) if logo["anchor"][1] == "r" else round(logo["margin_x"] * s)
    top = (h - round(logo["margin_y"] * s) - th) if logo["anchor"][0] == "b" else round(logo["margin_y"] * s)
    left, top = left + dx, top + dy
    if tw < 24 or top < 0 or left < 0 or left + tw > w or top + th > h:
        return None
    m = cv2.resize(logo["tpl"], (tw, th), interpolation=cv2.INTER_AREA)
    return (m > MASK_LEVEL * 255).astype(np.uint8) * 255, left, top, s


def find(img, logo, g=None):
    """(ncc, box, scale): how well the logo's artwork correlates with the picture's fine detail around where it should be, and the box
    of the best position. The picture is high-passed first so the background (plain, gradient or photo) drops out and only strokes remain;
    on a real logo the correlation is 0.3 - 0.95 right at the expected spot, anywhere else it stays below ~0.15."""
    h, w = img.shape[:2]
    box = place(logo, w, h)
    if box is None:
        return 0.0, None, 1.0
    m, left, top, s = box
    th, tw = m.shape
    if g is None:
        g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32)
    sigma = max(1.5, 3 * s)
    hp = lambda a: a - cv2.GaussianBlur(a, (0, 0), sigma)
    r = int(round(MAX_SHIFT * s)) + 2
    y0, x0 = max(0, top - r), max(0, left - r)
    y1, x1 = min(h, top + th + r), min(w, left + tw + r)
    tpl = hp(cv2.resize(logo["tpl"], (tw, th), interpolation=cv2.INTER_AREA).astype(np.float32))
    pad = int(sigma * 3) + 1  # blur needs context around the window
    cy0, cx0 = max(0, y0 - pad), max(0, x0 - pad)
    win = hp(g[cy0:y1 + pad, cx0:x1 + pad])[y0 - cy0:y1 - cy0, x0 - cx0:x1 - cx0]
    if win.shape[0] < th or win.shape[1] < tw or win.std() < 1e-3:
        return 0.0, None, s
    res = cv2.matchTemplate(win, tpl, cv2.TM_CCOEFF_NORMED)
    iy, ix = np.unravel_index(np.abs(res).argmax(), res.shape)
    box = place(logo, w, h, x0 + ix - left, y0 + iy - top)
    return (abs(float(res[iy, ix])), box, s) if box is not None else (0.0, None, s)


def detect(img):
    """[(name, box, scale)] for every logo that is really on the picture."""
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32)
    found = []
    for name, logo in LOGOS.items():
        score, box, s = find(img, logo, g)
        if box is not None and score >= MIN_NCC:
            found.append((name, box, s))
    return found


def _fill_flat(crop, mask, tol):
    """On a plain background the logo is replaced by the background colour itself (exact, no smear from the product next to it).
    Returns the filled crop, or None when the surroundings are not plain. Pixels that differ from the background by more than the logo
    ever does (product / shadow) are left alone, and when there are more than a few of them the caller inpaints instead."""
    k = 9
    near = cv2.dilate(mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
    far = cv2.dilate(mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k * 3, k * 3)))
    ring = (far > 0) & (near == 0)
    if ring.sum() < 60:
        return None
    vals = crop[ring].astype(np.float32)
    med = np.median(vals, axis=0)
    if (np.abs(vals - med).max(axis=1) <= 6).mean() < 0.6:
        return None
    off = np.abs(crop.astype(np.float32) - med).max(axis=2)
    paint = (near > 0) & (off <= tol)
    if (near > 0).sum() and ((near > 0) & ~paint).sum() > 0.03 * (near > 0).sum():
        return None  # the product itself runs under the logo: painting a flat colour would erase part of it
    out = crop.copy()
    out[paint] = np.round(med).astype(np.uint8)
    return out


def clean(img, found=None):
    """Returns the picture with every detected logo painted out (a copy of img when none was found)."""
    found = detect(img) if found is None else found
    res = img.copy()
    for name, (m, left, top, _), s in found:
        grow = max(2, int(round(2.4 * s)))
        pad = int(round(12 * s)) + grow + 4
        y0, x0 = max(0, top - pad), max(0, left - pad)
        y1, x1 = min(img.shape[0], top + m.shape[0] + pad), min(img.shape[1], left + m.shape[1] + pad)
        # work on a crop around the logo: fast even on 3000 px pictures, and nothing else in the picture can change
        mask = np.zeros((y1 - y0, x1 - x0), np.uint8)
        mask[top - y0:top - y0 + m.shape[0], left - x0:left - x0 + m.shape[1]] = m
        mask = cv2.dilate(mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (grow * 2 + 1, grow * 2 + 1)))
        crop = res[y0:y1, x0:x1].copy()
        flat = _fill_flat(crop, mask, LOGOS[name]["strength"] * 1.3 + 8)
        res[y0:y1, x0:x1] = flat if flat is not None else cv2.inpaint(crop, mask, max(3, int(round(3 * s))), cv2.INPAINT_TELEA)
    return res


def main():
    if "--score" in sys.argv:
        for p in sys.argv[sys.argv.index("--score") + 1:]:
            img = decode(open(p, "rb").read())
            g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32) if img is not None else None
            cells = []
            for name, logo in LOGOS.items():
                score = find(img, logo, g)[0] if img is not None else 0.0
                cells.append(f"{name}:{score:5.2f}{'*' if score >= MIN_NCC else ' '}")
            print("  ".join(cells), " ", os.path.basename(p))
        return 0
    if "--stdio" in sys.argv:
        img = decode(sys.stdin.buffer.read())
        if img is None:
            return 2
        found = detect(img)
        if not found:
            return 3
        ok, buf = cv2.imencode(".webp", clean(img, found), [cv2.IMWRITE_WEBP_QUALITY, 92])
        if not ok:
            return 2
        sys.stdout.buffer.write(buf.tobytes())
        return 0
    src, dst = sys.argv[1], sys.argv[2]
    files = [src] if os.path.isfile(src) else [os.path.join(src, n) for n in sorted(os.listdir(src)) if n.lower().endswith((".webp", ".jpg", ".jpeg", ".png", ".img"))]
    os.makedirs(dst, exist_ok=True)
    n_clean = 0
    for f in files:
        img = decode(open(f, "rb").read())
        found = detect(img) if img is not None else []
        if not found:
            continue
        n_clean += 1
        out = clean(img, found)
        cv2.imencode(".webp", out, [cv2.IMWRITE_WEBP_QUALITY, 92])[1].tofile(os.path.join(dst, os.path.splitext(os.path.basename(f))[0] + ".webp"))
        print(f"cleaned {os.path.basename(f)}: {', '.join(n for n, _, _ in found)}")
    print(f"done: {len(files)} file(s), {n_clean} cleaned")
    return 0


if __name__ == "__main__":
    sys.exit(main())
