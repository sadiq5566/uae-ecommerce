import Link from "next/link";
import { notFound } from "next/navigation";
import { getDictionary } from "@/lib/dictionaries";
import { isLocale } from "@/lib/i18n";
import { requireUser } from "@/lib/auth/guard";
import { logoutAction, sendVerifyCodeAction } from "@/features/auth/actions";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function AccountLayout({ children, params }: LayoutProps<"/[lang]/account">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const user = await requireUser(lang, `/${lang}/account`);
  const t = await getDictionary(lang);
  const tabs = [
    { href: `/${lang}/account`, label: t.account.profile },
    { href: `/${lang}/account/addresses`, label: t.account.addresses },
    { href: `/${lang}/account/orders`, label: t.account.orders },
    { href: `/${lang}/account/credit`, label: t.credit.title },
    { href: `/${lang}/wishlist`, label: t.account.wishlist },
  ];
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold">{t.account.title}</h1>
          <p className="text-sm text-muted">{user.name} · {user.email}{user.emailVerified && <span className="ms-2 rounded-full bg-brand-soft px-2 py-0.5 text-xs font-semibold text-brand">✓ {t.account.emailVerified}</span>}</p>
        </div>
        <form action={logoutAction}><input type="hidden" name="locale" value={lang} />
          <button className="rounded-full border border-line px-5 py-2 text-sm font-medium transition hover:border-danger hover:text-danger">{t.auth.signOut}</button>
        </form>
      </div>
      {!user.emailVerified && (
        <form action={sendVerifyCodeAction} className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gold/50 bg-gold-soft px-4 py-3 text-sm text-gold-ink">
          <input type="hidden" name="locale" value={lang} />
          <span>✉️ {t.auth.verifyBanner}</span>
          <button className="rounded-full bg-brand px-4 py-1.5 font-semibold text-brand-fg">{t.auth.verifyBannerBtn}</button>
        </form>
      )}
      <nav aria-label={t.account.title} className="mb-8 flex gap-2 overflow-x-auto pb-1">
        {tabs.map((x) => <Link key={x.href} href={x.href} className="shrink-0 rounded-full bg-surface-2 px-4 py-2 text-sm font-medium transition hover:bg-brand-soft hover:text-brand">{x.label}</Link>)}
      </nav>
      <div className="animate-fade-up">{children}</div>
    </div>
  );
}
