"use client";
import { SeoPreview } from "./seo-preview";
import { useActionState, useState } from "react";
import { CB, SF, TA, TF } from "@/components/admin/fields";
import { ImagesEditor, VariantsEditor, type ImageItem, type VariantItem } from "@/components/admin/editors";
import { Card, btnPrimary } from "@/components/admin/ui";
import type { FormState } from "@/features/auth/schemas";
import { saveProductAction } from "./actions";

export type CategoryOption = { id: string; name: string; parent: string | null };
export type ProductFormData = {
  id?: string; slug: string; sku: string; name: string; shortDescription: string; longDescription: string; category: string; subcategory: string;
  brand?: string; model?: string; finish?: string; priceFrom: number; priceTo: number; stock: number; lowStockThreshold: number; status: string;
  isFeatured: boolean; isNewArrival: boolean; isMostWanted: boolean; tags: string[]; highlights: string[]; includedItems: string[];
  images: ImageItem[]; variants: VariantItem[]; seo: { title: string; description: string };
};

const EMPTY: ProductFormData = { slug: "", sku: "", name: "", shortDescription: "", longDescription: "", category: "", subcategory: "general", priceFrom: 0, priceTo: 0, stock: 0, lowStockThreshold: 5, status: "draft", isFeatured: false, isNewArrival: false, isMostWanted: false, tags: [], highlights: [], includedItems: [], images: [], variants: [], seo: { title: "", description: "" } };

export function ProductForm({ categories, product, brands = [] }: { categories: CategoryOption[]; product?: ProductFormData; brands?: string[] }) {
  const p = product ?? EMPTY;
  const [s, action, pending] = useActionState<FormState, FormData>(saveProductAction, {});
  const [variantCount, setVariantCount] = useState(p.variants.length);
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
          <TF s={s} name="name" label="Name" defaultValue={p.name} required />
          <TF s={s} name="sku" label="SKU" defaultValue={p.sku} required />
          <TF s={s} name="slug" label="URL slug" defaultValue={p.slug} hint="Leave empty to generate it. Changing it keeps the old URL working (301 redirect)." />
          <SF s={s} name="category" label="Category" defaultValue={p.category} required>
            <option value="" disabled>Select…</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            {p.category && !categories.some((c) => c.id === p.category) && <option value={p.category}>{p.category}</option>}
          </SF>
          <TF s={s} name="subcategory" label="Subcategory" defaultValue={p.subcategory} />
          <TF s={s} name="brand" label="Brand (optional)" defaultValue={p.brand} list="brand-options" hint="The maker (Rolex, Cartier, Zegna…). Not the category." />
          <datalist id="brand-options">{brands.map((b) => <option key={b} value={b} />)}</datalist>
          <TF s={s} name="model" label="Model (optional)" defaultValue={p.model} />
          <TF s={s} name="finish" label="Finish / material (optional)" defaultValue={p.finish} />
          <TA s={s} name="shortDescription" label="Short description" defaultValue={p.shortDescription} rows={3} required />
          <TA s={s} name="longDescription" label="Long description" defaultValue={p.longDescription} rows={5} />
          <TA s={s} name="highlights" label="Highlights (one per line)" defaultValue={p.highlights.join("\n")} rows={3} />
          <TA s={s} name="includedItems" label="Included items (one per line)" defaultValue={p.includedItems.join("\n")} rows={3} />
        </div>
      </Card>
      <Card title="Pricing & stock">
        <div className="grid gap-4 sm:grid-cols-3">
          <TF s={s} name="priceFrom" label="Original price (AED)" type="number" step="0.01" min={0} defaultValue={p.priceFrom} required />
          <TF s={s} name="priceTo" label="Selling price (AED)" type="number" step="0.01" min={0} defaultValue={p.priceTo} required hint="Lower than the original price = shown as a discount." />
          <div />
          <TF s={s} name="stock" label={variantCount ? "Stock (sum of variants)" : "Stock"} type="number" min={0} defaultValue={p.stock} disabled={variantCount > 0} hint={variantCount ? "Calculated from the variants below." : "Changes are logged in the inventory history."} />
          <TF s={s} name="lowStockThreshold" label="Low-stock threshold" type="number" min={0} defaultValue={p.lowStockThreshold} />
        </div>
      </Card>
      <Card title="Images"><ImagesEditor initial={p.images} />{e.images && <p role="alert" className="mt-2 text-sm text-danger">{e.images}</p>}<p className="mt-2 text-xs text-muted">The first image is the main image.</p></Card>
      <Card title="Variants (colour / size)">
        <VariantsEditor initial={p.variants} onCount={setVariantCount} />
        {e.variants && <p role="alert" className="mt-2 text-sm text-danger">{e.variants}</p>}
      </Card>
      <Card title="Publishing & SEO">
        <div className="grid gap-4 sm:grid-cols-2">
          <SF s={s} name="status" label="Status" defaultValue={p.status}><option value="draft">Draft (hidden)</option><option value="active">Active (visible)</option><option value="archived">Archived</option></SF>
          <TF s={s} name="tags" label="Tags (comma separated)" defaultValue={p.tags.join(", ")} />
          <CB s={s} name="isFeatured" label="Featured on the home page" defaultChecked={p.isFeatured} />
          <CB s={s} name="isNewArrival" label="New arrival" defaultChecked={p.isNewArrival} />
          <CB s={s} name="isMostWanted" label="Most wanted" defaultChecked={p.isMostWanted} />
          <div />
          <TF s={s} name="seoTitle" label="SEO title" defaultValue={p.seo.title} hint="Max 70 characters. Main words first: brand, what it is, colour." />
          <TA s={s} name="seoDesc" label="Meta description" defaultValue={p.seo.description} rows={2} />
          <SeoPreview />
        </div>
      </Card>
      <div className="sticky bottom-3 z-10 flex gap-3 rounded-2xl border border-line bg-surface/95 p-3 shadow-card backdrop-blur"><button disabled={pending} className={btnPrimary}>{pending ? "Saving…" : p.id ? "Save changes" : "Create product"}</button></div>
    </form>
  );
}
