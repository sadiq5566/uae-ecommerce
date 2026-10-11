import { guard } from "@/lib/admin/guard";
import { connectDb } from "@/lib/db";
import { PageHeader } from "@/components/admin/ui";
import { EMIRATES } from "@/features/auth/schemas";
import { ZonesManager } from "@/features/admin/commerce/zones-manager";
import { DeliveryZone } from "@/models/delivery-zone";

export const metadata = { title: "Delivery" };
const labels: Record<string, string> = { "abu-dhabi": "Abu Dhabi", dubai: "Dubai", sharjah: "Sharjah", ajman: "Ajman", "umm-al-quwain": "Umm Al Quwain", "ras-al-khaimah": "Ras Al Khaimah", fujairah: "Fujairah" };

export default async function DeliveryPage() {
  await guard("delivery:write", "/admin/delivery");
  await connectDb();
  const zones = await DeliveryZone.find().sort({ fee: 1 }).lean();
  const covered = new Set(zones.filter((z) => z.active).flatMap((z) => z.emirates));
  const uncovered = EMIRATES.filter((e) => !covered.has(e));
  return (
    <>
      <PageHeader title="Delivery zones" sub="Fee, free-delivery threshold and estimate per group of emirates. Store-wide rules (minimum order, COD) are under Settings." />
      {uncovered.length > 0 && <p role="alert" className="mb-4 rounded-xl bg-gold-soft px-4 py-3 text-sm text-gold-ink">⚠ Not covered by an active zone (customers there can&apos;t check out): {uncovered.map((e) => labels[e]).join(", ")}</p>}
      <ZonesManager emirates={EMIRATES.map((e) => ({ value: e, label: labels[e] }))} zones={zones.map((z) => ({ id: String(z._id), key: z.key, name: z.name, emirates: z.emirates, fee: z.fee, freeThreshold: z.freeThreshold ?? null, estimate: z.estimate, active: z.active }))} />
    </>
  );
}
