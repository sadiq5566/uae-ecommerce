import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getDictionary } from "@/lib/dictionaries";
import { isLocale } from "@/lib/i18n";
import { getCurrentUser } from "@/lib/auth/session";
import { safeNext } from "@/lib/auth/guard";
import { AuthShell } from "@/features/auth/auth-shell";
import { LoginForm } from "@/features/auth/forms";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function LoginPage({ params, searchParams }: PageProps<"/[lang]/login">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? safeNext(sp.next, "") : "";
  if (await getCurrentUser()) redirect(next || `/${lang}/account`);
  const t = await getDictionary(lang);
  const q = next ? `?next=${encodeURIComponent(next)}` : "";
  return (
    <AuthShell title={t.auth.loginTitle} sub={sp.reset ? t.auth.resetDone : t.auth.loginSub}
      footer={<>{t.auth.noAccount} <Link href={`/${lang}/register${q}`} className="font-semibold text-brand hover:underline">{t.auth.signUp}</Link></>}>
      <LoginForm locale={lang} t={t} next={next} />
    </AuthShell>
  );
}
