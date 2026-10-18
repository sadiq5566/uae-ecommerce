import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDictionary } from "@/lib/dictionaries";
import { isLocale } from "@/lib/i18n";
import { requireUser } from "@/lib/auth/guard";
import { getOrderForUser } from "@/features/orders/queries";
import { OrderDetail } from "@/features/orders/order-detail";
import { ReturnsPanel } from "@/features/returns/panel";

export async function generateMetadata({ params }: PageProps<"/[lang]/account/orders/[number]">): Promise<Metadata> {
  const { lang, number } = await params;
  if (!isLocale(lang)) return {};
  const t = await getDictionary(lang);
  return { title: `${t.orders.title} · ${number}`, robots: { index: false, follow: false } };
}

export default async function OrderPage({ params, searchParams }: PageProps<"/[lang]/account/orders/[number]">) {
  const { lang, number } = await params;
  if (!isLocale(lang)) notFound();
  const user = await requireUser(lang, `/${lang}/account/orders/${number}`);
  const o = await getOrderForUser(number, user.id);
  if (!o) notFound();
  const sp = await searchParams;
  const t = await getDictionary(lang);
  return <OrderDetail o={o} lang={lang} t={t} placed={!!sp.placed} back={{ href: `/${lang}/account/orders`, label: t.orders.back }} extra={<ReturnsPanel order={o} lang={lang} t={t} />} />;
}
