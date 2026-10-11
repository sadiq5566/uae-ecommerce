"use client";
import { useActionState, useState } from "react";
import { CB, SF, TA, TF } from "@/components/admin/fields";
import { ImagesEditor } from "@/components/admin/editors";
import { Card, btnGhost, btnPrimary, inputCls } from "@/components/admin/ui";
import type { FormState } from "@/features/auth/schemas";
import { saveArticleAction, saveHomepageAction, savePageAction } from "./actions";

const Banner = ({ s }: { s: FormState }) => (
  <div aria-live="polite">{s.error && <p role="alert" className="rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">{s.error}</p>}{s.ok && <p role="status" className="rounded-xl bg-brand-soft px-4 py-3 text-sm text-brand">✓ Saved</p>}</div>
);
const Save = ({ pending, children }: { pending: boolean; children: React.ReactNode }) => <div className="sticky bottom-3 z-10 flex gap-3 rounded-2xl border border-line bg-surface/95 p-3 shadow-card backdrop-blur"><button disabled={pending} className={btnPrimary}>{pending ? "Saving…" : children}</button></div>;

export type ArticleData = { id?: string; slug: string; title: { en: string; ar: string }; excerpt: { en: string; ar: string }; body: { en: string; ar: string }; category?: string; author?: string; cover?: string; coverAlt: { en: string; ar: string }; icon: string; hue: number; status: string; publishAt: string; seo: { title: { en: string; ar: string }; description: { en: string; ar: string } } };
const EMPTY_ARTICLE: ArticleData = { slug: "", title: { en: "", ar: "" }, excerpt: { en: "", ar: "" }, body: { en: "", ar: "" }, coverAlt: { en: "", ar: "" }, icon: "📰", hue: 160, status: "draft", publishAt: "", seo: { title: { en: "", ar: "" }, description: { en: "", ar: "" } } };

export function ArticleForm({ article }: { article?: ArticleData }) {
  const a = article ?? EMPTY_ARTICLE;
  const [s, action, pending] = useActionState<FormState, FormData>(saveArticleAction, {});
  return (
    <form action={action} className="flex flex-col gap-6" noValidate>
      {a.id && <input type="hidden" name="id" value={a.id} />}<Banner s={s} />
      <Card title="Content"><div className="grid gap-4 sm:grid-cols-2">
        <TF s={s} name="title_en" label="Title (EN)" defaultValue={a.title.en} /><TF s={s} name="title_ar" label="Title (AR)" defaultValue={a.title.ar} dir="rtl" />
        <TF s={s} name="slug" label="URL slug" defaultValue={a.slug} /><TF s={s} name="category" label="Category label" defaultValue={a.category} hint="e.g. Guides" />
        <TA s={s} name="excerpt_en" label="Summary (EN)" defaultValue={a.excerpt.en} rows={2} /><TA s={s} name="excerpt_ar" label="Summary (AR)" defaultValue={a.excerpt.ar} rows={2} dir="rtl" />
        <TA s={s} name="body_en" label="Body (EN)" defaultValue={a.body.en} rows={12} /><TA s={s} name="body_ar" label="Body (AR)" defaultValue={a.body.ar} rows={12} dir="rtl" />
      </div><p className="mt-2 text-xs text-muted">Formatting: blank line = new paragraph · <code>## Heading</code> · lines starting with <code>- </code> make a list. HTML is not allowed (shown as plain text).</p></Card>
      <Card title="Cover image"><ImagesEditor name="cover" single max={1} initial={a.cover ? [{ url: a.cover, alt: { en: "", ar: "" } }] : []} />
        <div className="mt-3 grid gap-4 sm:grid-cols-2"><TF s={s} name="coverAlt_en" label="Alt text (EN)" defaultValue={a.coverAlt.en} /><TF s={s} name="coverAlt_ar" label="Alt text (AR)" defaultValue={a.coverAlt.ar} dir="rtl" /><TF s={s} name="icon" label="Placeholder icon (no cover)" defaultValue={a.icon} /><TF s={s} name="hue" label="Colour (0–360)" type="number" defaultValue={a.hue} /></div>{s.fieldErrors?.cover && <p role="alert" className="mt-2 text-sm text-danger">{s.fieldErrors.cover}</p>}</Card>
      <Card title="Publishing"><div className="grid gap-4 sm:grid-cols-3">
        <SF s={s} name="status" label="Status" defaultValue={a.status}><option value="draft">Draft</option><option value="published">Published</option></SF>
        <TF s={s} name="publishAt" label="Publish at (UAE time, optional)" type="datetime-local" defaultValue={a.publishAt} hint="A future time schedules a published article." /><TF s={s} name="author" label="Author" defaultValue={a.author} />
        <TF s={s} name="seoTitle_en" label="SEO title (EN)" defaultValue={a.seo.title.en} /><TF s={s} name="seoTitle_ar" label="SEO title (AR)" defaultValue={a.seo.title.ar} dir="rtl" /><div />
        <TA s={s} name="seoDesc_en" label="Meta description (EN)" defaultValue={a.seo.description.en} rows={2} /><TA s={s} name="seoDesc_ar" label="Meta description (AR)" defaultValue={a.seo.description.ar} rows={2} dir="rtl" /></div></Card>
      <Save pending={pending}>{a.id ? "Save article" : "Create article"}</Save>
    </form>
  );
}

