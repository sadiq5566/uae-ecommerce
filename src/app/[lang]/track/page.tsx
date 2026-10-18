import Link from "next/link";
import { notFound } from "next/navigation";
import { getDictionary } from "@/lib/dictionaries";
import { isLocale } from "@/lib/i18n";
import { privatePage } from "@/lib/page-meta";
import { TrackForm } from "@/features/orders/track-form";

export const generateMetadata = privatePage((t) => t.track.title);

export default async function TrackPage({ params, searchParams }: PageProps<"/[lang]/track">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const sp = await searchParams;
  const t = await getDictionary(lang);
  const number = typeof sp.order === "string" ? sp.order.slice(0, 20).toUpperCase() : undefined;
  return (
    <div className="mx-auto max-w-md px-4 py-12 sm:px-6">
      <h1 className="font-display text-3xl font-bold">{t.track.title}</h1>
      <p className="mt-2 text-sm text-muted">{t.track.sub}</p>
      {sp.invalid && <p role="alert" className="mt-4 rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">{t.track.linkInvalid}</p>}
      <div className="mt-6 rounded-2xl border border-line bg-surface p-6"><TrackForm locale={lang} t={t} defaultNumber={number} /></div>
      <p className="mt-4 text-sm text-muted">{t.track.signedInHint} <Link href={`/${lang}/account/orders`} className="font-semibold text-brand hover:underline">{t.orders.title}</Link></p>
    </div>
  );
}
