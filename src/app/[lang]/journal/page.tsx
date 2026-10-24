import type { Metadata } from "next";
import Image from "@/components/img";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDictionary } from "@/lib/dictionaries";
import { isLocale } from "@/lib/i18n";
import { Breadcrumbs } from "@/features/catalog/breadcrumbs";
import { alternatesFor } from "@/features/catalog/seo";
import { listArticles } from "@/features/content/service";

export async function generateMetadata({ params }: PageProps<"/[lang]/journal">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const t = await getDictionary(lang);
  return { title: t.journalPage.title, description: t.journalPage.sub, alternates: alternatesFor(lang, "/journal") };
}

export default async function JournalIndex({ params, searchParams }: PageProps<"/[lang]/journal">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const [t, { items, pages }] = await Promise.all([getDictionary(lang), listArticles(9, page)]);
  const fmt = new Intl.DateTimeFormat(lang === "ar" ? "ar-AE" : "en-AE", { dateStyle: "medium", timeZone: "Asia/Dubai" });
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <Breadcrumbs label={t.catalog.breadcrumb} items={[{ label: t.nav.home, href: `/${lang}` }, { label: t.journalPage.title }]} />
      <h1 className="animate-fade-up mt-4 font-display text-3xl font-bold sm:text-4xl">{t.journalPage.title}</h1>
      <p className="mt-1 text-muted">{t.journalPage.sub}</p>
      {items.length === 0 ? <p className="mt-10 rounded-2xl border border-dashed border-line py-16 text-center text-muted">{t.journalPage.none}</p> : (
        <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {items.map((a) => (
            <Link key={a.slug} href={`/${lang}/journal/${a.slug}`} className="group overflow-hidden rounded-2xl border border-line bg-surface transition duration-300 hover:-translate-y-1 hover:shadow-card">
              <div className="relative grid h-44 place-items-center overflow-hidden text-6xl" style={{ background: `linear-gradient(135deg, hsl(${a.hue} 60% 90%), hsl(${a.hue} 55% 78%))` }}>{a.cover ? <Image src={a.cover} alt={a.coverAlt[lang]} fill sizes="(min-width:1024px) 33vw, 100vw" className="object-cover transition-transform duration-500 group-hover:scale-105" /> : <span aria-hidden>{a.icon}</span>}</div>
              <div className="p-5"><p className="text-xs font-semibold text-brand">{a.category ? `${a.category} · ` : ""}{fmt.format(new Date(a.publishAt))}</p><h2 className="mt-2 font-display text-xl font-bold leading-snug">{a.title[lang]}</h2>{a.excerpt[lang] && <p className="mt-2 line-clamp-3 text-sm text-muted">{a.excerpt[lang]}</p>}</div>
            </Link>
          ))}
        </div>
      )}
      {pages > 1 && <nav aria-label={t.catalog.pagination} className="mt-10 flex justify-center gap-3 text-sm">{page > 1 && <Link href={`/${lang}/journal?page=${page - 1}`} className="rounded-full border border-line px-4 py-2 hover:border-brand">← {t.catalog.prev}</Link>}{page < pages && <Link href={`/${lang}/journal?page=${page + 1}`} className="rounded-full border border-line px-4 py-2 hover:border-brand">{t.catalog.next} →</Link>}</nav>}
    </div>
  );
}
