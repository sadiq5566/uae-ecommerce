"use client";
import Image from "@/components/img";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { formatAED, type Locale } from "@/lib/i18n";

type Item = { type: "product" | "category"; slug: string; name: { en: string; ar: string }; icon: string; price?: number; image?: string };

/** Accessible search combobox (ARIA 1.2 list autocomplete): arrows move, Enter opens, Escape closes. */
export function SearchBox({ locale, placeholder, labels, className = "", onNavigate }: { locale: Locale; placeholder: string; labels: { results: string; category: string }; className?: string; onNavigate?: () => void }) {
  const router = useRouter();
  const id = useId();
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const ctl = useRef<AbortController | null>(null);

  function onChange(v: string) {
    setQ(v); setActive(-1);
    ctl.current?.abort();
    if (v.trim().length < 2) { setItems([]); setOpen(false); return; }
    const c = (ctl.current = new AbortController());
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/suggest?q=${encodeURIComponent(v.trim())}`, { signal: c.signal });
        if (!r.ok) return;
        const j = await r.json(); setItems(j.items ?? []); setOpen((j.items ?? []).length > 0);
      } catch { /* aborted or offline */ }
    }, 180);
    c.signal.addEventListener("abort", () => clearTimeout(t));
  }
  useEffect(() => () => ctl.current?.abort(), []);

  const hrefOf = (it: Item) => `/${locale}/${it.type === "product" ? "p" : "c"}/${it.slug}`;
  const go = (href: string) => { setOpen(false); onNavigate?.(); router.push(href); };

  return (
    <form action={`/${locale}/search`} role="search" className={`relative ${className}`}
      onSubmit={(e) => { if (active >= 0 && items[active]) { e.preventDefault(); go(hrefOf(items[active])); } }}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
      <input name="q" type="search" value={q} autoComplete="off" placeholder={placeholder} aria-label={placeholder}
        role="combobox" aria-expanded={open} aria-controls={`${id}-list`} aria-autocomplete="list" aria-activedescendant={active >= 0 ? `${id}-${active}` : undefined}
        onChange={(e) => onChange(e.target.value)} onFocus={() => items.length && setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setOpen(items.length > 0); setActive((a) => Math.min(items.length - 1, a + 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(-1, a - 1)); }
          else if (e.key === "Escape" && open) { e.preventDefault(); setOpen(false); setActive(-1); } // first Escape only closes the list (browsers would also clear a type=search field)
        }}
        className="w-full rounded-full border border-line bg-surface px-5 py-2.5 text-sm outline-none transition focus:border-brand focus:shadow-card" />
      {open && items.length > 0 && (
        <ul id={`${id}-list`} role="listbox" aria-label={labels.results} className="animate-slide-in absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
          {items.map((it, i) => (
            <li key={it.type + it.slug} id={`${id}-${i}`} role="option" aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()} onClick={() => go(hrefOf(it))} onMouseEnter={() => setActive(i)}
              className={`flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm ${i === active ? "bg-brand-soft" : ""}`}>
              <span aria-hidden className="relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-surface-2 text-lg">{it.image ? <Image src={it.image} alt="" fill sizes="40px" className="object-cover" /> : it.icon}</span>
              <span className="min-w-0 flex-1 truncate">{it.name[locale]}{it.type === "category" && <span className="ms-2 rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">{labels.category}</span>}</span>
              {it.price != null && <span className="shrink-0 font-semibold">{formatAED(it.price, locale)}</span>}
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
