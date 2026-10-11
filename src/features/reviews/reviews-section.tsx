import Link from "next/link";
import type { Dictionary } from "@/lib/dictionaries";
import { fmt } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import { getCurrentUser } from "@/lib/auth/session";
import { REVIEW_SORTS, getReviews, reviewEligibility, type ReviewSort } from "./service";
import { HelpfulButton, ReportButton, ReviewForm } from "./review-controls";

export async function ReviewsSection({ productId, slug, locale, t, sort, page }: { productId: string; slug: string; locale: Locale; t: Dictionary; sort: ReviewSort; page: number }) {
  const user = await getCurrentUser();
  const [data, elig] = await Promise.all([getReviews(productId, sort, page, user?.id), reviewEligibility(user?.id, productId)]);
  const date = new Intl.DateTimeFormat(locale === "ar" ? "ar-AE" : "en-AE", { dateStyle: "medium", timeZone: "Asia/Dubai" });
  const href = (s: ReviewSort, p = 1) => `/${locale}/p/${slug}?${new URLSearchParams({ ...(s !== "helpful" && { rsort: s }), ...(p > 1 && { rpage: String(p) }) })}#reviews`.replace("?#", "#");
  const max = Math.max(1, ...data.distribution.map((d) => d.count));
  return (
    <section id="reviews" className="mt-14 scroll-mt-32" aria-labelledby="reviews-h">
      <h2 id="reviews-h" className="font-display text-2xl font-bold">{t.reviews.title}</h2>
      {data.total === 0 ? <p className="mt-3 text-sm text-muted">{t.reviews.none}</p> : (
        <div className="mt-5 grid gap-8 md:grid-cols-[14rem_1fr]">
          <div>
            <p className="font-display text-5xl font-bold"><bdi dir="ltr">{data.avg.toFixed(1)}<span className="text-lg text-muted"> / 5</span></bdi></p>
            <p className="text-gold" aria-hidden>{"★".repeat(Math.round(data.avg))}{"☆".repeat(5 - Math.round(data.avg))}</p>
            <p className="mt-1 text-sm text-muted">{fmt(t.reviews.basedOn, { n: data.total })}</p>
            <ul className="mt-4 flex flex-col gap-1.5" aria-label={t.reviews.title}>
              {data.distribution.map((d) => <li key={d.rating} className="flex items-center gap-2 text-xs"><span className="w-10 shrink-0">{fmt(d.rating === 1 ? t.reviews.star : t.reviews.stars, { n: d.rating })}</span><span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2"><span className="block h-full rounded-full bg-gold" style={{ width: `${(d.count / max) * 100}%` }} /></span><span className="w-6 text-end text-muted">{d.count}</span></li>)}
            </ul>
          </div>
          <div>
            <nav aria-label={t.reviews.sortBy} className="mb-4 flex flex-wrap items-center gap-2 text-sm"><span className="text-muted">{t.reviews.sortBy}:</span>
              {REVIEW_SORTS.map((s) => <Link key={s} href={href(s)} scroll={false} aria-current={sort === s} className={`rounded-full px-3 py-1 ${sort === s ? "bg-brand text-brand-fg" : "border border-line hover:border-brand"}`}>{t.reviews.sorts[s]}</Link>)}</nav>
            <ul className="flex flex-col divide-y divide-line">
              {data.items.map((r) => (
                <li key={r.id} className="py-5 first:pt-0">
                  <p className="text-sm"><span className="text-gold" role="img" aria-label={fmt(r.rating === 1 ? t.reviews.star : t.reviews.stars, { n: r.rating })}>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span> {r.title && <b className="ms-1">{r.title}</b>}</p>
                  <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-fg/90">{r.body}</p>
                  <p className="mt-2 text-xs text-muted">{r.authorName} · {date.format(new Date(r.createdAt))}{r.verified && <span className="ms-2 rounded-full bg-brand-soft px-2 py-0.5 font-semibold text-brand">✓ {t.reviews.verified}</span>}</p>
                  <div className="mt-2 flex items-center gap-4"><HelpfulButton id={r.id} count={r.helpfulCount} helped={r.helpedByMe} locale={locale} t={t} /><ReportButton id={r.id} locale={locale} t={t} /></div>
                </li>
              ))}
            </ul>
            {data.pages > 1 && <div className="mt-4 flex gap-3 text-sm">{page > 1 && <Link href={href(sort, page - 1)} scroll={false} className="rounded-full border border-line px-4 py-1.5 hover:border-brand">← {t.catalog.prev}</Link>}{page < data.pages && <Link href={href(sort, page + 1)} scroll={false} className="rounded-full border border-line px-4 py-1.5 hover:border-brand">{t.reviews.more} →</Link>}</div>}
          </div>
        </div>
      )}
      <div className="mt-10 rounded-2xl border border-line bg-surface p-6">
        <h3 className="mb-3 font-semibold">{t.reviews.write}</h3>
        {elig.state === "can_review" && <ReviewForm productId={productId} t={t} />}
        {elig.state === "guest" && <p className="text-sm"><Link href={`/${locale}/login?next=${encodeURIComponent(`/${locale}/p/${slug}`)}`} className="font-semibold text-brand hover:underline">{t.reviews.signIn}</Link></p>}
        {elig.state === "not_purchased" && <p className="text-sm text-muted">{t.reviews.notPurchased}</p>}
        {elig.state === "already" && <p className="text-sm text-muted">{t.reviews.already}</p>}
      </div>
    </section>
  );
}
