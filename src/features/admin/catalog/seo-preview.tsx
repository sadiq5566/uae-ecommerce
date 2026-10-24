"use client";
import { useEffect, useRef, useState } from "react";

const TITLE_MAX = 60;
const DESC_MIN = 120;
const DESC_MAX = 160;

const clip = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n - 1).trimEnd() + "…");
const strip = (s: string) => s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const tone = (n: number, min: number, max: number) => (n === 0 ? "text-muted" : n > max ? "text-danger" : n < min ? "text-amber-600" : "text-green-600");

/**
 * Google preview + length counters for the SEO title / description inputs of the product form (name="seoTitle" / "seoDesc").
 * It reads the surrounding form live, so it works with the uncontrolled inputs; "Fill from product" copies name / short description in.
 */
export function SeoPreview({ siteName = "Carts Heaven" }: { siteName?: string }) {
  const root = useRef<HTMLDivElement>(null);
  const [v, setV] = useState({ name: "", short: "", slug: "", title: "", desc: "" });

  useEffect(() => {
    const form = root.current?.closest("form");
    if (!form) return;
    const read = () => {
      const val = (n: string) => ((form.elements.namedItem(n) as HTMLInputElement | HTMLTextAreaElement | null)?.value ?? "").trim();
      setV({ name: val("name"), short: strip(val("shortDescription") || val("longDescription")), slug: val("slug"), title: val("seoTitle"), desc: val("seoDesc") });
    };
    read();
    form.addEventListener("input", read);
    return () => form.removeEventListener("input", read);
  }, []);

  const fill = () => {
    const form = root.current?.closest("form");
    const set = (n: string, value: string) => {
      const el = form?.elements.namedItem(n) as HTMLInputElement | HTMLTextAreaElement | null;
      if (!el || el.value) return; // never overwrite what was typed
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")?.set?.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    set("seoTitle", clip(v.name, TITLE_MAX));
    set("seoDesc", clip(v.short, DESC_MAX));
  };

  const title = (v.title || v.name || "Product name") + ` | ${siteName}`;
  const desc = v.desc || v.short || "Add a short description above, or write one here.";
  const slug = v.slug || v.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "product-name";
  const host = (process.env.NEXT_PUBLIC_SITE_URL ?? "yoursite.com").replace(/^https?:\/\//, "");

  return (
    <div ref={root} className="mt-4 grid gap-3 sm:col-span-2">
      <div className="flex flex-wrap items-center gap-4 text-xs">
        <span>Title <b className={tone(title.length, 1, TITLE_MAX)}>{title.length} / {TITLE_MAX}</b></span>
        <span>Description <b className={tone(desc.length, DESC_MIN, DESC_MAX)}>{v.desc.length || "auto"} / {DESC_MIN}–{DESC_MAX}</b></span>
        <button type="button" onClick={fill} className="rounded-xl border border-line px-3 py-1.5 font-semibold hover:bg-surface-2">Fill from product</button>
      </div>
      <div className="rounded-xl border border-line bg-white p-4 text-left" aria-label="Google search preview" dir="ltr">
        <p className="mb-1 text-[0.65rem] uppercase tracking-widest text-muted">Google preview</p>
        <p className="truncate text-xs text-[#202124]">{host} › p › {slug}</p>
        <p className="text-lg leading-snug text-[#1a0dab]">{clip(title, TITLE_MAX + 4)}</p>
        <p className="text-sm leading-snug text-[#4d5156]">{clip(desc, DESC_MAX + 10)}</p>
      </div>
    </div>
  );
}
