import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDictionary } from "@/lib/dictionaries";
import { formatAED, isLocale } from "@/lib/i18n";
import { requireUser } from "@/lib/auth/guard";
import { getProvider } from "@/lib/payments";
import { mockPayAction } from "@/features/orders/mock-actions";
import { getOrderForUser } from "@/features/orders/queries";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function MockPayPage({ params }: PageProps<"/[lang]/pay/mock/[number]">) {
  const { lang, number } = await params;
  if (!isLocale(lang) || getProvider()?.id !== "mock") notFound(); // does not exist when the mock provider is off (always in production)
  const user = await requireUser(lang);
  const o = await getOrderForUser(number, user.id);
  if (!o || o.status !== "pending_payment") notFound();
  const t = await getDictionary(lang);
  const btn = "w-full rounded-xl px-5 py-3 font-semibold transition active:scale-[0.98]";
  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <div className="rounded-3xl border-2 border-dashed border-gold bg-surface p-8 shadow-card">
        <p role="alert" className="mb-5 rounded-xl bg-gold-soft px-4 py-3 text-sm font-bold text-gold">⚠ {t.pay.warning}</p>
        <h1 className="font-display text-2xl font-bold">{t.pay.title}</h1>
        <p className="mt-2 text-sm text-muted" dir="ltr">{o.orderNumber}</p>
        <p className="mt-4 flex justify-between text-lg"><span>{t.pay.amount}</span><strong>{formatAED(o.totals.total, lang)}</strong></p>
        <div className="mt-6 flex flex-col gap-3">
          {(["succeed", "fail", "cancel"] as const).map((k) => (
            <form key={k} action={mockPayAction}><input type="hidden" name="locale" value={lang} /><input type="hidden" name="orderNumber" value={o.orderNumber} /><input type="hidden" name="outcome" value={k} />
              <button className={`${btn} ${k === "succeed" ? "bg-brand text-brand-fg hover:brightness-110" : "border border-line hover:bg-surface-2"}`}>{t.pay[k]}</button></form>
          ))}
        </div>
      </div>
    </div>
  );
}
