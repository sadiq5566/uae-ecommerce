import { guard } from "@/lib/admin/guard";
import { PageHeader } from "@/components/admin/ui";
import { SettingsForm } from "@/features/admin/commerce/forms";
import { getSettings } from "@/features/checkout/prepare";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  await guard("settings:write", "/admin/settings");
  const s = await getSettings();
  return (
    <>
      <PageHeader title="Store settings" />
      <SettingsForm d={{ storeName: s.storeName, minOrder: s.minOrder, freeDeliveryThreshold: s.freeDeliveryThreshold, baseDeliveryFee: s.baseDeliveryFee, codEnabled: s.codEnabled, codFee: s.codFee, codMaxOrder: s.codMaxOrder, taxEnabled: s.tax.enabled, taxRate: Math.round(s.tax.rate * 10000) / 100, taxInclusive: s.tax.pricesIncludeTax, pendingPaymentMinutes: s.pendingPaymentMinutes, supportEmail: s.supportEmail ?? undefined, supportPhone: s.supportPhone ?? undefined, logo: s.logo ?? undefined,
        tier: { enabled: !!s.offers?.tier?.enabled, min: s.offers?.tier?.minSubtotal ?? 500, percent: s.offers?.tier?.percent ?? 10, max: s.offers?.tier?.maxDiscount ?? undefined },
        first: { enabled: !!s.offers?.firstOrder?.enabled, percent: s.offers?.firstOrder?.percent ?? 10, max: s.offers?.firstOrder?.maxDiscount ?? undefined },
        modal: { enabled: s.offers?.modal?.enabled ?? true, delay: s.offers?.modal?.delaySeconds ?? 2, version: s.offers?.modal?.version ?? "1", leads: s.offers?.modal?.collectLeads ?? true, title: { en: s.offers?.modal?.title?.en ?? "", ar: s.offers?.modal?.title?.ar ?? "" }, body: { en: s.offers?.modal?.body?.en ?? "", ar: s.offers?.modal?.body?.ar ?? "" } },
        returnWindowDays: s.returnWindowDays ?? 7 }} />
    </>
  );
}
