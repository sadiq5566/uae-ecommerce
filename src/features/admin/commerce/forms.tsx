"use client";
import { useActionState } from "react";
import { CB, SF, TA, TF } from "@/components/admin/fields";
import { ImagesEditor } from "@/components/admin/editors";
import { Card, btnGhost, btnPrimary } from "@/components/admin/ui";
import type { FormState } from "@/features/auth/schemas";
import { saveCouponAction, saveSettingsAction, saveZoneAction } from "./actions";

const Banner = ({ s }: { s: FormState }) => (
  <div aria-live="polite">{s.error && <p role="alert" className="rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">{s.error}</p>}{s.ok && <p role="status" className="rounded-xl bg-brand-soft px-4 py-3 text-sm text-brand">✓ Saved</p>}</div>
);
const Save = ({ pending, children }: { pending: boolean; children: React.ReactNode }) => <div className="sticky bottom-3 z-10 flex gap-3 rounded-2xl border border-line bg-surface/95 p-3 shadow-card backdrop-blur"><button disabled={pending} className={btnPrimary}>{pending ? "Saving…" : children}</button></div>;

export type CouponFormData = {
  id?: string; code: string; desc: { en: string; ar: string }; type: string; value: number; maxDiscount?: number | null; minSubtotal: number; startsAt: string; endsAt: string; active: boolean;
  usageLimit?: number | null; usedCount?: number; perCustomerLimit: number; stackWithSale: boolean; productSkus: string; excludeSkus: string; categories: string[]; excludeCategories: string[];
};
const EMPTY_COUPON: CouponFormData = { code: "", desc: { en: "", ar: "" }, type: "percent", value: 10, minSubtotal: 0, startsAt: "", endsAt: "", active: true, perCustomerLimit: 1, stackWithSale: false, productSkus: "", excludeSkus: "", categories: [], excludeCategories: [] };

export function CouponForm({ coupon, categories }: { coupon?: CouponFormData; categories: { id: string; name: string }[] }) {
  const c = coupon ?? EMPTY_COUPON;
  const [s, action, pending] = useActionState<FormState, FormData>(saveCouponAction, {});
  const catBox = (name: string, selected: string[]) => (
    <div className="flex flex-wrap gap-x-4 gap-y-2">{categories.map((k) => <label key={k.id} className="flex items-center gap-2 text-sm"><input type="checkbox" name={name} value={k.id} defaultChecked={selected.includes(k.id)} className="size-4 accent-[var(--brand)]" />{k.name}</label>)}</div>
  );
  return (
    <form action={action} className="flex flex-col gap-6" noValidate>
      {c.id && <input type="hidden" name="id" value={c.id} />}<Banner s={s} />
      <Card title="Discount">
        <div className="grid gap-4 sm:grid-cols-3">
          <TF s={s} name="code" label="Coupon code" defaultValue={c.code} readOnly={!!c.usedCount} hint={c.usedCount ? "Locked: already used." : "Customers type this at checkout."} required />
          <SF s={s} name="type" label="Type" defaultValue={c.type}><option value="percent">Percentage</option><option value="fixed">Fixed amount (AED)</option></SF>
          <TF s={s} name="value" label="Value" type="number" step="0.01" min={0} defaultValue={c.value} required />
          <TF s={s} name="maxDiscount" label="Max discount (AED, percent only)" type="number" step="0.01" min={0} defaultValue={c.maxDiscount ?? ""} />
          <TF s={s} name="minSubtotal" label="Minimum eligible subtotal (AED)" type="number" step="0.01" min={0} defaultValue={c.minSubtotal} />
          <div className="flex items-end"><CB s={s} name="active" label="Active" defaultChecked={c.active} /></div>
          <TF s={s} name="desc_en" label="Description (EN)" defaultValue={c.desc.en} /><TF s={s} name="desc_ar" label="Description (AR)" defaultValue={c.desc.ar} dir="rtl" />
        </div>
      </Card>
      <Card title="Validity & limits">
        <div className="grid gap-4 sm:grid-cols-3">
          <TF s={s} name="startsAt" label="Starts (UAE time)" type="datetime-local" defaultValue={c.startsAt} /><TF s={s} name="endsAt" label="Ends (UAE time)" type="datetime-local" defaultValue={c.endsAt} /><div />
          <TF s={s} name="usageLimit" label="Total usage limit" type="number" min={1} defaultValue={c.usageLimit ?? ""} hint={c.usedCount ? `Used ${c.usedCount} time(s).` : "Empty = unlimited"} />
          <TF s={s} name="perCustomerLimit" label="Uses per customer" type="number" min={1} defaultValue={c.perCustomerLimit} />
          <div className="flex items-end"><CB s={s} name="stackWithSale" label="Also apply to items already on sale" defaultChecked={c.stackWithSale} /></div>
        </div>
        <p className="mt-3 text-xs text-muted">Only one coupon can be used per order. By default coupons don&apos;t apply to items that already have a sale price.</p>
      </Card>
      <Card title="Applies to">
        <p className="mb-3 text-sm text-muted">Leave everything empty to apply to the whole cart.</p>
        <div className="grid gap-4 sm:grid-cols-2"><div><p className="mb-2 text-sm font-medium">Only these categories</p>{catBox("categories", c.categories)}</div><div><p className="mb-2 text-sm font-medium">Exclude these categories</p>{catBox("excludeCategories", c.excludeCategories)}</div>
          <TA s={s} name="productSkus" label="Only these product SKUs (comma separated)" defaultValue={c.productSkus} rows={2} /><TA s={s} name="excludeSkus" label="Exclude these product SKUs" defaultValue={c.excludeSkus} rows={2} /></div>
      </Card>
      <Save pending={pending}>{c.id ? "Save coupon" : "Create coupon"}</Save>
    </form>
  );
}

