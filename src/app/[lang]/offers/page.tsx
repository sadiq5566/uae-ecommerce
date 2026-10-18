import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDictionary } from "@/lib/dictionaries";
import { formatAED, isLocale } from "@/lib/i18n";
import { fmt } from "@/lib/format";
import { getPublicCoupons, getPublicOffers, offerLines } from "@/features/offers/service";
import { CopyCode } from "@/features/offers/copy-code";

export const revalidate = 60;

export async function generateMetadata({ params }: PageProps<"/[lang]/offers">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const t = await getDictionary(lang);
  return { title: t.offers.page.title, description: t.offers.page.sub, alternates: { canonical: `/${lang}/offers`, languages: { en: "/en/offers", ar: "/ar/offers" } } };
}

export default async function OffersPage({ params }: PageProps<"/[lang]/offers">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const [t, offers, coupons] = await Promise.all([getDictionary(lang), getPublicOffers(), getPublicCoupons()]);
  const lines = offerLines(offers, t, lang);
  const fdate = new Intl.DateTimeFormat(lang === "ar" ? "ar-AE" : "en-AE", { dateStyle: "medium", timeZone: "Asia/Dubai" });
  const p = t.offers.page;
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-4xl font-bold">{p.title}</h1>
      <p className="mt-2 text-muted">{p.sub}</p>

      <section aria-labelledby="auto-h" className="mt-8">
        <h2 id="auto-h" className="mb-4 font-display text-xl font-bold">{p.auto}</h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {lines.map((l) => (
            <li key={l.key} className="flex items-center gap-4 rounded-2xl border border-line bg-surface p-5"><span className="grid size-12 shrink-0 place-items-center rounded-xl bg-brand-soft text-2xl" aria-hidden>{l.icon}</span><span className="font-semibold">{l.text}</span></li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="codes-h" className="mt-10">
        <h2 id="codes-h" className="mb-4 font-display text-xl font-bold">{p.codes}</h2>
        {coupons.length === 0 ? <p className="rounded-2xl border border-dashed border-line p-8 text-center text-sm text-muted">{p.none}</p> : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {coupons.map((c) => (
              <li key={c.code} className="relative overflow-hidden rounded-2xl border-2 border-dashed border-brand bg-surface p-5">
                <p className="font-display text-3xl font-bold text-brand">{c.type === "percent" ? fmt(p.off, { n: c.value }) : fmt(p.offAmount, { n: c.value })}</p>
                {c.description?.[lang] && <p className="mt-1 text-sm">{c.description[lang]}</p>}
                <p className="mt-1 text-xs text-muted">{[c.minSubtotal > 0 ? fmt(p.minimum, { min: formatAED(c.minSubtotal, lang) }) : null, c.endsAt ? fmt(p.until, { d: fdate.format(new Date(c.endsAt)) }) : null].filter(Boolean).join(" · ")}</p>
                <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-4 py-3">
                  <code dir="ltr" className="select-all font-mono text-lg font-bold tracking-widest">{c.code}</code>
                  <CopyCode code={c.code} copy={p.copy} copied={p.copied} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <div className="mt-10 text-center"><Link href={`/${lang}/deals`} className="inline-block rounded-full bg-brand px-8 py-3 font-semibold text-brand-fg transition hover:brightness-110">{p.shop}</Link></div>
    </div>
  );
}
