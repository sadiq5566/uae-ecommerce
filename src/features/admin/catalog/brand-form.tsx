"use client";
import { useActionState } from "react";
import { CB, TA, TF } from "@/components/admin/fields";
import { Card, btnPrimary } from "@/components/admin/ui";
import type { FormState } from "@/features/auth/schemas";
import { saveBrandAction } from "./actions";

export type BrandFormData = { id?: string; slug: string; name: string; description: string; logo: string; image: string; isFeatured: boolean; isActive: boolean; sortOrder: number; seo: { title: string; description: string; keywords: string } };
const EMPTY: BrandFormData = { slug: "", name: "", description: "", logo: "", image: "", isFeatured: false, isActive: true, sortOrder: 0, seo: { title: "", description: "", keywords: "" } };

/** A brand: the maker of a product (Rolex, Zegna…). Separate from the category. Renaming it renames the brand on all its products. */
export function BrandForm({ brand }: { brand?: BrandFormData }) {
  const b = brand ?? EMPTY;
  const [s, action, pending] = useActionState<FormState, FormData>(saveBrandAction, {});
  return (
    <form action={action} className="flex flex-col gap-6" noValidate>
      {b.id && <input type="hidden" name="id" value={b.id} />}
      <div aria-live="polite">
        {s.error && <p role="alert" className="rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">{s.error}</p>}
        {s.ok && <p role="status" className="rounded-xl bg-brand-soft px-4 py-3 text-sm text-brand">✓ Saved</p>}
      </div>
      <Card title="Brand">
        <div className="grid gap-4 sm:grid-cols-2">
          <TF s={s} name="name" label="Name" defaultValue={b.name} required hint="Rolex, Zegna, Louis Vuitton…" />
          <TF s={s} name="slug" label="Page address" defaultValue={b.slug} hint="Leave empty to generate it from the name." />
          <TA s={s} name="description" label="About the brand" defaultValue={b.description} rows={3} className="sm:col-span-2" />
          <TF s={s} name="logo" label="Logo URL" defaultValue={b.logo} placeholder="https://…" />
          <TF s={s} name="image" label="Banner image URL" defaultValue={b.image} hint="Empty = a product photo is used." />
          <TF s={s} name="sortOrder" label="Sort order" type="number" min={0} defaultValue={b.sortOrder} hint="Lower numbers show first." />
        </div>
        <div className="mt-4 flex flex-wrap gap-6">
          <CB s={s} name="isFeatured" label="Featured on the home page" defaultChecked={b.isFeatured} />
          <CB s={s} name="isActive" label="Show in the store" defaultChecked={b.isActive} />
        </div>
      </Card>
      <Card title="Search engines (SEO)">
        <div className="grid gap-4">
          <TF s={s} name="seoTitle" label="SEO title" defaultValue={b.seo.title} hint="Max 70 characters. Example: Buy Rolex Watches Online in UAE | Your Store." />
          <TA s={s} name="seoDesc" label="Meta description (max 160 characters)" defaultValue={b.seo.description} rows={2} />
          <TA s={s} name="seoKeywords" label="Keywords / hashtags" defaultValue={b.seo.keywords} rows={2} hint="Words people search for, separated by commas or #hashtags, e.g. #rolex, rolex watches dubai, luxury watches. Up to 25." />
        </div>
      </Card>
      <div className="sticky bottom-3 z-10 flex gap-3 rounded-2xl border border-line bg-surface/95 p-3 shadow-card backdrop-blur"><button disabled={pending} className={btnPrimary}>{pending ? "Saving…" : b.id ? "Save changes" : "Create brand"}</button></div>
    </form>
  );
}
