import Link from "next/link";
import { notFound } from "next/navigation";
import { getDictionary } from "@/lib/dictionaries";
import { isLocale } from "@/lib/i18n";
import { requireUser } from "@/lib/auth/guard";
import { logoutAction } from "@/features/auth/actions";

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
    { href: `/${lang}/wishlist`, label: t.account.wishlist },
  ];
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold">{t.account.title}</h1>
          <p className="text-sm text-muted">{user.name} · {user.email}</p>
        </div>
        <form action={logoutAction}><input type="hidden" name="locale" value={lang} />
          <button className="rounded-full border border-line px-5 py-2 text-sm font-medium transition hover:border-danger hover:text-danger">{t.auth.signOut}</button>
        </form>
      </div>
      <nav aria-label={t.account.title} className="mb-8 flex gap-2 overflow-x-auto pb-1">
        {tabs.map((x) => <Link key={x.href} href={x.href} className="shrink-0 rounded-full bg-surface-2 px-4 py-2 text-sm font-medium transition hover:bg-brand-soft hover:text-brand">{x.label}</Link>)}
      </nav>
      <div className="animate-fade-up">{children}</div>
    </div>
  );
}
