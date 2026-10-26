import Link from "next/link";
import { notFound } from "next/navigation";
import { getDictionary } from "@/lib/dictionaries";
import { fmt } from "@/lib/format";
import { formatAED, isLocale } from "@/lib/i18n";
import { requireUser } from "@/lib/auth/guard";
import { creditHistory, creditSummary, CREDIT_VALID_DAYS } from "@/features/credit/service";
import { privatePage } from "@/lib/page-meta";

export const generateMetadata = privatePage((t) => t.credit.title);

const tone = { active: "bg-brand-soft text-brand", used: "bg-surface-2 text-muted", expired: "bg-danger/10 text-danger" } as const;

export default async function CreditPage({ params }: PageProps<"/[lang]/account/credit">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const user = await requireUser(lang, `/${lang}/account/credit`);
  const [t, sum, history] = await Promise.all([getDictionary(lang), creditSummary(user.id), creditHistory(user.id)]);
  const fdate = new Intl.DateTimeFormat(lang === "ar" ? "ar-AE" : "en-AE", { dateStyle: "medium", timeZone: "Asia/Dubai" });
  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-3xl bg-brand p-6 text-brand-fg sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-widest opacity-90">{t.credit.title}</p>
        <p className="mt-1 font-display text-4xl font-bold" dir="ltr">{formatAED(sum.balance, lang)}</p>
        <p className="mt-2 text-sm opacity-90">{sum.balanceFils > 0 && sum.nextExpiry ? fmt(t.credit.nextExpiry, { d: fdate.format(sum.nextExpiry) }) : fmt(t.credit.howItWorks, { days: CREDIT_VALID_DAYS })}</p>
        {sum.expiringFils > 0 && <p role="status" className="mt-3 rounded-xl bg-white/15 px-4 py-2 text-sm font-medium">⏳ {fmt(t.credit.expiringSoon, { amount: formatAED(sum.expiringFils / 100, lang) })}</p>}
        <Link href={`/${lang}`} className="mt-5 inline-block rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-brand transition hover:brightness-95">{t.credit.shop}</Link>
      </section>

      <section aria-labelledby="cr-how" className="rounded-2xl border border-line bg-surface p-5 text-sm">
        <h2 id="cr-how" className="font-semibold">{t.credit.aboutTitle}</h2>
        <ul className="mt-2 list-disc ps-5 text-muted marker:text-brand">
          <li>{fmt(t.credit.aboutRefund, { days: CREDIT_VALID_DAYS })}</li>
          <li>{t.credit.aboutUse}</li>
          <li>{t.credit.aboutOldest}</li>
          <li>{t.credit.aboutCancel}</li>
        </ul>
      </section>

      <section aria-labelledby="cr-hist">
        <h2 id="cr-hist" className="mb-3 font-display text-xl font-bold">{t.credit.history}</h2>
        {history.length === 0 ? <p className="rounded-2xl border border-dashed border-line p-8 text-center text-sm text-muted">{t.credit.empty}</p> : (
          <ul className="flex flex-col gap-3">
            {history.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-4 text-sm">
                <div>
                  <p className="font-semibold">{l.source === "return" ? fmt(t.credit.fromReturn, { n: l.ref ?? "" }) : t.credit.fromStore} · <span dir="ltr">{formatAED(l.amount, lang)}</span></p>
                  <p className="text-xs text-muted">{fmt(t.credit.issued, { d: fdate.format(l.issuedAt) })} · {l.state === "expired" ? fmt(t.credit.expiredOn, { d: fdate.format(l.expiresAt) }) : fmt(t.credit.validUntil, { d: fdate.format(l.expiresAt) })}</p>
                </div>
                <div className="text-end">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${tone[l.state]}`}>{t.credit.state[l.state]}</span>
                  {l.state === "active" && l.remaining < l.amount && <p className="mt-1 text-xs text-muted">{fmt(t.credit.remaining, { amount: formatAED(l.remaining, lang) })}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
