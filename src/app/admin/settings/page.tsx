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
      <SettingsForm d={{ storeName: s.storeName, minOrder: s.minOrder, freeDeliveryThreshold: s.freeDeliveryThreshold, baseDeliveryFee: s.baseDeliveryFee, codEnabled: s.codEnabled, codFee: s.codFee, codMaxOrder: s.codMaxOrder, taxEnabled: s.tax.enabled, taxRate: Math.round(s.tax.rate * 10000) / 100, taxInclusive: s.tax.pricesIncludeTax, pendingPaymentMinutes: s.pendingPaymentMinutes, supportEmail: s.supportEmail ?? undefined, supportPhone: s.supportPhone ?? undefined, logo: s.logo ?? undefined }} />
    </>
  );
}
