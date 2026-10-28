"use client";
import { useActionState } from "react";
import { SF, TA, TF } from "@/components/admin/fields";
import { ImagesEditor } from "@/components/admin/editors";
import { Card, btnPrimary } from "@/components/admin/ui";
import type { FormState } from "@/features/auth/schemas";
import { saveCategoryAction } from "./actions";

export type CategoryFormData = { id?: string; slug: string; name: string; description: string; image?: string; type: string; parent?: string; sortOrder: number; seoTitle: string; seoDesc: string };
const EMPTY: CategoryFormData = { slug: "", name: "", description: "", type: "category", sortOrder: 50, seoTitle: "", seoDesc: "" };

/** A collection: type "category" lists every product of the category slug in `parent`; style / finish / curated list products tagged with the collection name. */
export function CategoryForm({ category, parents }: { category?: CategoryFormData; parents: { id: string; name: string }[] }) {
  const c = category ?? EMPTY;
  const [s, action, pending] = useActionState<FormState, FormData>(saveCategoryAction, {});
  return (
    <form action={action} className="flex flex-col gap-6" noValidate>
      {c.id && <input type="hidden" name="id" value={c.id} />}
      <div aria-live="polite">
        {s.error && <p role="alert" className="rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">{s.error}</p>}
        {s.ok && <p role="status" className="rounded-xl bg-brand-soft px-4 py-3 text-sm text-brand">✓ Saved</p>}
      </div>
      <Card title="Basics">
        <div className="grid gap-4 sm:grid-cols-2">
          <TF s={s} name="name" label="Name" defaultValue={c.name} required />
          <TF s={s} name="slug" label="URL slug" defaultValue={c.slug} hint="Leave empty to generate it from the name." />
          <SF s={s} name="type" label="Type" defaultValue={c.type}><option value="category">category (all products of a category)</option><option value="style">style</option><option value="finish">finish</option><option value="curated">curated</option></SF>
          <SF s={s} name="parent" label="Category" defaultValue={c.parent ?? ""}><option value="">— none —</option>{parents.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</SF>
          <TA s={s} name="description" label="Description" defaultValue={c.description} rows={3} />
          <TF s={s} name="sortOrder" label="Sort order" type="number" min={0} defaultValue={c.sortOrder} hint="Lower numbers show first." />
        </div>
      </Card>
      <Card title="Search engines (SEO)">
        <div className="grid gap-4">
          <TF s={s} name="seoTitle" label="SEO title" defaultValue={c.seoTitle} hint="Max 70 characters. Example: Buy Watches Online in UAE | Your Store." />
          <TA s={s} name="seoDesc" label="Meta description (max 160 characters)" defaultValue={c.seoDesc} rows={2} />
        </div>
      </Card>
      <Card title="Image"><ImagesEditor name="image" single initial={c.image ? [{ url: c.image, alt: { en: "", ar: "" } }] : []} max={1} />{s.fieldErrors?.image && <p role="alert" className="mt-2 text-sm text-danger">{s.fieldErrors.image}</p>}</Card>
      <div className="sticky bottom-3 z-10 flex gap-3 rounded-2xl border border-line bg-surface/95 p-3 shadow-card backdrop-blur"><button disabled={pending} className={btnPrimary}>{pending ? "Saving…" : c.id ? "Save changes" : "Create collection"}</button></div>
    </form>
  );
}
