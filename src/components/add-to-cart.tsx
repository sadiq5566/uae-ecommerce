"use client";
import { useState, useTransition } from "react";
import { addToCartAction } from "@/features/cart/actions";
import { setCartCount } from "./session-store";
import { useToast } from "./toast";

export function AddToCart({ sku, label, doneLabel, errors }: { sku: string; label: string; doneLabel: string; errors: Record<string, string> }) {
  const toast = useToast();
  const [pulse, setPulse] = useState(0);
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => start(async () => {
        const r = await addToCartAction(sku, 1);
        setCartCount(r.count);
        if (r.ok) { toast(doneLabel); setPulse((p) => p + 1); } else toast(errors[r.error ?? "generic"] ?? errors.generic, "error");
      })}
      className="w-full rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-brand-fg transition hover:brightness-110 active:scale-95 disabled:opacity-60"
    >
      <span key={pulse} className={pulse ? "animate-pop inline-block" : "inline-block"}>🛒</span> {label}
    </button>
  );
}
