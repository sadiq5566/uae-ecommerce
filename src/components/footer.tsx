import { Logo } from "./logo";
import Link from "next/link";
import type { Dictionary } from "@/lib/dictionaries";
import type { Locale } from "@/lib/i18n";
import type { CategoryView } from "@/features/catalog/service";
import { NewsletterForm } from "./newsletter";
import { Reveal } from "./reveal";

export function Footer({ locale, t, categories }: { locale: Locale; t: Dictionary; categories: CategoryView[] }) {
  const col = "flex flex-col gap-2 text-sm text-muted [&_a]:transition [&_a:hover]:text-brand";
  const h = "mb-3 text-sm font-semibold text-fg";
  return (
    <footer className="mt-24 border-t border-line bg-surface-2">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <Reveal className="mb-12 flex flex-col items-start justify-between gap-6 rounded-3xl border border-line bg-surface-2 p-8 text-fg md:flex-row md:items-center">
          <div>
            <h2 className="font-display text-2xl font-bold">{t.newsletter.title}</h2>
            <p className="mt-1 text-sm text-muted">{t.newsletter.subtitle}</p>
          </div>
          <NewsletterForm t={t.newsletter} locale={locale} />
        </Reveal>
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          <div className="col-span-2 md:col-span-1">
            <Logo name={t.brand} className="[&>span:last-child]:inline" />
            <p className="mt-2 max-w-xs text-sm text-muted">{t.hero.subtitle}</p>
          </div>
          <div><p className={h}>{t.footer.shop}</p>
            <ul className={col}>{categories.filter((c) => !c.parent).slice(0, 5).map((c) => <li key={c.slug}><Link href={`/${locale}/c/${c.slug}`}>{c.name[locale]}</Link></li>)}</ul></div>
          <div><p className={h}>{t.footer.help}</p>
            <ul className={col}>
              <li><Link href={`/${locale}/track`}>{t.nav.track}</Link></li>
              <li><Link href={`/${locale}/contact`}>{t.footer.contact}</Link></li>
              <li><Link href={`/${locale}/faq`}>{t.footer.faq}</Link></li>
              <li><Link href={`/${locale}/delivery`}>{t.footer.shipping}</Link></li>
              <li><Link href={`/${locale}/returns`}>{t.footer.returns}</Link></li>
            </ul></div>
          <div><p className={h}>{t.footer.company}</p>
            <ul className={col}>
              <li><Link href={`/${locale}/about`}>{t.footer.about}</Link></li>
              <li><Link href={`/${locale}/privacy`}>{t.footer.privacy}</Link></li>
              <li><Link href={`/${locale}/terms`}>{t.footer.terms}</Link></li>
            </ul></div>
        </div>
        <div className="mt-12 flex flex-col justify-between gap-2 border-t border-line pt-6 text-xs text-muted sm:flex-row">
          <p>© {new Date().getFullYear()} {t.brand}. {t.footer.rights}</p>
          <p>{t.footer.demo}</p>
        </div>
      </div>
    </footer>
  );
}
