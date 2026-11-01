"use client";
import Image, { type ImageLoaderProps, type ImageProps } from "next/image";
import { useState } from "react";

// Hosts next/image may optimise (IMAGE_HOSTS, exposed by next.config). Any other https host is still shown, just not re-encoded by us, so a new supplier never means blank pictures.
const KNOWN = (process.env.NEXT_PUBLIC_IMAGE_HOSTS ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);

function isKnown(src: ImageProps["src"]) {
  if (typeof src !== "string" || !/^https?:\/\//.test(src)) return true; // local files / static imports
  try { return KNOWN.includes(new URL(src).hostname.toLowerCase()); } catch { return false; }
}

/**
 * Shopify-style CDNs (/cdn/shop/...) resize on request with ?width=. Without this every card downloaded the 960px original; now the browser
 * asks for the width it needs (next/image calls this once per srcset entry), straight from the supplier's CDN, no proxy of ours involved.
 */
function resizingLoader({ src, width }: ImageLoaderProps) {
  try {
    const u = new URL(src);
    if (!/\/cdn\/shop\//.test(u.pathname)) return src;
    u.searchParams.set("width", String(Math.min(width, 1200)));
    return u.toString();
  } catch { return src; }
}
const canResize = (src: ImageProps["src"]) => typeof src === "string" && /^https?:\/\/[^/]+\/cdn\/shop\//.test(src);

// A soft translucent tile shown while the real picture loads. Translucent so it tints whatever is behind it, in light and dark mode alike.
const BLUR = `data:image/svg+xml;base64,${btoa('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#808080" fill-opacity=".14"/></svg>')}`;

/** Drop-in for next/image: works for any https image host and hides itself when the file is broken, so the placeholder behind it shows instead. */
export default function Img({ onError, unoptimized, loader, ...props }: ImageProps) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  const known = isKnown(props.src);
  const resize = !known && !loader && !unoptimized && canResize(props.src);
  return (
    <Image placeholder="blur" blurDataURL={BLUR} {...props} alt={props.alt} loader={resize ? resizingLoader : loader} unoptimized={unoptimized || (!known && !resize)} referrerPolicy="no-referrer" onError={(e) => { setFailed(true); onError?.(e); }} />
  );
}
