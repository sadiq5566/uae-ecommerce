"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Dictionary } from "@/lib/dictionaries";
import type { Locale } from "@/lib/i18n";
import type { CategoryView } from "@/features/catalog/service";
import { useSession } from "./session-store";
import { LangSwitcher } from "./lang-switcher";
import { SearchBox } from "./search-box";
import { ThemeToggle } from "./theme-toggle";

export function Header({ locale, t, categories }: { locale: Locale; t: Dictionary; categories: CategoryView[] }) {
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

  const links = [
    { href: `/${locale}`, label: t.nav.home },
    { href: `/${locale}/deals`, label: t.nav.deals },
    { href: `/${locale}/new`, label: t.nav.newArrivals },
    { href: `/${locale}/journal`, label: t.nav.journal },
  ];

  return (
    <header className={`sticky top-0 z-50 border-b transition-all duration-300 ${scrolled ? "border-line bg-bg/85 shadow-card backdrop-blur-lg" : "border-transparent bg-bg"}`}>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-brand focus:px-4 focus:py-2 focus:text-brand-fg">{t.nav.skip}</a>
      <div className="bg-brand px-4 py-1.5 text-center text-xs font-medium text-brand-fg">
        {t.topbar.shipping}<span className="hidden sm:inline"> · {t.topbar.cod}</span>
      </div>
      <div className="mx-auto flex min-h-16 max-w-7xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-1 sm:px-6">
        <button onClick={() => drawer.current?.showModal()} aria-label={t.nav.menu} className="grid size-10 place-items-center rounded-full hover:bg-surface-2 lg:hidden">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h10" /></svg>
        </button>
        <Link href={`/${locale}`} className="group flex items-center gap-2 font-display text-xl font-bold">
          <span className="grid size-9 place-items-center rounded-xl bg-brand text-brand-fg transition-transform group-hover:rotate-12">س</span>
          <span className="hidden sm:inline">{t.brand}</span>
        </Link>
        <nav aria-label={t.nav.main} className="ms-6 hidden items-center gap-1 lg:flex">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="relative rounded-full px-3 py-2 text-sm font-medium after:absolute after:inset-x-3 after:bottom-1 after:h-0.5 after:origin-center after:scale-x-0 after:bg-brand after:transition-transform hover:after:scale-x-100">{l.label}</Link>
          ))}
        </nav>
        <SearchBox locale={locale} placeholder={t.nav.search} labels={{ results: t.nav.suggestions, category: t.nav.categoryTag }} className="mx-2 hidden min-w-0 flex-1 md:block" />
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

      <dialog ref={drawer} onClick={(e) => e.target === drawer.current && drawer.current?.close()} className="m-0 h-full max-h-none w-[min(86vw,22rem)] max-w-none bg-surface p-0 text-fg backdrop:bg-black/50 backdrop:backdrop-blur-sm me-auto">
        <div className="flex h-full flex-col gap-6 overflow-y-auto p-5">
          <div className="flex items-center justify-between">
            <span className="font-display text-lg font-bold">{t.brand}</span>
            <button onClick={() => drawer.current?.close()} aria-label={t.nav.close} className="grid size-9 place-items-center rounded-full hover:bg-surface-2">✕</button>
          </div>
          <SearchBox locale={locale} placeholder={t.nav.search} labels={{ results: t.nav.suggestions, category: t.nav.categoryTag }} onNavigate={closeDrawer} />
          <nav className="flex flex-col" aria-label={t.nav.mobile}>
            {links.map((l) => (
              <Link key={l.href} href={l.href} onClick={() => drawer.current?.close()} className="rounded-xl px-3 py-3 font-medium hover:bg-surface-2">{l.label}</Link>
            ))}
          </nav>
          <div>
            <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted">{t.nav.categories}</p>
            <ul className="grid grid-cols-2 gap-2">
              {categories.filter((c) => !c.parent).map((c) => (
                <li key={c.slug}>
                  <Link href={`/${locale}/c/${c.slug}`} onClick={() => drawer.current?.close()} className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2.5 text-sm">
                    <span aria-hidden>{c.icon}</span>{c.name[locale]}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div className="mt-auto sm:hidden"><ThemeToggle labels={t.nav} /></div>
        </div>
      </dialog>
    </header>
  );
}
