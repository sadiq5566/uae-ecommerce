import { notFound, redirect } from "next/navigation";
import { getDictionary } from "@/lib/dictionaries";
import { isLocale } from "@/lib/i18n";
import { requireUser, safeNext } from "@/lib/auth/guard";
import { sendVerifyCodeAction } from "@/features/auth/actions";
import { privatePage } from "@/lib/page-meta";

export const generateMetadata = privatePage((t) => t.auth.verifyNeededTitle);

/** Where unverified customers land when they reach something that needs a verified email (tracking, returns, reviews). */
export default async function VerifyNeededPage({ params, searchParams }: PageProps<"/[lang]/account/verify">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? safeNext(sp.next, "") : "";
  const user = await requireUser(lang, `/${lang}/account/verify`);
  if (user.emailVerified) redirect(next || `/${lang}/account`);
  const t = await getDictionary(lang);
  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-line bg-surface p-7 text-center">
      <p className="text-5xl">✉️</p>
      <h2 className="mt-3 font-display text-2xl font-bold">{t.auth.verifyNeededTitle}</h2>
      <p className="mt-2 text-sm text-muted">{t.auth.verifyNeededBody}</p>
      <p className="mt-3 text-sm font-medium" dir="ltr">{user.email}</p>
      <form action={sendVerifyCodeAction} className="mt-5">
        <input type="hidden" name="locale" value={lang} /><input type="hidden" name="next" value={next} />
        <button className="rounded-xl bg-brand px-6 py-3 font-semibold text-brand-fg transition hover:brightness-110">{t.auth.verifySend}</button>
      </form>
    </div>
  );
}
