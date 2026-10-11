import { notFound } from "next/navigation";
import { getDictionary } from "@/lib/dictionaries";
import { isLocale } from "@/lib/i18n";
import { requireUser } from "@/lib/auth/guard";
import { isStaff } from "@/lib/auth/permissions";
import { ProfileForm } from "@/features/account/profile-form";

export default async function AccountPage({ params }: PageProps<"/[lang]/account">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const user = await requireUser(lang, `/${lang}/account`);
  const t = await getDictionary(lang);
  return (
    <>
      {isStaff(user.role) && <p className="mb-6 inline-block rounded-full bg-gold-soft px-4 py-1.5 text-xs font-semibold text-gold">{t.account.staff}: {user.role}</p>}
      <ProfileForm t={t} user={{ name: user.name, email: user.email, phone: user.phone, locale: user.locale }} />
    </>
  );
}
