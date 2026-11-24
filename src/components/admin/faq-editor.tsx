"use client";
import { useMemo, useState } from "react";
import { btnGhost, inputCls } from "@/components/admin/ui";

export type FaqRow = { q: string; a: string; qAr?: string; aAr?: string; auto?: boolean };
type Row = FaqRow & { key: number };

const ANSWER_MIN = 40, ANSWER_MAX = 320; // a self-contained answer of 1-3 sentences is what search snippets and AI answers quote

/**
 * Questions & answers editor (products, categories, home page, articles). It submits the list as JSON in a hidden `faqs` field and shows a live
 * SEO / AEO checklist: enough questions, answers short enough to be quoted, Arabic present, the keyword and a UAE place name used.
 * Editing a row by hand clears its `auto` flag so the generator (npm run db:seo-faq) never overwrites it.
 */
export function FaqEditor({ initial, suggested = [], keyword, hint, name = "faqs" }: { initial: FaqRow[]; suggested?: FaqRow[]; keyword?: string; hint?: string; name?: string }) {
  const [n, setN] = useState(initial.length);
  const [rows, setRows] = useState<Row[]>(() => initial.map((r, i) => ({ ...r, key: i })));
  const set = (i: number, p: Partial<FaqRow>) => setRows((x) => x.map((r, k) => (k === i ? { ...r, ...p, auto: false } : r)));
  const add = (r?: FaqRow) => { setRows((x) => [...x, { q: "", a: "", qAr: "", aAr: "", ...r, key: n }]); setN(n + 1); };
  const move = (i: number, d: -1 | 1) => setRows((x) => { const y = [...x], j = i + d; if (j < 0 || j >= y.length) return x; [y[i], y[j]] = [y[j], y[i]]; return y; });
  const have = new Set(rows.map((r) => r.q.trim().toLowerCase()));
  const fresh = suggested.filter((s) => !have.has(s.q.trim().toLowerCase()));
  const addSuggested = () => { setRows((x) => [...x, ...fresh.map((s, i) => ({ ...s, key: n + i }))]); setN(n + fresh.length); };

  const filled = rows.filter((r) => r.q.trim() && r.a.trim());
  const checks = useMemo(() => {
    const kw = keyword?.trim().toLowerCase();
    const text = filled.map((r) => `${r.q} ${r.a}`).join(" ").toLowerCase();
    return [
      { ok: filled.length >= 3, label: `At least 3 questions (${filled.length})` },
      { ok: filled.length > 0 && filled.every((r) => r.q.trim().endsWith("?") || r.q.trim().endsWith("؟")), label: "Every question ends with a question mark" },
      { ok: filled.length > 0 && filled.every((r) => r.a.trim().length >= ANSWER_MIN && r.a.trim().length <= ANSWER_MAX), label: `Answers of ${ANSWER_MIN}-${ANSWER_MAX} characters (short, complete, easy to quote)` },
      { ok: filled.length > 0 && filled.every((r) => r.qAr?.trim() && r.aAr?.trim()), label: "Arabic question and answer on every row (otherwise the English text is shown)" },
      { ok: /dubai|abu dhabi|sharjah|uae|emirates|دبي|أبوظبي|الشارقة|الإمارات/i.test(text), label: "Mentions Dubai / UAE once (local search)" },
      ...(kw ? [{ ok: text.includes(kw), label: `Uses the keyword “${keyword}”` }] : []),
    ];
  }, [filled, keyword]);

  return (
    <div>
      <input type="hidden" name={name} value={JSON.stringify(rows.map((r) => ({ q: r.q, a: r.a, qAr: r.qAr ?? "", aAr: r.aAr ?? "", auto: !!r.auto })))} />
      {hint && <p className="mb-3 text-xs text-muted">{hint}</p>}
      {rows.length === 0 && <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">No questions yet. Add the questions shoppers really ask: they appear on the page and in Google / AI answers.</p>}
      <ol className="flex flex-col gap-4">
        {rows.map((r, i) => (
          <li key={r.key} className="rounded-xl border border-line p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-muted">Question {i + 1} <span className={`ms-2 rounded-full px-2 py-0.5 text-[10px] ${r.auto ? "bg-surface-2 text-muted" : "bg-brand-soft text-brand"}`}>{r.auto ? "auto-generated" : "written by you"}</span></span>
              <span className="flex gap-1.5">
                <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)} className="rounded-lg border border-line px-2.5 py-1 text-xs disabled:opacity-40">↑</button>
                <button type="button" aria-label="Move down" disabled={i === rows.length - 1} onClick={() => move(i, 1)} className="rounded-lg border border-line px-2.5 py-1 text-xs disabled:opacity-40">↓</button>
                <button type="button" onClick={() => setRows((x) => x.filter((_, k) => k !== i))} className="rounded-lg border border-line px-3 py-1 text-xs font-medium text-danger hover:bg-danger/10">Remove</button>
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-medium text-muted">Question (EN)<input value={r.q} maxLength={200} onChange={(e) => set(i, { q: e.target.value })} className={`${inputCls} mt-1 text-fg`} /></label>
              <label className="text-xs font-medium text-muted">Question (AR)<input value={r.qAr ?? ""} maxLength={200} dir="rtl" onChange={(e) => set(i, { qAr: e.target.value })} className={`${inputCls} mt-1 text-fg`} /></label>
              <label className="text-xs font-medium text-muted">Answer (EN) <span className={r.a.length && (r.a.length < ANSWER_MIN || r.a.length > ANSWER_MAX) ? "text-amber-600" : ""}>· {r.a.length}</span><textarea value={r.a} rows={3} maxLength={1200} onChange={(e) => set(i, { a: e.target.value })} className={`${inputCls} mt-1 text-fg`} /></label>
              <label className="text-xs font-medium text-muted">Answer (AR) <span>· {(r.aAr ?? "").length}</span><textarea value={r.aAr ?? ""} rows={3} maxLength={1200} dir="rtl" onChange={(e) => set(i, { aAr: e.target.value })} className={`${inputCls} mt-1 text-fg`} /></label>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" disabled={rows.length >= 20} onClick={() => add()} className={btnGhost}>+ Add question</button>
        {fresh.length > 0 && <button type="button" disabled={rows.length + fresh.length > 20} onClick={addSuggested} className={btnGhost}>+ Add {fresh.length} suggested question{fresh.length > 1 ? "s" : ""}</button>}
      </div>
      <ul className="mt-4 grid gap-1 rounded-xl bg-surface-2 p-4 text-xs sm:grid-cols-2" aria-label="SEO checklist">
        {checks.map((c) => <li key={c.label} className={c.ok ? "text-green-700" : "text-muted"}><span aria-hidden>{c.ok ? "✓" : "○"}</span> {c.label}</li>)}
      </ul>
    </div>
  );
}
