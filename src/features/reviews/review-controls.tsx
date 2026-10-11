"use client";
import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { SubmitButton, inputCls } from "@/components/form-ui";
import type { Dictionary } from "@/lib/dictionaries";
import { fmt } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import type { FormState } from "@/features/auth/schemas";
import { reportReviewAction, submitReviewAction, toggleHelpfulAction } from "./actions";

export function ReviewForm({ productId, t }: { productId: string; t: Dictionary }) {
  const [s, action, pending] = useActionState<FormState, FormData>(submitReviewAction, {});
  const er: Record<string, string> = t.errors;
  const [rating, setRating] = useState(Number(s.values?.rating ?? 0));
  if (s.ok) return <p role="status" className="rounded-xl bg-brand-soft px-4 py-3 text-sm text-brand">✓ {t.reviews.thanks}</p>;
  return (
    <form action={action} className="grid max-w-xl gap-4" noValidate>
      <input type="hidden" name="productId" value={productId} />
      {s.error && <p role="alert" className="rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">{er[s.error] ?? er.generic}</p>}
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">{t.reviews.rating}</legend>
        {/* Hidden input carries the value: React resets uncontrolled form fields after an action, but this state survives. */}
        <input type="hidden" name="rating" value={rating || ""} />
        <div className="flex gap-1" role="radiogroup" aria-label={t.reviews.rating}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={fmt(n === 1 ? t.reviews.star : t.reviews.stars, { n })} onClick={() => setRating(n)}
              className={`text-3xl leading-none transition hover:scale-110 ${n <= rating ? "text-gold" : "text-line"}`}><span aria-hidden>★</span></button>
          ))}
        </div>
        {s.fieldErrors?.rating && <p role="alert" className="mt-1.5 text-sm text-danger">{er[s.fieldErrors.rating] ?? er.generic}</p>}
      </fieldset>
      <div><label htmlFor="rv-title" className="mb-1.5 block text-sm font-medium">{t.reviews.reviewTitle}</label><input id="rv-title" name="title" maxLength={100} defaultValue={s.values?.title} className={inputCls} /></div>
      <div><label htmlFor="rv-body" className="mb-1.5 block text-sm font-medium">{t.reviews.body}</label>
        <textarea id="rv-body" name="body" rows={4} maxLength={2000} required defaultValue={s.values?.body} aria-invalid={!!s.fieldErrors?.body} aria-describedby="rv-hint" className={inputCls} />
        <p id="rv-hint" className={`mt-1.5 text-xs ${s.fieldErrors?.body ? "text-danger" : "text-muted"}`}>{s.fieldErrors?.body ? er[s.fieldErrors.body] ?? er.generic : t.reviews.bodyHint}</p></div>
      <div className="max-w-48"><SubmitButton pending={pending}>{t.reviews.submit}</SubmitButton></div>
    </form>
  );
}

export function HelpfulButton({ id, count, helped, locale, t }: { id: string; count: number; helped: boolean; locale: Locale; t: Dictionary }) {
  const router = useRouter();
  const [state, setState] = useState({ count, helped });
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} aria-pressed={state.helped}
      onClick={() => start(async () => {
        const r = await toggleHelpfulAction(id);
        if (r.error === "auth") return router.push(`/${locale}/login?next=${encodeURIComponent(location.pathname)}`);
        if (r.ok) setState({ count: r.count ?? 0, helped: !!r.helped });
      })}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${state.helped ? "border-brand bg-brand-soft text-brand" : "border-line hover:border-brand"}`}>
      👍 {state.count > 0 ? fmt(t.reviews.helpfulCount, { n: state.count }) : t.reviews.helpful}
    </button>
  );
}

export function ReportButton({ id, locale, t }: { id: string; locale: Locale; t: Dictionary }) {
  const router = useRouter();
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  if (done) return <span role="status" className="text-xs text-muted">{t.reviews.reported}</span>;
  return (
    <button type="button" disabled={pending} onClick={() => start(async () => {
      const r = await reportReviewAction(id, "other");
      if (r.error === "auth") return router.push(`/${locale}/login?next=${encodeURIComponent(location.pathname)}`);
      if (r.ok) setDone(true);
    })} className="text-xs text-muted underline-offset-2 hover:text-danger hover:underline">{t.reviews.report}</button>
  );
}
