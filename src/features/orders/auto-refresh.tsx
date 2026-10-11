"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-fetches server data while we wait for the payment provider's webhook (max ~2 minutes). */
export function AutoRefresh({ active, label }: { active: boolean; label: string }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    let n = 0;
    const id = setInterval(() => { router.refresh(); if (++n >= 30) clearInterval(id); }, 4000);
    return () => clearInterval(id);
  }, [active, router]);
  return active ? <span role="status" className="sr-only">{label}</span> : null;
}
