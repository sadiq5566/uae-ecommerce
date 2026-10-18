"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Types } from "mongoose";
import { FORBIDDEN, actor } from "@/lib/admin/guard";
import { audit } from "@/lib/admin/audit";
import { fail, formObj, isDupKey, issues } from "@/lib/admin/common";
import { connectDb } from "@/lib/db";
import type { FormState } from "@/features/auth/schemas";
import { Coupon } from "@/models/coupon";
import { DeliveryZone } from "@/models/delivery-zone";
import { Product } from "@/models/product";
import { Settings } from "@/models/settings";
import { couponSchema, settingsSchema, zoneSchema } from "./schemas";

/* ------------------------------ coupons ------------------------------ */

export async function saveCouponAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await actor("promotions:write");
  if (!user) return { error: FORBIDDEN };
  const raw = { ...formObj(fd), categories: fd.getAll("categories").map(String), excludeCategories: fd.getAll("excludeCategories").map(String) };
  const parsed = couponSchema.safeParse(raw);
  if (!parsed.success) return fail(issues(parsed.error), fd);
  const c = parsed.data;
  await connectDb();
  const skuToId = async (skus: string[], field: string): Promise<{ ids: string[] } | { err: string; field: string }> => {
    if (!skus.length) return { ids: [] };
    const found = await Product.find({ $or: [{ sku: { $in: skus } }, { "variants.sku": { $in: skus } }] }, { sku: 1, variants: 1 }).lean();
    const have = new Set(found.flatMap((p) => [p.sku, ...(p.variants ?? []).map((v) => v.sku)]));
    const missing = skus.filter((s) => !have.has(s));
    return missing.length ? { err: `Unknown SKU(s): ${missing.slice(0, 5).join(", ")}`, field } : { ids: found.map((p) => String(p._id)) };
  };
  const inc = await skuToId(c.productSkus, "productSkus"); if ("err" in inc) return fail({ [inc.field]: inc.err }, fd);
  const exc = await skuToId(c.excludeSkus, "excludeSkus"); if ("err" in exc) return fail({ [exc.field]: exc.err }, fd);
  const doc = {
    description: { en: c.desc_en, ar: c.desc_ar }, type: c.type, value: c.value, maxDiscount: c.type === "percent" ? c.maxDiscount : undefined, minSubtotal: c.minSubtotal,
    startsAt: c.startsAt, endsAt: c.endsAt, active: c.active, public: c.isPublic, usageLimit: c.usageLimit, perCustomerLimit: c.perCustomerLimit, stackWithSale: c.stackWithSale,
    products: inc.ids, categories: c.categories, excludeProducts: exc.ids, excludeCategories: c.excludeCategories,
  };
  try {
    if (c.id) {
      if (!Types.ObjectId.isValid(c.id)) return { error: "Not found" };
      const cur = await Coupon.findById(c.id);
      if (!cur) return { error: "Coupon not found" };
      if (cur.usedCount > 0 && cur.code !== c.code) return fail({ code: "The code can't be changed after the coupon has been used" }, fd);
      if (c.usageLimit != null && c.usageLimit < cur.usedCount) return fail({ usageLimit: `Already used ${cur.usedCount} times` }, fd);
      cur.set({ ...doc, code: c.code }); await cur.save();
      await audit(user, "coupon.update", "coupon", c.id, `Updated coupon ${c.code}`);
      revalidatePath("/admin/promotions");
      return { ok: true };
    }
    const created = await Coupon.create({ ...doc, code: c.code });
    await audit(user, "coupon.create", "coupon", String(created._id), `Created coupon ${c.code}`);
    revalidatePath("/admin/promotions");
  } catch (e) {
    if (isDupKey(e, "code")) return fail({ code: "This code already exists" }, fd);
    throw e;
  }
  redirect("/admin/promotions?saved=1");
}

export async function deleteCouponAction(fd: FormData) {
  const user = await actor("promotions:write");
  const id = String(fd.get("id") ?? "");
  if (!user || !Types.ObjectId.isValid(id)) return;
  await connectDb();
  const c = await Coupon.findById(id);
  if (!c) return;
  if (c.usedCount > 0) { c.active = false; await c.save(); await audit(user, "coupon.deactivate", "coupon", id, `Deactivated used coupon ${c.code}`); } // history is kept
  else { await c.deleteOne(); await audit(user, "coupon.delete", "coupon", id, `Deleted coupon ${c.code}`); }
  revalidatePath("/admin/promotions"); redirect("/admin/promotions");
}

