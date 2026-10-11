"use client";
import { useEffect, useState } from "react";

// Demo promo: rolls over every 3 days. Real deals use DB end dates in Phase 4.
const PERIOD = 3 * 24 * 3600 * 1000;
const nextEnd = (n: number) => Math.ceil(n / PERIOD) * PERIOD;

export function Countdown({ units }: { units: { d: string; h: string; m: string; s: string } }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => { clearTimeout(first); clearInterval(id); };
  }, []);
  const left = Math.max(0, (nextEnd(now ?? 0) - (now ?? 0)) / 1000);
  const parts = [
    [Math.floor(left / 86400), units.d], [Math.floor((left % 86400) / 3600), units.h],
    [Math.floor((left % 3600) / 60), units.m], [Math.floor(left % 60), units.s],
  ] as const;
  return (
    <div className="flex gap-2" dir="ltr" suppressHydrationWarning>
      {parts.map(([v, u]) => (
        <div key={u} className="min-w-12 rounded-xl bg-fg px-2 py-1.5 text-center text-bg">
          <div className="text-lg font-bold tabular-nums leading-none">{String(v).padStart(2, "0")}</div>
          <div className="mt-0.5 text-[10px] uppercase opacity-70">{u}</div>
        </div>
      ))}
    </div>
  );
}
