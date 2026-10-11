"use client";
import { useActionState, useState } from "react";
import { Card, Pill, Table, btnGhost, btnPrimary, inputCls } from "@/components/admin/ui";
import { toCsv } from "@/lib/csv";
import { importBatchAction, previewImportAction, type BatchResult, type IssueLite, type Kind, type PreviewState } from "./actions";

const BATCH = 100;

export function ImportWizard({ kind, label }: { kind: Kind; label: string }) {
  const [preview, formAction, previewing] = useActionState<PreviewState, FormData>(previewImportAction, null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [results, setResults] = useState<BatchResult[] | null>(null);
  const [fatal, setFatal] = useState("");

  const p = preview && preview.ok ? preview : null;
  const valid = p?.issues.filter((i) => i.action !== "error") ?? [];
  const invalid = p?.issues.filter((i) => i.action === "error") ?? [];

  async function run() {
    if (!p) return;
    setResults(null); setFatal("");
    const validLines = new Set(valid.map((v) => v.line));
    let rows = p.rows.filter((r) => validLines.has(r.line));
    if (kind === "categories") rows = [...rows.filter((r) => !r.data.parent_slug), ...rows.filter((r) => r.data.parent_slug)]; // parents before children
    const all: BatchResult[] = [];
    for (let i = 0; i < rows.length; i += BATCH) {
      setProgress({ done: i, total: rows.length });
      const res = await importBatchAction(kind, p.present, rows.slice(i, i + BATCH));
      if (!res.ok) { setFatal(res.error ?? "Import failed"); break; }
      all.push(...res.results);
    }
    setProgress(null); setResults(all);
  }

  const count = (s: BatchResult["status"]) => results?.filter((r) => r.status === s).length ?? 0;
  function downloadErrors() {
    const rows: unknown[][] = [...invalid.map((i) => [i.line, i.sku, "rejected in preview", i.errors.join("; ")]), ...(results ?? []).filter((r) => r.status === "failed").map((r) => [r.line, r.sku, "failed during import", r.errors.join("; ")])];
    const url = URL.createObjectURL(new Blob([toCsv(["line", "key", "stage", "errors"], rows)], { type: "text/csv" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `${kind}-import-errors.csv` }); a.click(); URL.revokeObjectURL(url);
  }
  const tone = (a: IssueLite["action"]) => (a === "create" ? "green" : a === "update" ? "gold" : "red");

  return (
    <Card title={`Import ${label}`}>
      <form action={formAction} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="kind" value={kind} />
        <label className="text-sm font-medium">CSV file (max 2 MB, 5,000 rows)<input type="file" name="file" accept=".csv,text/csv" required className={`${inputCls} mt-1.5`} /></label>
        <button disabled={previewing} className={btnGhost}>{previewing ? "Checking…" : "1 · Upload & preview"}</button>
      </form>
      {preview && !preview.ok && <p role="alert" className="mt-4 rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">{preview.error}</p>}
      {p && (
        <div className="mt-5 flex flex-col gap-4">
          {p.unknown.length > 0 && <p className="rounded-xl bg-gold-soft px-4 py-3 text-sm text-gold-ink">Ignored unknown column(s): {p.unknown.join(", ")}</p>}
          <div className="flex flex-wrap gap-2 text-sm"><Pill tone="green">{valid.filter((v) => v.action === "create").length} to create</Pill><Pill tone="gold">{valid.filter((v) => v.action === "update").length} to update</Pill><Pill tone={invalid.length ? "red" : "grey"}>{invalid.length} with errors</Pill></div>
          <p className="text-xs text-muted">Columns found: {p.present.join(", ")}. Only these columns are written; empty cells leave existing values unchanged. Rows with errors are <b>not</b> imported — fix them and re-upload (download the error report below).</p>
          <Table head={["Line", "Key", "Action", "Details"]}>
            {p.issues.slice(0, 60).map((i) => <tr key={i.line}><td>{i.line}</td><td className="font-mono text-xs">{i.sku || "—"}</td><td><Pill tone={tone(i.action)}>{i.action}</Pill></td><td className="text-xs text-danger">{i.errors.join("; ")}</td></tr>)}
          </Table>
          {p.issues.length > 60 && <p className="text-xs text-muted">Showing the first 60 of {p.issues.length} rows.</p>}
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={run} disabled={!!progress || valid.length === 0} className={btnPrimary}>{progress ? "Importing…" : `2 · Import ${valid.length} valid row${valid.length === 1 ? "" : "s"}`}</button>
            {(invalid.length > 0 || count("failed") > 0) && <button onClick={downloadErrors} className={btnGhost}>Download error report (CSV)</button>}
          </div>
          {progress && <div role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done} className="h-2 overflow-hidden rounded-full bg-surface-2"><div className="h-full bg-brand transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} /></div>}
          {fatal && <p role="alert" className="text-sm text-danger">{fatal}</p>}
          {results && (
            <div role="status" className="rounded-xl bg-brand-soft px-4 py-3 text-sm text-brand">
              <b>Import finished.</b> Created {count("created")}, updated {count("updated")}, failed {count("failed")}, skipped (invalid in preview) {invalid.length}.
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
