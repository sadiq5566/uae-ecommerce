import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getDictionary } from "@/lib/dictionaries";
import { isLocale } from "@/lib/i18n";
import { getOrderByToken } from "@/features/orders/queries";
import { OrderDetail } from "@/features/orders/order-detail";
import { ReturnsPanel } from "@/features/returns/panel";

export async function generateMetadata({ params }: PageProps<"/[lang]/track/[number]">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const t = await getDictionary(lang);
  return { title: t.track.title, robots: { index: false, follow: false }, referrer: "no-referrer" }; // the link carries a secret
}

export default async function TrackedOrderPage({ params, searchParams }: PageProps<"/[lang]/track/[number]">) {
  const { lang, number } = await params;
  if (!isLocale(lang)) notFound();
  const sp = await searchParams;
  const token = typeof sp.k === "string" ? sp.k : "";
  const o = await getOrderByToken(number, token);
  if (!o) redirect(`/${lang}/track?invalid=1`);
  const t = await getDictionary(lang);
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <OrderDetail o={o} lang={lang} t={t} placed={!!sp.placed} guestToken={token} back={{ href: `/${lang}/track`, label: t.nav.track }}
        extra={<ReturnsPanel order={o} lang={lang} t={t} token={token} />} />
    </div>
  );
}
