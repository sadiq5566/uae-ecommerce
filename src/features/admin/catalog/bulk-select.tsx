"use client";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { bulkProductsAction } from "./actions";

type Ctx = { selected: Set<string>; allMatching: boolean; toggle: (id: string) => void };
const SelectionCtx = createContext<Ctx | null>(null);
const useSel = () => { const c = useContext(SelectionCtx); if (!c) throw new Error("BulkForm missing"); return c; };

const btn = "rounded-xl border border-line px-4 py-2.5 text-sm font-semibold transition hover:border-brand disabled:cursor-not-allowed disabled:opacity-40";

/**
 * Owns the selection (React state, so it never drifts from what the checkboxes show) and the bulk form.
 * Selection = ticked rows on this page, or "all N matching the current filters" (even across pages — resolved on the server).
 */
export function BulkForm({ total, pageIds, filterQs, children }: { total: number; pageIds: string[]; filterQs: string; children: ReactNode }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [allMatching, setAllMatching] = useState(false);
  const [busy, setBusy] = useState(false);
  const pageKey = pageIds.join(",");
  // A different page / filter / sort shows different rows: start from a clean selection.
  useEffect(() => { setSelected(new Set()); setAllMatching(false); }, [pageKey, filterQs]);

  const ctx = useMemo<Ctx>(() => ({
    selected, allMatching,
    toggle: (id) => { setAllMatching(false); setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }); },
  }), [selected, allMatching]);

  const count = allMatching ? total : selected.size;
  const pageAll = pageIds.length > 0 && pageIds.every((i) => selected.has(i));
  const pageSome = pageIds.some((i) => selected.has(i));
  const master = useRef<HTMLInputElement>(null);
  useEffect(() => { if (master.current) master.current.indeterminate = (pageSome && !pageAll); }, [pageSome, pageAll]);

  const confirmMsg = (op: string) => `${op === "delete" ? "Delete" : op[0].toUpperCase() + op.slice(1)} ${allMatching ? `ALL ${total} products matching the current filters` : `${count} selected product${count === 1 ? "" : "s"}`}?${op === "delete" ? " Only draft/archived ones are deleted; past orders keep their own copy." : ""}`;

  async function run(op: string) {
    if (!count || busy) return;
    if (!confirm(confirmMsg(op))) return;
    const fd = new FormData();
    fd.set("op", op);
    if (allMatching) { fd.set("scope", "filter"); fd.set("filterQs", filterQs); } else selected.forEach((id) => fd.append("ids", id));
    setBusy(true);
    try { await bulkProductsAction(fd); setSelected(new Set()); setAllMatching(false); } finally { setBusy(false); }
  }

  return (
    <SelectionCtx.Provider value={ctx}>
      <div onSubmit={(e) => e.preventDefault()}>
        <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
          <label className="flex items-center gap-2 font-medium">
            <input ref={master} type="checkbox" checked={pageAll || allMatching} aria-label="Select all products on this page" className="size-4 accent-[var(--brand)]"
              onChange={() => { setAllMatching(false); setSelected(pageAll ? new Set() : new Set(pageIds)); }} />
            Select page
          </label>
          {total > pageIds.length && (
            <button type="button" className={btn} aria-pressed={allMatching} onClick={() => { if (allMatching) { setAllMatching(false); setSelected(new Set()); } else { setAllMatching(true); setSelected(new Set(pageIds)); } }}>
              {allMatching ? "✓ All " + total + " selected (click to clear)" : `Select all ${total} matching`}
            </button>
          )}
          {count > 0 && <button type="button" className="text-muted underline" onClick={() => { setSelected(new Set()); setAllMatching(false); }}>Clear</button>}
          <span className="text-muted" aria-live="polite">{count ? `${count} selected${allMatching ? " (every page of this filter)" : ""}` : "None selected"}</span>
          <span className="mx-1 hidden h-5 w-px bg-line sm:block" aria-hidden />
          {(["publish", "unpublish", "archive", "feature", "unfeature"] as const).map((op) => <button key={op} type="button" disabled={!count || busy} onClick={() => run(op)} className={btn}>{op[0].toUpperCase() + op.slice(1)}</button>)}
          <button type="button" disabled={!count || busy} onClick={() => run("delete")} className="rounded-xl border border-danger/40 px-4 py-2.5 text-sm font-semibold text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-40">Delete</button>
          {busy && <span className="text-muted">Working…</span>}
        </div>
        {allMatching && total > 10_000 && <p role="note" className="mb-2 text-xs text-gold-ink">Bulk actions on a filter handle up to 10,000 products at a time.</p>}
        {children}
      </div>
    </SelectionCtx.Provider>
  );
}

/** One row's checkbox. */
export function RowCheck({ id, label }: { id: string; label: string }) {
  const { selected, allMatching, toggle } = useSel();
  return <input type="checkbox" checked={allMatching || selected.has(id)} onChange={() => toggle(id)} aria-label={`Select ${label}`} className="size-4 accent-[var(--brand)]" />;
}
