import { notFound } from "next/navigation";
import { getDictionary } from "@/lib/dictionaries";
import { isLocale } from "@/lib/i18n";
import { AuthShell } from "@/features/auth/auth-shell";
import { ForgotForm } from "@/features/auth/forms";
import { privatePage } from "@/lib/page-meta";


export const generateMetadata = privatePage((t) => t.auth.forgotTitle);

export default async function ForgotPage({ params }: PageProps<"/[lang]/forgot-password">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const t = await getDictionary(lang);
  return <AuthShell title={t.auth.forgotTitle} sub={t.auth.forgotSub}><ForgotForm locale={lang} t={t} /></AuthShell>;
}
