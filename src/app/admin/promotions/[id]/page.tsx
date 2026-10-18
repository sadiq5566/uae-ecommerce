import { notFound } from "next/navigation";
import { Types } from "mongoose";
import { guard } from "@/lib/admin/guard";
import { connectDb } from "@/lib/db";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { PageHeader, btnDanger } from "@/components/admin/ui";
import { categoryOptions } from "@/features/admin/catalog/queries";
import { deleteCouponAction } from "@/features/admin/commerce/actions";
import { CouponForm, type CouponFormData } from "@/features/admin/commerce/forms";
import { Coupon } from "@/models/coupon";
import { Product } from "@/models/product";

export const metadata = { title: "Edit coupon" };
const local = (d?: Date | null) => (d ? new Date(d.getTime() + 4 * 3600_000).toISOString().slice(0, 16) : "");

export default async function EditCoupon({ params }: PageProps<"/admin/promotions/[id]">) {
  const { id } = await params;
  await guard("promotions:write", `/admin/promotions/${id}`);
  if (!Types.ObjectId.isValid(id)) notFound();
  await connectDb();
  const c = await Coupon.findById(id).lean();
  if (!c) notFound();
  const skus = async (ids: Types.ObjectId[]) => (ids.length ? (await Product.find({ _id: { $in: ids } }, { sku: 1 }).lean()).map((p) => p.sku).join(", ") : "");
  const data: CouponFormData = {
    id: String(c._id), code: c.code, desc: { en: c.description?.en ?? "", ar: c.description?.ar ?? "" }, type: c.type, value: c.value, maxDiscount: c.maxDiscount ?? null, minSubtotal: c.minSubtotal ?? 0,
    startsAt: local(c.startsAt), endsAt: local(c.endsAt), active: c.active, isPublic: c.public ?? false, usageLimit: c.usageLimit ?? null, usedCount: c.usedCount, perCustomerLimit: c.perCustomerLimit ?? 1, stackWithSale: c.stackWithSale,
    productSkus: await skus(c.products ?? []), excludeSkus: await skus(c.excludeProducts ?? []), categories: (c.categories ?? []).map(String), excludeCategories: (c.excludeCategories ?? []).map(String),
  };
  const cats = (await categoryOptions()).map((x) => ({ id: x.id, name: x.name }));
  return (
    <>
      <PageHeader title={c.code} sub={`${c.usedCount} use${c.usedCount === 1 ? "" : "s"}`} actions={<form action={deleteCouponAction}><input type="hidden" name="id" value={id} /><ConfirmButton message={c.usedCount ? "This coupon has been used, so it will be deactivated (history is kept). Continue?" : "Delete this coupon?"} className={btnDanger}>{c.usedCount ? "Deactivate" : "Delete"}</ConfirmButton></form>} />
      <CouponForm key={id} coupon={data} categories={cats} />
    </>
  );
}
