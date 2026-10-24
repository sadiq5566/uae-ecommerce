import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDictionary } from "@/lib/dictionaries";
import { isLocale } from "@/lib/i18n";
import { RichText } from "@/components/rich-text";
import { Breadcrumbs } from "@/features/catalog/breadcrumbs";
import { getSettings } from "@/features/checkout/prepare";
import { alternatesFor } from "@/features/catalog/seo";
import { getPage } from "@/features/content/service";
import { ContactForm } from "@/features/support/contact-form";
import { supportEmailFrom } from "@/lib/email";

// Editable static pages: about, contact, faq, delivery, returns, privacy, terms, help. Unknown or unpublished → 404.
export async function generateMetadata({ params }: PageProps<"/[lang]/[page]">): Promise<Metadata> {
  const { lang, page } = await params;
  if (!isLocale(lang)) return {};
  const p = await getPage(page);
  return p ? { title: p.title[lang], alternates: alternatesFor(lang, `/${page}`) } : {};
}

export default async function ContentPageRoute({ params, searchParams }: PageProps<"/[lang]/[page]">) {
  const { lang, page } = await params;
  const { topic } = await searchParams;
  if (!isLocale(lang)) notFound();
  const p = await getPage(page);
  if (!p) notFound();
  const t = await getDictionary(lang);
  const s = page === "contact" ? await getSettings() : null;
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <Breadcrumbs label={t.catalog.breadcrumb} items={[{ label: t.nav.home, href: `/${lang}` }, { label: p.title[lang] }]} />
      <h1 className="animate-fade-up mt-4 font-display text-3xl font-bold sm:text-4xl">{p.title[lang]}</h1>
      <RichText text={p.body[lang]} className="mt-4" />
      {s && (supportEmailFrom(s.supportEmail) || s.supportPhone) && (
        <div className="mt-8 rounded-2xl border border-line bg-surface p-5 text-sm">
          <p className="font-semibold">{t.pages.contactSupport}</p>
          {supportEmailFrom(s.supportEmail) && <p className="mt-2">{t.pages.email}: <a className="text-brand hover:underline" href={`mailto:${supportEmailFrom(s.supportEmail)}`}>{supportEmailFrom(s.supportEmail)}</a></p>}
          {s.supportPhone && <p className="mt-1">{t.pages.phone}: <a className="text-brand hover:underline" dir="ltr" href={`tel:${s.supportPhone.replace(/[^\d+]/g, "")}`}>{s.supportPhone}</a></p>}
        </div>
      )}
      {page === "contact" && <ContactForm locale={lang} initialTopic={typeof topic === "string" ? topic : undefined} />}
    </div>
  );
}
