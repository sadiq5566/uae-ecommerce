import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getDictionary } from "@/lib/dictionaries";
import { isLocale } from "@/lib/i18n";
import { getCurrentUser } from "@/lib/auth/session";
import { privatePage } from "@/lib/page-meta";

export const generateMetadata = privatePage((t) => t.track.title);

/** Order tracking lives in the account: signed-in customers go straight to their orders; everyone else is asked to sign in or register. */
export default async function TrackPage({ params, searchParams }: PageProps<"/[lang]/track">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const sp = await searchParams;
  const user = await getCurrentUser();
  const number = typeof sp.order === "string" && /^UAE-[A-Z0-9]{8}$/i.test(sp.order) ? sp.order.toUpperCase() : "";
  const target = number ? `/${lang}/account/orders/${number}` : `/${lang}/account/orders`;
  if (user) redirect(target);
  const t = await getDictionary(lang);
  const q = `?next=${encodeURIComponent(target)}`;
  return (
    <div className="mx-auto max-w-md px-4 py-12 sm:px-6">
      <h1 className="font-display text-3xl font-bold">{t.track.title}</h1>
      <p className="mt-2 text-sm text-muted">{t.track.sub}</p>
      {sp.invalid && <p role="alert" className="mt-4 rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">{t.track.linkInvalid}</p>}
      <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-line bg-surface p-6">
        <Link href={`/${lang}/login${q}`} className="rounded-xl bg-brand px-5 py-3 text-center font-semibold text-brand-fg transition hover:brightness-110">{t.auth.signIn}</Link>
        <Link href={`/${lang}/register${q}`} className="rounded-xl border border-brand px-5 py-3 text-center font-semibold text-brand transition hover:bg-brand-soft">{t.auth.signUp}</Link>
        <p className="mt-1 text-xs text-muted">{t.track.whyAccount}</p>
      </div>
    </div>
  );
}