/* --------------------------- delivery zones --------------------------- */

export async function saveZoneAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await actor("delivery:write");
  if (!user) return { error: FORBIDDEN };
  const parsed = zoneSchema.safeParse({ ...formObj(fd), emirates: fd.getAll("emirates").map(String) });
  if (!parsed.success) return fail(issues(parsed.error), fd);
  const z = parsed.data; const id = String(fd.get("id") ?? "");
  await connectDb();
  if (z.active) {
    const overlap = await DeliveryZone.findOne({ active: true, key: { $ne: z.key }, emirates: { $in: z.emirates } }).lean();
    if (overlap) return fail({ emirates: `An emirate is already covered by the active zone "${overlap.name.en}"` }, fd);
  }
  const doc = { key: z.key, name: { en: z.name_en, ar: z.name_ar }, emirates: z.emirates, fee: z.fee, freeThreshold: z.freeThreshold ?? null, estimate: { en: z.est_en, ar: z.est_ar }, active: z.active };
  try {
    if (id) { if (!Types.ObjectId.isValid(id) || !(await DeliveryZone.findByIdAndUpdate(id, doc))) return { error: "Zone not found" }; }
    else await DeliveryZone.create(doc);
  } catch (e) { if (isDupKey(e, "key")) return fail({ key: "This key is already used" }, fd); throw e; }
  await audit(user, id ? "zone.update" : "zone.create", "delivery_zone", id || z.key, `${id ? "Updated" : "Created"} delivery zone ${z.key}`, { fee: z.fee, active: z.active });
  revalidatePath("/admin/delivery");
  return { ok: true };
}

export async function deleteZoneAction(fd: FormData) {
  const user = await actor("delivery:write");
  const id = String(fd.get("id") ?? "");
  if (!user || !Types.ObjectId.isValid(id)) return;
  await connectDb();
  const z = await DeliveryZone.findByIdAndDelete(id);
  if (z) await audit(user, "zone.delete", "delivery_zone", id, `Deleted delivery zone ${z.key}`);
  revalidatePath("/admin/delivery");
}

/* ------------------------------ settings ------------------------------ */

export async function saveSettingsAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await actor("settings:write");
  if (!user) return { error: FORBIDDEN };
  const parsed = settingsSchema.safeParse(formObj(fd));
  if (!parsed.success) return fail(issues(parsed.error), fd);
  const s = parsed.data;
  await connectDb();
  const prev = await Settings.findOne({ key: "store" }).lean();
  await Settings.updateOne({ key: "store" }, { $set: {
    storeName: { en: s.storeName_en, ar: s.storeName_ar }, minOrder: s.minOrder, freeDeliveryThreshold: s.freeDeliveryThreshold, baseDeliveryFee: s.baseDeliveryFee,
    codEnabled: s.codEnabled, codFee: s.codFee, codMaxOrder: s.codMaxOrder,
    "tax.enabled": s.taxEnabled, "tax.rate": s.taxRate / 100, "tax.pricesIncludeTax": s.taxInclusive,
    "offers.tier.enabled": s.tierEnabled, "offers.tier.minSubtotal": s.tierMin, "offers.tier.percent": s.tierPercent, "offers.tier.maxDiscount": s.tierMax ?? null,
    "offers.firstOrder.enabled": s.firstEnabled, "offers.firstOrder.percent": s.firstPercent, "offers.firstOrder.maxDiscount": s.firstMax ?? null,
    "offers.modal.enabled": s.modalEnabled, "offers.modal.delaySeconds": s.modalDelay, "offers.modal.version": s.modalVersion, "offers.modal.collectLeads": s.modalLeads,
    "offers.modal.title": { en: s.modalTitle_en || null, ar: s.modalTitle_ar || null }, "offers.modal.body": { en: s.modalBody_en || null, ar: s.modalBody_ar || null },
    returnWindowDays: s.returnWindowDays,
    pendingPaymentMinutes: s.pendingPaymentMinutes, supportEmail: s.supportEmail, supportPhone: s.supportPhone, logo: s.logo,
  } }, { upsert: true });
  await audit(user, "settings.update", "settings", "store", "Updated store settings", {
    taxChanged: prev?.tax?.enabled !== s.taxEnabled || prev?.tax?.rate !== s.taxRate / 100, codChanged: prev?.codEnabled !== s.codEnabled || prev?.codFee !== s.codFee,
  });
  revalidatePath("/admin/settings"); revalidatePath("/[lang]", "layout");
  return { ok: true };
}
