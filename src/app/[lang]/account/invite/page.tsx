import { notFound } from "next/navigation";
import { getDictionary } from "@/lib/dictionaries";
import { fmt } from "@/lib/format";
import { formatAED, isLocale } from "@/lib/i18n";
import { requireUser } from "@/lib/auth/guard";
import { CopyCode } from "@/features/offers/copy-code";
import { REFERRAL_REWARD, getReferralCode, referralStats } from "@/features/growth/referrals";
import { privatePage } from "@/lib/page-meta";
import { siteUrl } from "@/lib/email";

export const generateMetadata = privatePage((t) => t.growth.inviteTitle);

export default async function InvitePage({ params }: PageProps<"/[lang]/account/invite">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const user = await requireUser(lang, `/${lang}/account/invite`);
  const t = await getDictionary(lang);
  const code = user.emailVerified ? await getReferralCode(user.id) : null;
  if (!code) return <p className="rounded-2xl border border-dashed border-line p-8 text-center text-sm text-muted">{t.growth.inviteVerify}</p>;
  const stats = await referralStats(user.id);
  const link = `${siteUrl()}/${lang}?ref=${code}`;
  const amount = formatAED(REFERRAL_REWARD, lang);
  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-3xl bg-brand p-6 text-brand-fg sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-widest opacity-90">🎁 {t.growth.inviteTitle}</p>
        <h2 className="mt-1 font-display text-3xl font-bold">{fmt(t.growth.inviteHead, { amount })}</h2>
        <p className="mt-2 text-sm opacity-90">{fmt(t.growth.inviteBody, { amount })}</p>
        <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl bg-white/15 p-3">
          <code dir="ltr" className="min-w-0 flex-1 select-all break-all text-sm">{link}</code>
          <CopyCode code={link} copy={t.growth.inviteCopy} copied={t.offers.page.copied} />
        </div>
        <p className="mt-3 text-xs opacity-80">{t.growth.inviteCode}: <b dir="ltr" className="select-all">{code}</b></p>
      </section>
      <section className="grid gap-3 sm:grid-cols-3">
        {[[t.growth.inviteEarned, formatAED(stats.earned, lang)], [t.growth.invitePaid, String(stats.paid)], [t.growth.invitePending, String(stats.pending)]].map(([l, v]) => (
          <div key={l} className="rounded-2xl border border-line bg-surface p-5"><p className="text-sm text-muted">{l}</p><p className="mt-1 font-display text-2xl font-bold" dir="ltr">{v}</p></div>
        ))}
      </section>
      <ul className="list-disc ps-5 text-sm text-muted marker:text-brand">
        <li>{t.growth.inviteRule1}</li><li>{t.growth.inviteRule2}</li><li>{t.growth.inviteRule3}</li>
      </ul>
    </div>
  );
}