export type ZoneData = { id?: string; key: string; name: { en: string; ar: string }; emirates: string[]; fee: number; freeThreshold?: number | null; estimate: { en: string; ar: string }; active: boolean };

export function ZoneForm({ zone, emirates, onDone }: { zone?: ZoneData; emirates: { value: string; label: string }[]; onDone?: () => void }) {
  const z = zone ?? { key: "", name: { en: "", ar: "" }, emirates: [], fee: 15, estimate: { en: "", ar: "" }, active: true };
  const [s, action, pending] = useActionState<FormState, FormData>(async (p, fd) => { const r = await saveZoneAction(p, fd); if (r.ok) onDone?.(); return r; }, {});
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-3" noValidate>
      {z.id && <input type="hidden" name="id" value={z.id} />}
      <div className="sm:col-span-3"><Banner s={s} /></div>
      <TF s={s} name="key" label="Key" defaultValue={z.key} readOnly={!!z.id} /><TF s={s} name="name_en" label="Name (EN)" defaultValue={z.name.en} /><TF s={s} name="name_ar" label="Name (AR)" defaultValue={z.name.ar} dir="rtl" />
      <TF s={s} name="fee" label="Delivery fee (AED)" type="number" step="0.01" min={0} defaultValue={z.fee} /><TF s={s} name="freeThreshold" label="Free over (AED, optional)" type="number" step="0.01" min={0} defaultValue={z.freeThreshold ?? ""} hint="Empty = store-wide threshold" /><div className="flex items-end"><CB s={s} name="active" label="Active" defaultChecked={z.active} /></div>
      <TF s={s} name="est_en" label="Estimate (EN)" defaultValue={z.estimate.en} hint="e.g. 1–2 business days" /><TF s={s} name="est_ar" label="Estimate (AR)" defaultValue={z.estimate.ar} dir="rtl" />
      <fieldset className="sm:col-span-3"><legend className="mb-1.5 text-sm font-medium">Emirates covered</legend><div className="flex flex-wrap gap-x-4 gap-y-2">{emirates.map((e) => <label key={e.value} className="flex items-center gap-2 text-sm"><input type="checkbox" name="emirates" value={e.value} defaultChecked={z.emirates.includes(e.value)} className="size-4 accent-[var(--brand)]" />{e.label}</label>)}</div>{s.fieldErrors?.emirates && <p role="alert" className="mt-1.5 text-sm text-danger">{s.fieldErrors.emirates}</p>}</fieldset>
      <div className="sm:col-span-3"><button disabled={pending} className={z.id ? btnGhost : btnPrimary}>{pending ? "Saving…" : z.id ? "Save zone" : "Add zone"}</button></div>
    </form>
  );
}

