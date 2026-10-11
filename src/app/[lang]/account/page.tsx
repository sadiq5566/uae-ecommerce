import { notFound } from "next/navigation";
import { getDictionary } from "@/lib/dictionaries";
import { isLocale } from "@/lib/i18n";
import { requireUser } from "@/lib/auth/guard";
import { isStaff } from "@/lib/auth/permissions";
import { PasswordForm, ProfileForm } from "@/features/account/profile-form";
import { privatePage } from "@/lib/page-meta";

export const generateMetadata = privatePage((t) => t.account.title);

export default async function AccountPage({ params }: PageProps<"/[lang]/account">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const user = await requireUser(lang, `/${lang}/account`);
  const t = await getDictionary(lang);
  return (
    <>
      {isStaff(user.role) && <p className="mb-6 inline-block rounded-full bg-gold-soft px-4 py-1.5 text-xs font-semibold text-gold-ink">{t.account.staff}: {user.role}</p>}
      <ProfileForm t={t} user={{ name: user.name, email: user.email, phone: user.phone, locale: user.locale }} />
      <h2 className="mb-4 mt-12 font-display text-xl font-bold">{t.account.security}</h2>
      <PasswordForm t={t} />
    </>
  );
}
