"use client";
import { useSyncExternalStore } from "react";

type Pref = "light" | "dark" | "system";
const listeners = new Set<() => void>();
const read = (): Pref => {
  try { return (localStorage.getItem("theme") as Pref) || "system"; } catch { return "system"; }
};
function apply(p: Pref) {
  const dark = p === "dark" || (p === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}
function set(p: Pref) {
  try { localStorage.setItem("theme", p); } catch {}
  apply(p);
  listeners.forEach((l) => l());
}

export function ThemeToggle({ labels }: { labels: { theme: string; light: string; dark: string; system: string } }) {
  const pref = useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    read,
    () => "system" as Pref,
  );
  const opts: { v: Pref; icon: string; label: string }[] = [
    { v: "light", icon: "☀️", label: labels.light },
    { v: "system", icon: "🖥️", label: labels.system },
    { v: "dark", icon: "🌙", label: labels.dark },
  ];
  return (
    <div role="radiogroup" aria-label={labels.theme} className="flex rounded-full border border-line bg-surface p-0.5">
      {opts.map((o) => (
        <button
          key={o.v} role="radio" aria-checked={pref === o.v} aria-label={o.label} title={o.label}
          onClick={() => set(o.v)}
          className={`grid size-7 place-items-center rounded-full text-xs transition ${pref === o.v ? "bg-brand text-brand-fg" : "hover:bg-surface-2"}`}
        >{o.icon}</button>
      ))}
    </div>
  );
}
