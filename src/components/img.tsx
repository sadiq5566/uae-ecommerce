"use client";
import Image, { type ImageProps } from "next/image";
import { useState } from "react";

// Hosts next/image may optimise (IMAGE_HOSTS, exposed by next.config). Any other https host is still shown, just unoptimised, so a new supplier never means blank pictures.
const KNOWN = (process.env.NEXT_PUBLIC_IMAGE_HOSTS ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);

function isKnown(src: ImageProps["src"]) {
  if (typeof src !== "string" || !/^https?:\/\//.test(src)) return true; // local files / static imports
  try { return KNOWN.includes(new URL(src).hostname.toLowerCase()); } catch { return false; }
}

/** Drop-in for next/image: works for any https image host and hides itself when the file is broken, so the placeholder behind it shows instead. */
export default function Img({ onError, unoptimized, ...props }: ImageProps) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return <Image {...props} unoptimized={unoptimized || !isKnown(props.src)} referrerPolicy="no-referrer" onError={(e) => { setFailed(true); onError?.(e); }} />;
}
