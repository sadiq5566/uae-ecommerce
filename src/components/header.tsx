"use client";
import Image from "@/components/img";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Dictionary } from "@/lib/dictionaries";
import type { Locale } from "@/lib/i18n";
import type { Menu } from "@/features/catalog/menu";
import { Logo } from "./logo";
import { useSession } from "./session-store";
import { LangSwitcher } from "./lang-switcher";
import { SearchBox } from "./search-box";
import { ThemeToggle } from "./theme-toggle";
import { OfferTicker } from "@/features/offers/ticker";

export function Header({ locale, t, menu, offerLines }: { locale: Locale; t: Dictionary; menu: Menu; offerLines: { key: string; icon: string; text: string }[] }) {
  const [scrolled, setScrolled] = useState(false);
  const drawer = useRef<HTMLDialogElement>(null);
  const closeDrawer = () => drawer.current?.close();
  const { cartCount: count, user, wishlist } = useSession();

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  const ar = locale === "ar";
  const links = [
    { href: `/${locale}/deals`, label: t.nav.deals, hot: true },
    { href: `/${locale}/new`, label: t.nav.newArrivals },
    { href: `/${locale}/offers`, label: t.offers.page.title },
    { href: `/${locale}/journal`, label: t.nav.journal },
  ];
  const bar = "relative whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-medium transition hover:bg-surface-2 after:absolute after:inset-x-3.5 after:bottom-0.5 after:h-0.5 after:origin-center after:scale-x-0 after:bg-brand after:transition-transform hover:after:scale-x-100";

  return (
    <header className={`sticky top-0 z-50 border-b transition-all duration-300 ${scrolled ? "border-line bg-bg/85 shadow-card backdrop-blur-lg" : "border-transparent bg-bg"}`}>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-brand focus:px-4 focus:py-2 focus:text-brand-fg">{t.nav.skip}</a>
      {offerLines.length > 0 ? <OfferTicker lines={offerLines} label={t.offers.ticker} /> : (
        <div className="bg-brand px-4 py-1.5 text-center text-xs font-medium text-brand-fg">{t.topbar.shipping}<span className="hidden sm:inline"> · {t.topbar.cod}</span></div>
      )}
      <div className="mx-auto flex min-h-16 max-w-7xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-1 sm:px-6">
        <button onClick={() => drawer.current?.showModal()} aria-label={t.nav.menu} className="grid size-10 place-items-center rounded-full hover:bg-surface-2 lg:hidden">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h10" /></svg>
        </button>
        <Link href={`/${locale}`} aria-label={t.brand}><Logo name={t.brand} /></Link>
        <SearchBox locale={locale} placeholder={t.nav.search} labels={{ results: t.nav.suggestions, category: t.nav.categoryTag }} className="mx-2 hidden min-w-0 max-w-2xl flex-1 md:block" />
        <div className="ms-auto flex flex-wrap items-center justify-end gap-2 md:ms-0">
          <div className="hidden sm:block"><ThemeToggle labels={t.nav} /></div>
          <LangSwitcher locale={locale} label={t.nav.language} />
          <Link href={`/${locale}/wishlist`} aria-label={`${t.nav.wishlist} (${wishlist.length})`} className="relative hidden size-10 place-items-center rounded-full bg-surface-2 text-lg transition hover:bg-brand-soft sm:grid">♡{wishlist.length > 0 && <span key={wishlist.length} className="animate-pop absolute -end-1 -top-1 grid min-w-5 place-items-center rounded-full bg-danger-solid px-1 text-[11px] font-bold text-white">{wishlist.length}</span>}</Link>
          <Link href={user ? `/${locale}/account` : `/${locale}/login`} aria-label={user ? `${t.nav.accountLabel}: ${user.name}` : t.nav.signIn} className="grid size-10 place-items-center rounded-full bg-surface-2 transition hover:bg-brand-soft">
            {user ? <span className="text-sm font-bold text-brand">{user.name.trim()[0]?.toUpperCase()}</span> : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="8" r="4" /><path d="M4 21c1-4 4-6 8-6s7 2 8 6" /></svg>}
          </Link>
          <Link href={`/${locale}/cart`} aria-label={`${t.nav.cart} (${count})`} className="relative grid size-10 place-items-center rounded-full bg-surface-2 transition hover:bg-brand-soft">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 6h15l-1.5 9h-12zM6 6 5 3H2M9 20a1 1 0 1 0 0 .01M18 20a1 1 0 1 0 0 .01" /></svg>
            {count > 0 && <span key={count} className="animate-pop absolute -end-1 -top-1 grid min-w-5 place-items-center rounded-full bg-gold px-1 text-[11px] font-bold text-gold-fg">{count}</span>}
          </Link>
        </div>
      </div>

      {/* Category bar: the lead categories one click away, everything else in the "Categories" panel. */}
      <div className="hidden border-t border-line/70 lg:block">
        <nav aria-label={t.nav.main} className="mx-auto flex max-w-7xl items-center gap-1 px-4 sm:px-6">
          <div className="group relative">
            <button type="button" aria-haspopup="true" className="my-1.5 flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-fg transition hover:brightness-110">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>{t.nav.categories}<span aria-hidden className="text-[10px] transition-transform group-focus-within:rotate-180 group-hover:rotate-180">▾</span>
            </button>
            <div onClick={() => (document.activeElement as HTMLElement | null)?.blur()} className="invisible absolute start-0 top-full z-50 w-[min(60rem,92vw)] translate-y-1 rounded-2xl border border-line bg-surface p-5 opacity-0 shadow-card transition duration-200 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100">
              <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
                <ul className="grid grid-cols-2 gap-3">
                  {menu.main.map((c) => (
                    <li key={c.slug}>
                      <Link href={`/${locale}/c/${c.slug}`} className="group/c flex items-center gap-3 rounded-xl border border-line p-2 transition hover:border-brand hover:bg-brand-soft">
                        <span aria-hidden className="relative grid size-16 shrink-0 place-items-center overflow-hidden rounded-lg bg-surface-2 text-2xl">{c.image ? <Image src={c.image} alt="" fill sizes="64px" className="object-cover transition-transform duration-300 group-hover/c:scale-110" /> : "✦"}</span>
                        <span className="min-w-0"><span className="block truncate font-semibold">{c.name[locale]}</span><span className="block truncate text-xs text-muted">{c.tagline[locale]}</span>{c.count > 0 && <span className="text-xs text-brand">{c.count} {ar ? "منتج" : "items"}</span>}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
                <div className="grid content-start gap-4 text-sm">
                  {menu.more.length > 0 && <div><p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">{ar ? "المزيد" : "More"}</p><ul>{menu.more.map((c) => <li key={c.slug}><Link href={`/${locale}/c/${c.slug}`} className="flex justify-between rounded-lg px-2 py-1.5 hover:bg-surface-2">{c.name[locale]}<span className="text-xs text-muted">{c.count}</span></Link></li>)}</ul></div>}
                  {menu.brands.length > 0 && <div><p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">{ar ? "تسوق حسب الماركة" : "Shop by brand"}</p><ul className="flex flex-wrap gap-1.5">{menu.brands.map((c) => <li key={c.slug}><Link href={`/${locale}/brands/${c.slug}`} className="block rounded-full border border-line px-3 py-1 text-xs font-medium hover:border-brand hover:text-brand">{c.name[locale]}</Link></li>)}<li><Link href={`/${locale}/brands`} className="block rounded-full px-3 py-1 text-xs font-semibold text-brand">{ar ? "كل الماركات ←" : "All brands →"}</Link></li></ul></div>}
                </div>
              </div>
            </div>
          </div>
          {menu.main.map((c) => <Link key={c.slug} href={`/${locale}/c/${c.slug}`} className={bar}>{c.name[locale]}</Link>)}
          <span aria-hidden className="mx-1 h-5 w-px bg-line" />
          {links.map((l) => <Link key={l.href} href={l.href} className={`${bar} ${l.hot ? "text-danger" : ""}`}>{l.label}</Link>)}
        </nav>
      </div>
      {/* Phones / tablets: swipeable category chips under the header. */}
      <nav aria-label={t.nav.categories} className="flex gap-2 overflow-x-auto border-t border-line/70 px-4 py-2 [scrollbar-width:none] lg:hidden">
        {[...menu.main, ...menu.more.slice(0, 2)].map((c) => <Link key={c.slug} href={`/${locale}/c/${c.slug}`} className="shrink-0 rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm font-medium active:scale-95">{c.name[locale]}</Link>)}
        <Link href={`/${locale}/deals`} className="shrink-0 rounded-full bg-danger-solid px-3.5 py-1.5 text-sm font-semibold text-white active:scale-95">{t.nav.deals}</Link>
      </nav>

      <dialog ref={drawer} onClick={(e) => e.target === drawer.current && drawer.current?.close()} className="m-0 h-full max-h-none w-[min(86vw,22rem)] max-w-none bg-surface p-0 text-fg backdrop:bg-black/50 backdrop:backdrop-blur-sm me-auto">
        <div className="flex h-full flex-col gap-6 overflow-y-auto p-5">
          <div className="flex items-center justify-between">
            <Logo name={t.brand} className="!text-lg" />
            <button onClick={() => drawer.current?.close()} aria-label={t.nav.close} className="grid size-9 place-items-center rounded-full hover:bg-surface-2">✕</button>
          </div>
          <SearchBox locale={locale} placeholder={t.nav.search} labels={{ results: t.nav.suggestions, category: t.nav.categoryTag }} onNavigate={closeDrawer} />
          <div>
            <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted">{t.nav.categories}</p>
            <ul className="grid grid-cols-2 gap-2">
              {menu.main.map((c) => (
                <li key={c.slug}>
                  <Link href={c.kind === "brand" ? `/${locale}/brands/${c.slug}` : `/${locale}/c/${c.slug}`} onClick={() => drawer.current?.close()} className="group relative grid aspect-[4/3] items-end overflow-hidden rounded-xl bg-surface-2">
                    {c.image && <Image src={c.image} alt="" fill sizes="160px" className="object-cover transition-transform duration-300 group-hover:scale-105" />}
                    <span className="relative bg-gradient-to-t from-black/75 to-transparent px-2.5 pb-2 pt-6 text-sm font-semibold text-white">{c.name[locale]}</span>
                  </Link>
                </li>
              ))}
            </ul>
            {[...menu.more, ...menu.brands].length > 0 && <ul className="mt-3 flex flex-wrap gap-1.5">{[...menu.more, ...menu.brands].map((c) => <li key={c.slug}><Link href={c.kind === "brand" ? `/${locale}/brands/${c.slug}` : `/${locale}/c/${c.slug}`} onClick={() => drawer.current?.close()} className="block rounded-full border border-line px-3 py-1.5 text-sm">{c.name[locale]}</Link></li>)}</ul>}
          </div>
          <nav className="flex flex-col" aria-label={t.nav.mobile}>
            <Link href={`/${locale}`} onClick={() => drawer.current?.close()} className="rounded-xl px-3 py-3 font-medium hover:bg-surface-2">{t.nav.home}</Link>
            {links.map((l) => (
              <Link key={l.href} href={l.href} onClick={() => drawer.current?.close()} className={`rounded-xl px-3 py-3 font-medium hover:bg-surface-2 ${l.hot ? "text-danger" : ""}`}>{l.label}</Link>
            ))}
          </nav>
          <div className="mt-auto sm:hidden"><ThemeToggle labels={t.nav} /></div>
        </div>
      </dialog>
    </header>
  );
}
