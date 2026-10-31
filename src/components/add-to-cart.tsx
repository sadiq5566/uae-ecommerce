"use client";
import { useState, useTransition } from "react";
import { addToCartAction } from "@/features/cart/actions";
import { setCartCount } from "./session-store";
import { useToast } from "./toast";

export function AddToCart({ sku, label, doneLabel, errors, compact }: { sku: string; label: string; doneLabel: string; errors: Record<string, string>; compact?: boolean }) {
  const toast = useToast();
  const [pulse, setPulse] = useState(0);
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending} aria-label={compact ? label : undefined} title={compact ? label : undefined}
      onClick={() => start(async () => {
        const r = await addToCartAction(sku, 1);
        if (r.ok || r.error !== "invalid") setCartCount(r.count); // a rejected request must not zero the badge
        if (r.ok) { toast(doneLabel); setPulse((p) => p + 1); } else toast(errors[r.error ?? "generic"] ?? errors.generic, "error");
      })}
      className={compact ? "grid size-10 shrink-0 place-items-center rounded-xl border border-brand text-brand transition hover:bg-brand-soft active:scale-95 disabled:opacity-60" : "w-full rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-brand-fg transition hover:brightness-110 active:scale-95 disabled:opacity-60"}
    >
      <span key={pulse} className={pulse ? "animate-pop inline-block" : "inline-block"}>🛒</span>{!compact && <> {label}</>}
    </button>
  );
}
