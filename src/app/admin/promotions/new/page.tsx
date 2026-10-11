import { guard } from "@/lib/admin/guard";
import { PageHeader } from "@/components/admin/ui";
import { categoryOptions } from "@/features/admin/catalog/queries";
import { CouponForm } from "@/features/admin/commerce/forms";

export const metadata = { title: "New coupon" };

export default async function NewCoupon() {
  await guard("promotions:write", "/admin/promotions/new");
  const cats = (await categoryOptions()).map((c) => ({ id: c.id, name: c.name }));
  return (<><PageHeader title="New coupon" /><CouponForm categories={cats} /></>);
}
