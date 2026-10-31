import Link from "next/link";
import { notFound } from "next/navigation";
import { getDictionary } from "@/lib/dictionaries";
import { fmt } from "@/lib/format";
import { formatAED, isLocale } from "@/lib/i18n";
import { requireUser } from "@/lib/auth/guard";
import { CopyCode } from "@/features/offers/copy-code";
import { REFERRAL_REPEAT_REWARD, REFERRAL_REWARD, getReferralCode, referralStats, referralTree } from "@/features/growth/referrals";
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
  const [stats, tree] = await Promise.all([referralStats(user.id), referralTree(user.id)]);
  const link = `${siteUrl()}/${lang}?ref=${code}`;
  const amount = formatAED(REFERRAL_REWARD, lang), repeat = formatAED(REFERRAL_REPEAT_REWARD, lang);
  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-3xl bg-brand p-6 text-brand-fg sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-widest opacity-90">🎁 {t.growth.inviteTitle}</p>
        <h2 className="mt-1 font-display text-3xl font-bold">{fmt(t.growth.inviteHead, { amount })}</h2>
        <p className="mt-2 text-sm opacity-90">{fmt(t.growth.inviteBody, { amount, repeat })}</p>
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
      <ol className="grid gap-3 sm:grid-cols-3">
        {[[t.growth.inviteStep1, t.growth.inviteStep1Body], [t.growth.inviteStep2, fmt(t.growth.inviteStep2Body, { amount })], [t.growth.inviteStep3, fmt(t.growth.inviteStep3Body, { repeat })]].map(([title, body], i) => (
          <li key={title} className="flex gap-3 rounded-2xl border border-line bg-surface p-4">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-bold text-brand-fg">{i + 1}</span>
            <div><p className="text-sm font-semibold">{title}</p><p className="mt-0.5 text-xs text-muted">{body}</p></div>
          </li>
        ))}
      </ol>
      <section aria-labelledby="tree-h" className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <h3 id="tree-h" className="font-display text-lg font-bold">🌳 {t.growth.inviteTreeTitle}</h3>
        <div className="mt-4 flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-full bg-brand text-sm font-bold text-brand-fg">{[...user.name][0]?.toUpperCase()}</span>
          <p className="font-semibold">{t.growth.inviteYou}</p>
        </div>
        {tree.length ? (
          <ul className="ms-5 mt-1 border-s-2 border-line ps-6">
            {tree.map((f, i) => (
              <li key={i} className="relative py-3 before:absolute before:-start-6 before:top-1/2 before:h-0.5 before:w-5 before:bg-line">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface-2 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold">{f.name}</p>
                    <p className="text-xs text-muted">{fmt(t.growth.treeOrders, { n: f.orders })}</p>
                  </div>
                  <div className="text-end">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${f.state === "rewarded" ? "bg-brand text-brand-fg" : f.state === "pending" ? "bg-gold-soft text-gold-ink" : "bg-danger/15 text-danger"}`}>
                      {f.state === "rewarded" ? t.growth.stateRewarded : f.state === "pending" ? t.growth.statePending : t.growth.stateCancelled}
                    </span>
                    {f.earned > 0 && <p className="mt-1 text-xs font-medium text-brand" dir="ltr">{fmt(t.growth.treeEarned, { amount: formatAED(f.earned, lang) })}</p>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : <p className="ms-5 mt-1 border-s-2 border-dashed border-line ps-6 pt-3 text-sm text-muted">{t.growth.inviteTreeEmpty}</p>}
      </section>
      <section className="flex flex-col items-start gap-3 rounded-2xl bg-gold-soft p-5 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="font-semibold">🛍️ {t.growth.inviteShop}</p><p className="text-sm text-muted">{t.growth.inviteShopBody}</p></div>
        <div className="flex gap-2">
          <Link href={`/${lang}/account/credit`} className="rounded-full border border-line bg-surface px-5 py-2.5 text-sm font-medium hover:bg-surface-2">{t.growth.inviteViewCredit}</Link>
          <Link href={`/${lang}`} className="rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-brand-fg hover:opacity-90">{t.growth.inviteStartShopping}</Link>
        </div>
      </section>
      <ul className="list-disc ps-5 text-sm text-muted marker:text-brand">
        <li>{t.growth.inviteRule1}</li><li>{fmt(t.growth.inviteRule2, { repeat })}</li><li>{t.growth.inviteRule3}</li>
      </ul>
    </div>
  );
}