export function PageForm({ page }: { page: { slug: string; title: { en: string; ar: string }; body: { en: string; ar: string }; published: boolean } }) {
  const [s, action, pending] = useActionState<FormState, FormData>(savePageAction, {});
  return (
    <form action={action} className="flex flex-col gap-6" noValidate>
      <input type="hidden" name="slug" value={page.slug} /><Banner s={s} />
      <Card><div className="grid gap-4 sm:grid-cols-2">
        <TF s={s} name="title_en" label="Title (EN)" defaultValue={page.title.en} /><TF s={s} name="title_ar" label="Title (AR)" defaultValue={page.title.ar} dir="rtl" />
        <TA s={s} name="body_en" label="Text (EN)" defaultValue={page.body.en} rows={14} /><TA s={s} name="body_ar" label="Text (AR)" defaultValue={page.body.ar} rows={14} dir="rtl" />
      </div><div className="mt-4"><CB s={s} name="published" label="Published (visible in the store)" defaultChecked={page.published} /></div>
      <p className="mt-3 rounded-xl bg-gold-soft px-4 py-3 text-xs text-gold">Legal and policy text (privacy, terms, returns…) must be written or approved by you. This store doesn&apos;t generate legal copy; Arabic text should be reviewed by a native speaker.</p></Card>
      <Save pending={pending}>Save page</Save>
    </form>
  );
}

type L = { en: string; ar: string };
export type BannerData = { id: string; active: boolean; order: number; eyebrow: L; title: L; subtitle: L; ctaLabel: L; ctaHref: string; image?: string; hue: number; startsAt: string; endsAt: string };
const newBanner = (): BannerData => ({ id: `b${Date.now().toString(36)}`, active: true, order: 0, eyebrow: { en: "", ar: "" }, title: { en: "", ar: "" }, subtitle: { en: "", ar: "" }, ctaLabel: { en: "", ar: "" }, ctaHref: "", hue: 160, startsAt: "", endsAt: "" });

