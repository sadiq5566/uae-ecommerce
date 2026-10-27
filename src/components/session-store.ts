"use client";
import { useEffect, useSyncExternalStore } from "react";

// Client mirror of per-user state (cart count, wishlist, who's signed in). The server is the source of truth;
// pages stay cacheable and this is hydrated from /api/session after load and updated from action results.
export type SessionState = { loaded: boolean; user: { name: string; role: string; avatar?: string } | null; cartCount: number; wishlist: string[] };
const initial: SessionState = { loaded: false, user: null, cartCount: 0, wishlist: [] };
let state = initial;
const listeners = new Set<() => void>();
const set = (patch: Partial<SessionState>) => { state = { ...state, ...patch }; listeners.forEach((l) => l()); };

export const setCartCount = (n: number) => set({ cartCount: n });
export const setWishlist = (ids: string[]) => set({ wishlist: ids });

export async function refreshSession() {
  try {
    const res = await fetch("/api/session", { cache: "no-store" });
    if (res.ok) set({ ...(await res.json()), loaded: true });
  } catch { /* offline: keep previous state */ }
}

export function useSession() {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => state,
    () => initial,
  );
}

export function SessionBootstrap() {
  useEffect(() => { refreshSession(); }, []);
  return null;
}
