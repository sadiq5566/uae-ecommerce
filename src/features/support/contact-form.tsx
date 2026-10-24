"use client";
import { useActionState } from "react";
import { inputCls, SubmitButton } from "@/components/form-ui";
import type { Locale } from "@/lib/i18n";
import { sendSupportMessage, type SupportState } from "./actions";
import { TOPICS } from "./topics";

const L = {
  en: { title: "Send us a message", sub: "Complaints, refunds, exchanges or any question about your order.", name: "Your name", email: "Email", topic: "Topic", order: "Order number (optional)", message: "How can we help?", send: "Send message", done: "Message sent", doneSub: "Thank you! We emailed you a copy and will reply soon.", again: "Send another", rate: "Too many messages. Please try again later.", failed: "We couldn't send your message. Please try again or email us directly.", check: "Please check the highlighted fields.",
    topics: { complaint: "Complaint", refund: "Refund request", exchange: "Exchange request", order: "Question about my order", other: "Something else" } },
  ar: { title: "أرسلي لنا رسالة", sub: "الشكاوى والاسترداد والاستبدال أو أي استفسار عن طلبك.", name: "الاسم", email: "البريد الإلكتروني", topic: "الموضوع", order: "رقم الطلب (اختياري)", message: "كيف نساعدك؟", send: "إرسال الرسالة", done: "تم إرسال الرسالة", doneSub: "شكراً لك! أرسلنا لك نسخة بالبريد وسنرد قريباً.", again: "إرسال رسالة أخرى", rate: "رسائل كثيرة. حاولي لاحقاً.", failed: "تعذّر إرسال رسالتك. حاولي مجدداً أو راسلينا مباشرة.", check: "يرجى مراجعة الحقول المحددة.",
    topics: { complaint: "شكوى", refund: "طلب استرداد", exchange: "طلب استبدال", order: "استفسار عن طلبي", other: "موضوع آخر" } },
};

export function ContactForm({ locale, initialTopic }: { locale: Locale; initialTopic?: string }) {
  const l = L[locale];
  const [s, action, pending] = useActionState<SupportState, FormData>(sendSupportMessage, {});
  const v = s.values ?? {};
  const bad = s.fieldErrors ?? {};
  if (s.ok) {
    return (
      <div role="status" className="mt-8 rounded-2xl border border-brand/30 bg-brand-soft p-6 text-center">
        <p className="text-3xl" aria-hidden>✉️</p>
        <p className="mt-2 font-display text-xl font-bold">{l.done}</p>
        <p className="mt-1 text-sm text-muted">{l.doneSub}</p>
        <button type="button" onClick={() => location.reload()} className="mt-4 text-sm font-semibold text-brand hover:underline">{l.again}</button>
      </div>
    );
  }
  const err = s.error === "rate_limited" ? l.rate : s.error === "failed" ? l.failed : s.error === "invalid" ? l.check : "";
  const field = (k: string) => ({ "aria-invalid": !!bad[k], className: inputCls });
  return (
    <form action={action} className="mt-8 rounded-2xl border border-line bg-surface p-5 sm:p-6" noValidate>
      <h2 className="font-display text-xl font-bold">{l.title}</h2>
      <p className="mt-1 text-sm text-muted">{l.sub}</p>
      <input type="hidden" name="locale" value={locale} />
      <div aria-hidden className="absolute -start-[9999px]"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">{l.name}<input name="name" autoComplete="name" required defaultValue={v.name} {...field("name")} /></label>
        <label className="block text-sm font-medium">{l.email}<input name="email" type="email" autoComplete="email" required defaultValue={v.email} dir="ltr" {...field("email")} /></label>
        <label className="block text-sm font-medium">{l.topic}
          <select name="topic" defaultValue={v.topic || initialTopic || "complaint"} className={inputCls}>{TOPICS.map((k) => <option key={k} value={k}>{l.topics[k]}</option>)}</select>
        </label>
        <label className="block text-sm font-medium">{l.order}<input name="order" defaultValue={v.order} dir="ltr" placeholder="ORD-…" className={inputCls} /></label>
        <label className="block text-sm font-medium sm:col-span-2">{l.message}<textarea name="message" rows={5} required defaultValue={v.message} {...field("message")} /></label>
      </div>
      {err && <p role="alert" className="mt-4 rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">{err}</p>}
      <div className="mt-5 sm:max-w-56"><SubmitButton pending={pending}>{l.send}</SubmitButton></div>
    </form>
  );
}
