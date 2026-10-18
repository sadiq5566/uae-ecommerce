"use client";
import { useState } from "react";

/** One-tap copy for a coupon code. Falls back to a visible, selectable code if the clipboard is blocked. */
export function CopyCode({ code, copy, copied }: { code: string; copy: string; copied: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => { try { await navigator.clipboard.writeText(code); setDone(true); setTimeout(() => setDone(false), 2000); } catch { /* the code is visible and selectable */ } }}
      className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-brand-fg transition hover:brightness-110 active:scale-95"
      aria-live="polite"
    >{done ? `✓ ${copied}` : copy}</button>
  );
}
