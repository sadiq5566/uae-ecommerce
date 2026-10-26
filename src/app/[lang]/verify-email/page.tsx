import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getDictionary } from "@/lib/dictionaries";
import { fmt } from "@/lib/format";
import { isLocale } from "@/lib/i18n";
import { getCurrentUser } from "@/lib/auth/session";
import { safeNext } from "@/lib/auth/guard";
import { AuthShell } from "@/features/auth/auth-shell";
import { VerifyForm } from "@/features/auth/forms";
import { privatePage } from "@/lib/page-meta";

export const generateMetadata = privatePage((t) => t.auth.otpTitle);

export default async function VerifyEmailPage({ params, searchParams }: PageProps<"/[lang]/verify-email">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const sp = await searchParams;
  const email = typeof sp.email === "string" ? sp.email.trim().toLowerCase().slice(0, 254) : "";
  const next = typeof sp.next === "string" ? safeNext(sp.next, "") : "";
  const me = await getCurrentUser();
  if (me?.emailVerified) redirect(next || `/${lang}/account`);
  if (!email.includes("@")) redirect(`/${lang}/register`);
  const purpose = sp.purpose === "verify" ? "verify" : "register";
  const t = await getDictionary(lang);
  return (
    <AuthShell title={t.auth.otpTitle} sub={fmt(t.auth.otpSub, { email })}
      footer={<Link href={`/${lang}/${purpose === "register" ? "register" : "login"}`} className="font-semibold text-brand hover:underline">{t.auth.otpWrongEmail}</Link>}>
      <VerifyForm locale={lang} t={t} email={email} purpose={purpose} next={next} skipHref={me ? next || `/${lang}/account` : undefined} />
    </AuthShell>
  );
}
