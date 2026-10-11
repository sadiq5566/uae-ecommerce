import { notFound } from "next/navigation";
import { getDictionary } from "@/lib/dictionaries";
import { isLocale } from "@/lib/i18n";
import { requireUser } from "@/lib/auth/guard";
import { AddressList } from "@/features/account/address-list";
import { getAddresses } from "@/features/account/service";

export default async function AddressesPage({ params }: PageProps<"/[lang]/account/addresses">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const user = await requireUser(lang, `/${lang}/account/addresses`);
  const [t, addresses] = await Promise.all([getDictionary(lang), getAddresses(user.id)]);
  return <AddressList t={t} addresses={addresses} />;
}
