"use client";
import { useRef, useState } from "react";
import { inputCls } from "./ui";

const mini = "rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium hover:bg-surface-2 disabled:opacity-40";
const move = <T,>(arr: T[], i: number, d: -1 | 1) => { const j = i + d; if (j < 0 || j >= arr.length) return arr; const c = [...arr]; [c[i], c[j]] = [c[j], c[i]]; return c; };
type L = { en: string; ar: string };

/** Hidden input carrying a JSON value to the server action (validated there with Zod). */
const Hidden = ({ name, value }: { name: string; value: unknown }) => <input type="hidden" name={name} value={JSON.stringify(value)} />;

export type ImageItem = { url: string; alt: L };

export function ImagesEditor({ name = "images", initial, max = 10, single, onUrl }: { name?: string; initial: ImageItem[]; max?: number; single?: boolean; onUrl?: (url: string) => void }) {
  const [items, setItems] = useState<ImageItem[]>(initial);
  const [url, setUrl] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const file = useRef<HTMLInputElement>(null);
  async function upload(f: File) {
    setBusy(true); setErr("");
    const fd = new FormData(); fd.append("file", f);
    const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setErr(j.error ?? "Upload failed");
    commit(single ? [{ url: j.url, alt: { en: "", ar: "" } }] : [...items, { url: j.url, alt: { en: "", ar: "" } }].slice(0, max));
  }
  const set = (i: number, p: Partial<ImageItem>) => setItems((x) => x.map((it, k) => (k === i ? { ...it, ...p } : it)));
  const commit = (next: ImageItem[]) => { setItems(next); onUrl?.(next[0]?.url ?? ""); };
  return (
    <div className="flex flex-col gap-3">
      {single ? <input type="hidden" name={name} value={items[0]?.url ?? ""} /> : <Hidden name={name} value={items} />}
      <ul className="grid gap-3 sm:grid-cols-2">
        {items.map((it, i) => (
          <li key={it.url + i} className="flex gap-3 rounded-xl border border-line p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={it.url} alt="" className="size-20 shrink-0 rounded-lg bg-surface-2 object-cover" />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              {!single && <><input aria-label="Alt text (English)" placeholder="Alt text (English)" value={it.alt.en} onChange={(e) => set(i, { alt: { ...it.alt, en: e.target.value } })} className={inputCls} /><input aria-label="Alt text (Arabic)" dir="rtl" placeholder="النص البديل (العربية)" value={it.alt.ar} onChange={(e) => set(i, { alt: { ...it.alt, ar: e.target.value } })} className={inputCls} /></>}
              <div className="flex gap-1.5"><button type="button" className={mini} disabled={i === 0} onClick={() => setItems(move(items, i, -1))}>↑</button><button type="button" className={mini} disabled={i === items.length - 1} onClick={() => setItems(move(items, i, 1))}>↓</button><button type="button" className={`${mini} text-danger`} onClick={() => commit(items.filter((_, k) => k !== i))}>Remove</button></div>
            </div>
          </li>
        ))}
      </ul>
      {items.length < max && (
        <div className="flex flex-wrap items-center gap-2">
          <input ref={file} type="file" aria-label="Upload an image file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
          <button type="button" className={mini} disabled={busy} onClick={() => file.current?.click()}>{busy ? "Uploading…" : "Upload image"}</button>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="…or paste an allowed image URL" aria-label="Image URL" className={`${inputCls} max-w-xs`} />
          <button type="button" className={mini} disabled={!url.trim()} onClick={() => { commit(single ? [{ url: url.trim(), alt: { en: "", ar: "" } }] : [...items, { url: url.trim(), alt: { en: "", ar: "" } }]); setUrl(""); }}>Add URL</button>
        </div>
      )}
      {err && <p role="alert" className="text-sm text-danger">{err}</p>}
    </div>
  );
}

