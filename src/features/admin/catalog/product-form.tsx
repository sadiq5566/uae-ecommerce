"use client";
import { useActionState, useState } from "react";
import { CB, SF, TA, TF } from "@/components/admin/fields";
import { AttrsEditor, ImagesEditor, SpecsEditor, VariantsEditor, type ImageItem, type SpecItem, type VariantItem } from "@/components/admin/editors";
import { Card, btnPrimary } from "@/components/admin/ui";
import type { FormState } from "@/features/auth/schemas";
import { saveProductAction } from "./actions";

export type CategoryOption = { id: string; name: string; parent: string | null; attributes: { key: string; label: string }[] };
export type ProductFormData = {
  id?: string; slug: string; sku: string; name: { en: string; ar: string }; description: { en: string; ar: string }; category: string; brand?: string;
  price: number; salePrice?: number | null; saleStartsAt?: string; saleEndsAt?: string; stock: number; lowStockThreshold: number; status: string; featured: boolean;
  tags: string[]; icon: string; hue: number; images: ImageItem[]; variants: VariantItem[]; specs: SpecItem[]; attrs: Record<string, string>;
  seo: { title: { en: string; ar: string }; description: { en: string; ar: string } };
};

const EMPTY: ProductFormData = { slug: "", sku: "", name: { en: "", ar: "" }, description: { en: "", ar: "" }, category: "", price: 0, stock: 0, lowStockThreshold: 5, status: "draft", featured: false, tags: [], icon: "📦", hue: 160, images: [], variants: [], specs: [], attrs: {}, seo: { title: { en: "", ar: "" }, description: { en: "", ar: "" } } };

export function ProductForm({ categories, product }: { categories: CategoryOption[]; product?: ProductFormData }) {
  const p = product ?? EMPTY;
  const [s, action, pending] = useActionState<FormState, FormData>(saveProductAction, {});
  const [cat, setCat] = useState(s.values?.category ?? p.category);
  const [variantCount, setVariantCount] = useState(p.variants.length);
  const attrKeys = categories.find((c) => c.id === cat)?.attributes ?? [];
  const e = s.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-6" noValidate>
      {p.id && <input type="hidden" name="id" value={p.id} />}
      <div aria-live="polite">
        {s.error && <p role="alert" className="rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">{s.error}</p>}
        {s.ok && <p role="status" className="rounded-xl bg-brand-soft px-4 py-3 text-sm text-brand">✓ Saved</p>}
      </div>
      <Card title="Basics">
        <div className="grid gap-4 sm:grid-cols-2">
          <TF s={s} name="name_en" label="Name (English)" defaultValue={p.name.en} required />
          <TF s={s} name="name_ar" label="Name (Arabic)" defaultValue={p.name.ar} dir="rtl" required />
          <TF s={s} name="slug" label="URL slug" defaultValue={p.slug} hint="Changing it keeps the old URL working (301 redirect)." required />
          <TF s={s} name="sku" label="SKU" defaultValue={p.sku} required />
          <SF s={s} name="category" label="Category" defaultValue={p.category} onChange={(ev) => setCat(ev.target.value)} required>
            <option value="" disabled>Select…</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.parent ? "— " : ""}{c.name}</option>)}
          </SF>
          <TF s={s} name="brand" label="Brand (optional)" defaultValue={p.brand} />
          <TA s={s} name="description_en" label="Description (English)" defaultValue={p.description.en} rows={5} />
          <TA s={s} name="description_ar" label="Description (Arabic)" defaultValue={p.description.ar} rows={5} dir="rtl" />
        </div>
      </Card>
      <Card title="Pricing & stock">
        <div className="grid gap-4 sm:grid-cols-3">
          <TF s={s} name="price" label="Price (AED)" type="number" step="0.01" min={0} defaultValue={p.price} required />
          <TF s={s} name="salePrice" label="Sale price (AED)" type="number" step="0.01" min={0} defaultValue={p.salePrice ?? ""} hint="Leave empty for no sale." />
          <div />
          <TF s={s} name="saleStartsAt" label="Sale starts (optional)" type="datetime-local" defaultValue={p.saleStartsAt ?? ""} />
          <TF s={s} name="saleEndsAt" label="Sale ends (optional)" type="datetime-local" defaultValue={p.saleEndsAt ?? ""} />
          <div />
          <TF s={s} name="stock" label={variantCount ? "Stock (sum of variants)" : "Stock"} type="number" min={0} defaultValue={p.stock} disabled={variantCount > 0} hint={variantCount ? "Calculated from the variants below." : "Changes are logged in the inventory history."} />
          <TF s={s} name="lowStockThreshold" label="Low-stock threshold" type="number" min={0} defaultValue={p.lowStockThreshold} />
        </div>
      </Card>
      <Card title="Images"><ImagesEditor initial={p.images} />{e.images && <p role="alert" className="mt-2 text-sm text-danger">{e.images}</p>}<p className="mt-2 text-xs text-muted">The first image is the main image. Images are stored in object storage, not MongoDB.</p></Card>
      <Card title="Variants">
        <VariantsEditor initial={p.variants} onCount={setVariantCount} />
        {e.variants && <p role="alert" className="mt-2 text-sm text-danger">{e.variants}</p>}
      </Card>
      <Card title="Specifications"><SpecsEditor initial={p.specs} />{e.specs && <p role="alert" className="mt-2 text-sm text-danger">{e.specs}</p>}</Card>
      <Card title="Filter attributes"><AttrsEditor key={cat} keys={attrKeys} initial={p.attrs} /></Card>
      <Card title="Publishing & SEO">
        <div className="grid gap-4 sm:grid-cols-2">
          <SF s={s} name="status" label="Status" defaultValue={p.status}><option value="draft">Draft (hidden)</option><option value="published">Published</option><option value="archived">Archived</option></SF>
          <div className="flex items-end"><CB s={s} name="featured" label="Featured on the home page" defaultChecked={p.featured} /></div>
          <TF s={s} name="tags" label="Tags (comma separated)" defaultValue={p.tags.join(", ")} />
          <div className="grid grid-cols-2 gap-3"><TF s={s} name="icon" label="Placeholder icon" defaultValue={p.icon} /><TF s={s} name="hue" label="Colour (0–360)" type="number" defaultValue={p.hue} /></div>
          <TF s={s} name="seoTitle_en" label="SEO title (EN)" defaultValue={p.seo.title.en} hint="Max 70 characters" />
          <TF s={s} name="seoTitle_ar" label="SEO title (AR)" defaultValue={p.seo.title.ar} dir="rtl" />
          <TA s={s} name="seoDesc_en" label="Meta description (EN)" defaultValue={p.seo.description.en} rows={2} />
          <TA s={s} name="seoDesc_ar" label="Meta description (AR)" defaultValue={p.seo.description.ar} rows={2} dir="rtl" />
        </div>
      </Card>
      <div className="sticky bottom-3 z-10 flex gap-3 rounded-2xl border border-line bg-surface/95 p-3 shadow-card backdrop-blur"><button disabled={pending} className={btnPrimary}>{pending ? "Saving…" : p.id ? "Save changes" : "Create product"}</button></div>
    </form>
  );
}
