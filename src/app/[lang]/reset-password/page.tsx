import { notFound } from "next/navigation";
import { getDictionary } from "@/lib/dictionaries";
import { isLocale } from "@/lib/i18n";
import { AuthShell } from "@/features/auth/auth-shell";
import { ResetForm } from "@/features/auth/forms";
import { privatePage } from "@/lib/page-meta";

// Tokens in URLs must never leak via Referer or be indexed.

export const generateMetadata = privatePage((t) => t.auth.resetTitle, { referrer: "no-referrer" });

export default async function ResetPage({ params, searchParams }: PageProps<"/[lang]/reset-password">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const sp = await searchParams;
  const token = typeof sp.token === "string" ? sp.token : "";
  const t = await getDictionary(lang);
  return (
    <AuthShell title={t.auth.resetTitle}>
      {token ? <ResetForm locale={lang} t={t} token={token} /> : <p role="alert" className="text-sm text-danger">{t.errors.reset_invalid}</p>}
    </AuthShell>
  );
}