export type VariantItem = { sku: string; label: L; stock: number | string; price?: number | string | null; image?: string; swatch?: string };
export function VariantsEditor({ initial, onCount }: { initial: VariantItem[]; onCount?: (n: number) => void }) {
  const [items, setItems] = useState<VariantItem[]>(initial);
  const update = (next: VariantItem[]) => { setItems(next); onCount?.(next.length); };
  const set = (i: number, p: Partial<VariantItem>) => setItems((x) => x.map((it, k) => (k === i ? { ...it, ...p } : it)));
  return (
    <div className="flex flex-col gap-3">
      <Hidden name="variants" value={items.map((v) => ({ ...v, price: v.price === null ? "" : v.price }))} />
      {items.length === 0 && <p className="text-sm text-muted">No variants. Add them if this product comes in options (size, colour…). With variants, stock is tracked per variant.</p>}
      {items.map((v, i) => (
        <div key={i} className="grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-6">
          <input aria-label="Variant SKU" placeholder="Variant SKU" value={v.sku} onChange={(e) => set(i, { sku: e.target.value })} className={`${inputCls} sm:col-span-2`} />
          <input aria-label="Label (English)" placeholder="Label EN" value={v.label.en} onChange={(e) => set(i, { label: { ...v.label, en: e.target.value } })} className={inputCls} />
          <input aria-label="Label (Arabic)" dir="rtl" placeholder="التسمية" value={v.label.ar} onChange={(e) => set(i, { label: { ...v.label, ar: e.target.value } })} className={inputCls} />
          <input aria-label="Variant stock" type="number" min={0} placeholder="Stock" value={v.stock} onChange={(e) => set(i, { stock: e.target.value })} className={inputCls} />
          <div className="flex gap-1.5"><input aria-label="Variant price (optional)" type="number" min={0} step="0.01" placeholder="Price?" value={v.price ?? ""} onChange={(e) => set(i, { price: e.target.value })} className={inputCls} /><button type="button" aria-label="Remove variant" className={`${mini} text-danger`} onClick={() => update(items.filter((_, k) => k !== i))}>✕</button></div>
          <input aria-label="Variant image URL (shown when this option is selected)" placeholder="Image URL for this option (optional)" value={v.image ?? ""} onChange={(e) => set(i, { image: e.target.value })} className={`${inputCls} sm:col-span-4`} />
          <label className="flex items-center gap-2 text-sm sm:col-span-2">Colour<input aria-label="Swatch colour" type="color" value={/^#[0-9a-fA-F]{6}$/.test(v.swatch ?? "") ? v.swatch : "#cccccc"} onChange={(e) => set(i, { swatch: e.target.value })} className="h-9 w-12 cursor-pointer rounded border border-line" />{v.swatch && <button type="button" className={mini} onClick={() => set(i, { swatch: "" })}>none</button>}</label>
        </div>
      ))}
      <button type="button" className={`${mini} self-start`} onClick={() => update([...items, { sku: "", label: { en: "", ar: "" }, stock: 0 }])}>+ Add variant</button>
    </div>
  );
}

export type SpecItem = { label: L; value: L };
export function SpecsEditor({ initial }: { initial: SpecItem[] }) {
  const [items, setItems] = useState<SpecItem[]>(initial);
  const set = (i: number, p: Partial<SpecItem>) => setItems((x) => x.map((it, k) => (k === i ? { ...it, ...p } : it)));
  return (
    <div className="flex flex-col gap-3">
      <Hidden name="specs" value={items} />
      {items.map((s, i) => (
        <div key={i} className="grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-5">
          <input aria-label="Label EN" placeholder="Label EN" value={s.label.en} onChange={(e) => set(i, { label: { ...s.label, en: e.target.value } })} className={inputCls} />
          <input aria-label="Label AR" dir="rtl" placeholder="التسمية" value={s.label.ar} onChange={(e) => set(i, { label: { ...s.label, ar: e.target.value } })} className={inputCls} />
          <input aria-label="Value EN" placeholder="Value EN" value={s.value.en} onChange={(e) => set(i, { value: { ...s.value, en: e.target.value } })} className={inputCls} />
          <input aria-label="Value AR" dir="rtl" placeholder="القيمة" value={s.value.ar} onChange={(e) => set(i, { value: { ...s.value, ar: e.target.value } })} className={inputCls} />
          <button type="button" aria-label="Remove specification" className={`${mini} text-danger`} onClick={() => setItems(items.filter((_, k) => k !== i))}>Remove</button>
        </div>
      ))}
      <button type="button" className={`${mini} self-start`} onClick={() => setItems([...items, { label: { en: "", ar: "" }, value: { en: "", ar: "" } }])}>+ Add specification</button>
    </div>
  );
}

/** Product attribute values for the selected category's attribute keys. */
export function AttrsEditor({ keys, initial }: { keys: { key: string; label: string }[]; initial: Record<string, string> }) {
  const [vals, setVals] = useState<Record<string, string>>(initial);
  if (keys.length === 0) return <p className="text-sm text-muted">The selected category has no filterable attributes. Add them on the category.</p>;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Hidden name="attrs" value={vals} />
      {keys.map((k) => <label key={k.key} className="text-sm font-medium">{k.label} <span className="text-xs text-muted">({k.key})</span><input value={vals[k.key] ?? ""} onChange={(e) => setVals({ ...vals, [k.key]: e.target.value })} className={`${inputCls} mt-1.5`} /></label>)}
    </div>
  );
}

export type AttrDef = { key: string; label: L };
export function AttrDefsEditor({ initial }: { initial: AttrDef[] }) {
  const [items, setItems] = useState<AttrDef[]>(initial);
  const set = (i: number, p: Partial<AttrDef>) => setItems((x) => x.map((it, k) => (k === i ? { ...it, ...p } : it)));
  return (
    <div className="flex flex-col gap-3">
      <Hidden name="attributes" value={items} />
      {items.map((a, i) => (
        <div key={i} className="grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-4">
          <input aria-label="Key" placeholder="key (e.g. color)" value={a.key} onChange={(e) => set(i, { key: e.target.value })} className={inputCls} />
          <input aria-label="Label EN" placeholder="Label EN" value={a.label.en} onChange={(e) => set(i, { label: { ...a.label, en: e.target.value } })} className={inputCls} />
          <input aria-label="Label AR" dir="rtl" placeholder="التسمية" value={a.label.ar} onChange={(e) => set(i, { label: { ...a.label, ar: e.target.value } })} className={inputCls} />
          <button type="button" aria-label="Remove attribute" className={`${mini} text-danger`} onClick={() => setItems(items.filter((_, k) => k !== i))}>Remove</button>
        </div>
      ))}
      <button type="button" className={`${mini} self-start`} onClick={() => setItems([...items, { key: "", label: { en: "", ar: "" } }])}>+ Add attribute</button>
    </div>
  );
}
