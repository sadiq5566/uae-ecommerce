"""Long-lived worker for `npm run clean-images`: cleans many pictures per Python process.

Starting Python and importing OpenCV costs seconds, so lib/watermark-remove.ts starts a few of these once and feeds them pictures.

Protocol (binary, stdin/stdout):
  request : 4-byte big-endian length N, then N bytes of image
  response: 1 status byte, 4-byte big-endian length M, then M payload bytes
            status 0 = cleaned (payload = .webp), 3 = no watermark (empty), 4 = skipped (payload = reason text), 2 = unreadable (payload = message)

Per picture: first the four known store logos by template (scripts/remove-logos.py: Rimal bottom-left, Amara + Lune bottom-right, WG top-right -
works on photos too, only when the logo is really there), then the generic detector for any other watermark / logo on a plain background (scripts/remove-watermark.py).
"""
import importlib.util
import os
import struct
import sys

import cv2

HERE = os.path.dirname(os.path.abspath(__file__))


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, filename))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


rw = load("remove_watermark", "remove-watermark.py")
rl = load("remove_logos", "remove-logos.py")


def process(data):
    img = rl.decode(data)
    if img is None:
        return 2, b"unreadable image"
    found = rl.detect(img)
    if found:
        img = rl.clean(img, found)
    out, status, why, _ = rw.clean(img)
    if status == "cleaned":
        img = out
    elif not found:
        return (4, why.encode()) if status == "skipped" else (3, b"")
    ok, buf = cv2.imencode(".webp", img, [cv2.IMWRITE_WEBP_QUALITY, 92])
    return (0, buf.tobytes()) if ok else (2, b"could not encode")


def read_exact(stream, n):
    chunks = []
    while n:
        c = stream.read(n)
        if not c:
            return None
        chunks.append(c)
        n -= len(c)
    return b"".join(chunks)


def main():
    inp, out = sys.stdin.buffer, sys.stdout.buffer
    while True:
        head = read_exact(inp, 4)
        if head is None:
            return
        data = read_exact(inp, struct.unpack(">I", head)[0])
        if data is None:
            return
        try:
            code, payload = process(data)
        except Exception as e:  # one bad picture must not kill the worker
            code, payload = 2, str(e).encode()[:200]
        out.write(bytes([code]) + struct.pack(">I", len(payload)) + payload)
        out.flush()


if __name__ == "__main__":
    main()