export function HomepageForm({ banners: initial, sections }: { banners: BannerData[]; sections: Record<string, boolean> }) {
  const [s, action, pending] = useActionState<FormState, FormData>(saveHomepageAction, {});
  const [banners, setBanners] = useState<BannerData[]>(initial);
  const set = (i: number, p: Partial<BannerData>) => setBanners((b) => b.map((x, k) => (k === i ? { ...x, ...p } : x)));
  const l = (i: number, f: "eyebrow" | "title" | "subtitle" | "ctaLabel", lang: "en" | "ar", v: string) => set(i, { [f]: { ...banners[i][f], [lang]: v } } as Partial<BannerData>);
  const sectionLabels: [string, string][] = [["deals", "Deals"], ["featured", "Featured products"], ["newArrivals", "New arrivals"], ["popular", "Best sellers"], ["mostViewed", "Most viewed"], ["journal", "Journal / articles"]];
  return (
    <form action={action} className="flex flex-col gap-6" noValidate>
      <input type="hidden" name="banners" value={JSON.stringify(banners)} /><Banner s={s} />
      {s.fieldErrors?.banners && <p role="alert" className="text-sm text-danger">{s.fieldErrors.banners}</p>}
      <Card title="Hero banners & campaigns" actions={<button type="button" disabled={banners.length >= 8} onClick={() => setBanners([...banners, newBanner()])} className={btnGhost}>+ Add banner</button>}>
        {banners.length === 0 && <p className="text-sm text-muted">No banners: the store shows its default hero. Add one to run a campaign; with several, they rotate.</p>}
        <div className="flex flex-col gap-5">
          {banners.map((b, i) => (
            <div key={b.id} className="rounded-xl border border-line p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={b.active} onChange={(e) => set(i, { active: e.target.checked })} className="size-4 accent-[var(--brand)]" />Active</label><div className="flex gap-2"><label className="text-xs text-muted">Order <input type="number" min={0} value={b.order} onChange={(e) => set(i, { order: Number(e.target.value) })} className={`${inputCls} ms-1 inline-block !w-20`} /></label><button type="button" onClick={() => setBanners(banners.filter((_, k) => k !== i))} className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger/10">Remove</button></div></div>
              <div className="grid gap-3 sm:grid-cols-2">
                {(["eyebrow", "title", "subtitle", "ctaLabel"] as const).flatMap((f) => (["en", "ar"] as const).map((lang) => (
                  <label key={f + lang} className="text-xs font-medium text-muted">{f === "ctaLabel" ? "Button text" : f[0].toUpperCase() + f.slice(1)} ({lang.toUpperCase()})<input value={b[f][lang]} dir={lang === "ar" ? "rtl" : "ltr"} onChange={(e) => l(i, f, lang, e.target.value)} className={`${inputCls} mt-1 text-fg`} /></label>
                )))}
                <label className="text-xs font-medium text-muted">Button link (/en/deals or https://…)<input value={b.ctaHref} onChange={(e) => set(i, { ctaHref: e.target.value })} className={`${inputCls} mt-1 text-fg`} placeholder="/deals" /></label>
                <label className="text-xs font-medium text-muted">Colour (0–360)<input type="number" value={b.hue} onChange={(e) => set(i, { hue: Number(e.target.value) })} className={`${inputCls} mt-1 text-fg`} /></label>
                <label className="text-xs font-medium text-muted">Starts (UAE time)<input type="datetime-local" value={b.startsAt} onChange={(e) => set(i, { startsAt: e.target.value })} className={`${inputCls} mt-1 text-fg`} /></label>
                <label className="text-xs font-medium text-muted">Ends (UAE time)<input type="datetime-local" value={b.endsAt} onChange={(e) => set(i, { endsAt: e.target.value })} className={`${inputCls} mt-1 text-fg`} /></label>
              </div>
              <div className="mt-3"><p className="mb-1 text-xs font-medium text-muted">Background image (optional)</p><ImagesEditor name={`img-${b.id}`} single max={1} initial={b.image ? [{ url: b.image, alt: { en: "", ar: "" } }] : []} onUrl={(u) => set(i, { image: u })} /></div>
            </div>
          ))}
        </div>
      </Card>
      <Card title="Home page sections"><div className="grid gap-3 sm:grid-cols-3">{sectionLabels.map(([k, label]) => <CB key={k} s={s} name={`s_${k}`} label={label} defaultChecked={sections[k] !== false} />)}</div><p className="mt-3 text-xs text-muted">Category tiles follow the category sort order (Categories → Sort order).</p></Card>
      <Save pending={pending}>Save homepage</Save>
    </form>
  );
}