export type SettingsData = { storeName: { en: string; ar: string }; minOrder: number; freeDeliveryThreshold: number; baseDeliveryFee: number; codEnabled: boolean; codFee: number; codMaxOrder: number; taxEnabled: boolean; taxRate: number; taxInclusive: boolean; pendingPaymentMinutes: number; supportEmail?: string; supportPhone?: string; logo?: string };

export function SettingsForm({ d }: { d: SettingsData }) {
  const [s, action, pending] = useActionState<FormState, FormData>(saveSettingsAction, {});
  return (
    <form action={action} className="flex flex-col gap-6" noValidate>
      <Banner s={s} />
      <Card title="Store">
        <div className="grid gap-4 sm:grid-cols-2"><TF s={s} name="storeName_en" label="Store name (EN)" defaultValue={d.storeName.en} /><TF s={s} name="storeName_ar" label="Store name (AR)" defaultValue={d.storeName.ar} dir="rtl" />
          <TF s={s} name="supportEmail" label="Support email" type="email" defaultValue={d.supportEmail} /><TF s={s} name="supportPhone" label="Support phone" defaultValue={d.supportPhone} /></div>
        <div className="mt-4"><p className="mb-2 text-sm font-medium">Logo</p><ImagesEditor name="logo" single max={1} initial={d.logo ? [{ url: d.logo, alt: { en: "", ar: "" } }] : []} />{s.fieldErrors?.logo && <p role="alert" className="mt-2 text-sm text-danger">{s.fieldErrors.logo}</p>}</div>
        <p className="mt-3 text-xs text-muted">Currency is AED. Languages: English and Arabic.</p>
      </Card>
      <Card title="Delivery rules (store-wide)">
        <div className="grid gap-4 sm:grid-cols-3"><TF s={s} name="minOrder" label="Minimum order (AED)" type="number" step="0.01" min={0} defaultValue={d.minOrder} /><TF s={s} name="freeDeliveryThreshold" label="Free delivery from (AED)" type="number" step="0.01" min={0} defaultValue={d.freeDeliveryThreshold} hint="0 = never free" /><TF s={s} name="baseDeliveryFee" label="Fallback delivery fee (AED)" type="number" step="0.01" min={0} defaultValue={d.baseDeliveryFee} /></div>
        <p className="mt-3 text-xs text-muted">Fees per emirate live under Delivery → zones. A zone can override the free-delivery threshold.</p>
      </Card>
      <Card title="Cash on delivery">
        <div className="grid gap-4 sm:grid-cols-3"><div className="flex items-end"><CB s={s} name="codEnabled" label="Offer cash on delivery" defaultChecked={d.codEnabled} /></div><TF s={s} name="codFee" label="COD fee (AED)" type="number" step="0.01" min={0} defaultValue={d.codFee} /><TF s={s} name="codMaxOrder" label="Max COD order (AED)" type="number" step="0.01" min={0} defaultValue={d.codMaxOrder} hint="0 = no limit" /></div>
      </Card>
      <Card title="VAT / tax">
        <div className="grid gap-4 sm:grid-cols-3"><div className="flex items-end"><CB s={s} name="taxEnabled" label="Show/charge VAT" defaultChecked={d.taxEnabled} /></div><TF s={s} name="taxRate" label="Rate (%)" type="number" step="0.01" min={0} max={100} defaultValue={d.taxRate} /><div className="flex items-end"><CB s={s} name="taxInclusive" label="Prices already include VAT" defaultChecked={d.taxInclusive} /></div></div>
        <p className="mt-3 rounded-xl bg-gold-soft px-4 py-3 text-xs text-gold">⚠ Off by default. Confirm your VAT registration and invoicing rules with your accountant before enabling — this store does not assume any tax treatment.</p>
      </Card>
      <Card title="Payments">
        <div className="grid gap-4 sm:grid-cols-3"><TF s={s} name="pendingPaymentMinutes" label="Online payment window (minutes)" type="number" min={5} defaultValue={d.pendingPaymentMinutes} hint="Unpaid orders are cancelled and stock released after this." /></div>
        <p className="mt-3 text-xs text-muted">Payment gateway keys and webhook secrets are never stored here — they are server environment variables (see docs).</p>
      </Card>
      <Save pending={pending}>Save settings</Save>
    </form>
  );
}
