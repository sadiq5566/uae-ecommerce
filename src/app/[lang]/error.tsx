"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

// Client error boundaries can't read the server dictionary, so the few strings live here.
const copy = {
  en: { title: "Something went wrong", body: "Please try again. If it keeps happening, contact support.", retry: "Try again", home: "Back to home" },
  ar: { title: "حدث خطأ ما", body: "يرجى المحاولة مرة أخرى. وإذا تكرر الأمر تواصل مع الدعم.", retry: "حاول مجدداً", home: "العودة للرئيسية" },
};

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const lang = usePathname()?.startsWith("/ar") ? "ar" : "en";
  const c = copy[lang];
  useEffect(() => { console.error(error); }, [error]); // digest correlates with the server log; no details are shown to users
  return (
    <div className="mx-auto grid max-w-xl place-items-center gap-4 px-6 py-32 text-center" role="alert">
      <p className="text-6xl" aria-hidden>⚠️</p>
      <h1 className="font-display text-2xl font-bold">{c.title}</h1>
      <p className="text-muted">{c.body}</p>
      {error.digest && <p className="text-xs text-muted" dir="ltr">ref: {error.digest}</p>}
      <div className="flex gap-3"><button onClick={reset} className="rounded-full bg-brand px-6 py-3 font-semibold text-brand-fg">{c.retry}</button><a href={`/${lang}`} className="rounded-full border border-line px-6 py-3 font-semibold hover:bg-surface-2">{c.home}</a></div>
    </div>
  );
}
