import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getDictionary } from "@/lib/dictionaries";
import { isLocale } from "@/lib/i18n";
import { getCurrentUser } from "@/lib/auth/session";
import { claimGuestOrders } from "@/features/auth/otp";
import { getOrderByToken } from "@/features/orders/queries";
import { OrderDetail } from "@/features/orders/order-detail";
import { connectDb } from "@/lib/db";
import { User } from "@/models/user";

export async function generateMetadata({ params }: PageProps<"/[lang]/track/[number]">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const t = await getDictionary(lang);
  return { title: t.track.title, robots: { index: false, follow: false }, referrer: "no-referrer" }; // the link carries a secret
}

/**
 * Guest order confirmation / payment-return link (the secret token proves it is the buyer's own link). It is read-only:
 * tracking, returns and reviews need an account, and a signed-in owner is sent to the account copy of the order.
 */
export default async function TrackedOrderPage({ params, searchParams }: PageProps<"/[lang]/track/[number]">) {
  const { lang, number } = await params;
  if (!isLocale(lang)) notFound();
  const sp = await searchParams;
  const token = typeof sp.k === "string" ? sp.k : "";
  const o = await getOrderByToken(number, token);
  if (!o) redirect(`/${lang}/track?invalid=1`);
  const user = await getCurrentUser();
  if (user) {
    await connectDb();
    const verified = await User.exists({ _id: user.id, emailVerifiedAt: { $exists: true } });
    if (verified && o.email && o.email === user.email) await claimGuestOrders(user.id, user.email); // same verified email → it's theirs
    redirect(`/${lang}/account/orders/${number}${sp.placed ? "?placed=1" : ""}`);
  }
  const t = await getDictionary(lang);
  const q = `?next=${encodeURIComponent(`/${lang}/account/orders/${number}`)}`;
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <OrderDetail o={o} lang={lang} t={t} placed={!!sp.placed} guestToken={token} back={{ href: `/${lang}`, label: t.nav.home }}
        extra={
          <section className="rounded-2xl border border-brand/30 bg-brand-soft p-5 text-sm">
            <h3 className="font-semibold text-brand">{t.track.accountTitle}</h3>
            <p className="mt-1 text-muted">{t.track.accountBody}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href={`/${lang}/register${q}`} className="rounded-xl bg-brand px-5 py-2.5 font-semibold text-brand-fg transition hover:brightness-110">{t.auth.signUp}</Link>
              <Link href={`/${lang}/login${q}`} className="rounded-xl border border-brand px-5 py-2.5 font-semibold text-brand transition hover:bg-surface">{t.auth.signIn}</Link>
            </div>
          </section>
        } />
    </div>
  );
}
