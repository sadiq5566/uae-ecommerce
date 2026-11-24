import { faqPageJsonLd, type Faq, type Lang } from "../../lib/faq";

/**
 * Visible FAQ + matching FAQPage JSON-LD. Uses native <details>: every answer is in the server-rendered HTML (crawlers and AI answer engines read it
 * without running JavaScript), it needs no client code, and it works with the keyboard. Structured data always mirrors exactly what is shown.
 * One FAQPage per page: pass every question for the page in `faqs`.
 */
export function FaqSection({ faqs, lang, title, id = "faq", url, className = "mt-14", openFirst = false }: {
  faqs: Faq[]; lang: Lang; title: string; id?: string; url?: string; className?: string; openFirst?: boolean;
}) {
  if (!faqs.length) return null;
  const ld = faqPageJsonLd(faqs, lang, url);
  return (
    <section aria-labelledby={id} className={className}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />
      <h2 id={id} className="font-display text-xl font-bold sm:text-2xl">{title}</h2>
      <div className="mt-4 divide-y divide-line rounded-2xl border border-line bg-surface">
        {faqs.map((f, i) => (
          <details key={f.q} open={openFirst && i === 0} className="group px-4 py-3 sm:px-5">
            <summary className="flex cursor-pointer list-none items-start justify-between gap-4 py-1 font-medium [&::-webkit-details-marker]:hidden">
              <h3 className="text-base font-medium">{f.q}</h3>
              <span aria-hidden className="mt-0.5 shrink-0 text-brand transition-transform group-open:rotate-45">+</span>
            </summary>
            <p className="pb-2 pt-1 text-sm leading-relaxed text-muted">{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
