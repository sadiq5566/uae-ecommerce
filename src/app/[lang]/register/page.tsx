import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getDictionary } from "@/lib/dictionaries";
import { isLocale } from "@/lib/i18n";
import { getCurrentUser } from "@/lib/auth/session";
import { safeNext } from "@/lib/auth/guard";
import { AuthShell } from "@/features/auth/auth-shell";
import { RegisterForm } from "@/features/auth/forms";
import { privatePage } from "@/lib/page-meta";


export const generateMetadata = privatePage((t) => t.auth.registerTitle);

export default async function RegisterPage({ params, searchParams }: PageProps<"/[lang]/register">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? safeNext(sp.next, "") : "";
  if (await getCurrentUser()) redirect(next || `/${lang}/account`);
  const t = await getDictionary(lang);
  const q = next ? `?next=${encodeURIComponent(next)}` : "";
  return (
    <AuthShell title={t.auth.registerTitle} sub={t.auth.registerSub}
      footer={<>{t.auth.haveAccount} <Link href={`/${lang}/login${q}`} className="font-semibold text-brand hover:underline">{t.auth.signIn}</Link></>}>
      <RegisterForm locale={lang} t={t} next={next} />
    </AuthShell>
  );
}
