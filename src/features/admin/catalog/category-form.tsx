"use client";
import { useActionState } from "react";
import { CB, SF, TA, TF } from "@/components/admin/fields";
import { AttrDefsEditor, ImagesEditor, type AttrDef } from "@/components/admin/editors";
import { Card, btnPrimary } from "@/components/admin/ui";
import type { FormState } from "@/features/auth/schemas";
import { saveCategoryAction } from "./actions";

export type CategoryFormData = {
  id?: string; slug: string; name: { en: string; ar: string }; description: { en: string; ar: string }; parent: string | null; icon: string; hue: number;
  image?: string; order: number; active: boolean; attributes: AttrDef[]; seo: { title: { en: string; ar: string }; description: { en: string; ar: string } };
};
const EMPTY: CategoryFormData = { slug: "", name: { en: "", ar: "" }, description: { en: "", ar: "" }, parent: null, icon: "🛍️", hue: 160, order: 0, active: true, attributes: [], seo: { title: { en: "", ar: "" }, description: { en: "", ar: "" } } };

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
          <TF s={s} name="name_en" label="Name (English)" defaultValue={c.name.en} required />
          <TF s={s} name="name_ar" label="Name (Arabic)" defaultValue={c.name.ar} dir="rtl" required />
          <TF s={s} name="slug" label="URL slug" defaultValue={c.slug} hint="Changing it keeps the old URL working (301 redirect)." required />
          <SF s={s} name="parent" label="Parent category" defaultValue={c.parent ?? ""}><option value="">— None (top level) —</option>{parents.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</SF>
          <TA s={s} name="desc_en" label="Description (English)" defaultValue={c.description.en} rows={3} />
          <TA s={s} name="desc_ar" label="Description (Arabic)" defaultValue={c.description.ar} rows={3} dir="rtl" />
          <TF s={s} name="order" label="Sort order" type="number" min={0} defaultValue={c.order} hint="Lower numbers show first." />
          <div className="flex items-end"><CB s={s} name="active" label="Active (visible in the store)" defaultChecked={c.active} /></div>
          <div className="grid grid-cols-2 gap-3"><TF s={s} name="icon" label="Icon" defaultValue={c.icon} /><TF s={s} name="hue" label="Colour (0–360)" type="number" defaultValue={c.hue} /></div>
        </div>
      </Card>
      <Card title="Image"><ImagesEditor name="image" single initial={c.image ? [{ url: c.image, alt: { en: "", ar: "" } }] : []} max={1} />{s.fieldErrors?.image && <p role="alert" className="mt-2 text-sm text-danger">{s.fieldErrors.image}</p>}</Card>
      <Card title="Filter attributes"><p className="mb-3 text-sm text-muted">Products in this category can set a value for each attribute; they become filters on the category page.</p><AttrDefsEditor initial={c.attributes} />{s.fieldErrors?.attributes && <p role="alert" className="mt-2 text-sm text-danger">{s.fieldErrors.attributes}</p>}</Card>
      <Card title="SEO">
        <div className="grid gap-4 sm:grid-cols-2">
          <TF s={s} name="seoTitle_en" label="SEO title (EN)" defaultValue={c.seo.title.en} /><TF s={s} name="seoTitle_ar" label="SEO title (AR)" defaultValue={c.seo.title.ar} dir="rtl" />
          <TA s={s} name="seoDesc_en" label="Meta description (EN)" defaultValue={c.seo.description.en} rows={2} /><TA s={s} name="seoDesc_ar" label="Meta description (AR)" defaultValue={c.seo.description.ar} rows={2} dir="rtl" />
        </div>
      </Card>
      <div className="sticky bottom-3 z-10 flex gap-3 rounded-2xl border border-line bg-surface/95 p-3 shadow-card backdrop-blur"><button disabled={pending} className={btnPrimary}>{pending ? "Saving…" : c.id ? "Save changes" : "Create category"}</button></div>
    </form>
  );
}
