import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDictionary } from "@/lib/dictionaries";
import { isLocale } from "@/lib/i18n";
import { AuthShell } from "@/features/auth/auth-shell";
import { ForgotForm } from "@/features/auth/forms";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function ForgotPage({ params }: PageProps<"/[lang]/forgot-password">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const t = await getDictionary(lang);
  return <AuthShell title={t.auth.forgotTitle} sub={t.auth.forgotSub}><ForgotForm locale={lang} t={t} /></AuthShell>;
}
