"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toCsv } from "../../../lib/csv";
import { btnGhost, btnPrimary } from "@/components/admin/ui";

type Row = { line: number; sku: string; name: string; action: "create" | "update" | "error"; errors: string[] };
type Rec = { line: number; record: Record<string, string> };
type Preview = { total: number; create: number; update: number; invalid: number; unknownColumns: string[]; rows: Row[]; records: Rec[] };
type Failure = { line: number; sku: string; error: string };
type Summary = { created: number; updated: number; failed: Failure[]; cloudinary: boolean };

const MAX_BYTES = 5 * 1024 * 1024;
const BATCH = 100;

export default function ImportTool() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"" | "preview" | "import">("");
  const [progress, setProgress] = useState(0);
  const [summary, setSummary] = useState<Summary | null>(null);

  function reset() {
    setCsv("");
    setFileName("");
    setPreview(null);
    setSummary(null);
    setError("");
    setProgress(0);
    if (input.current) input.current.value = "";
  }

  async function pick(f?: File) {
    setPreview(null);
    setSummary(null);
    setError("");
    setCsv("");
    setFileName("");
    if (!f) return;
    if (!/\.(csv|txt)$/i.test(f.name)) return setError("Please choose a .csv file.");
    if (f.size > MAX_BYTES) return setError("File is larger than 5 MB. Split it into smaller files.");
    setFileName(f.name);
    setCsv(await f.text());
  }

  async function post(payload: unknown) {
    const res = await fetch("/api/admin/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    let data: Record<string, unknown> = {};
    try {
      data = await res.json();
    } catch {
      /* non-JSON error page */
    }
    if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : `Request failed (${res.status})`);
    return data;
  }

  async function runPreview() {
    setBusy("preview");
    setError("");
    setSummary(null);
    try {
      setPreview((await post({ csv })) as unknown as Preview);
      setShowAll(false);
    } catch (e) {
      setPreview(null);
      setError(e instanceof Error ? e.message : "Preview failed");
    }
    setBusy("");
  }

  async function runImport() {
    if (!preview) return;
    setBusy("import");
    setError("");
    setProgress(0);
    let created = 0;
    let updated = 0;
    let cloudinary = false;
    const failed: Failure[] = [];
    const { records } = preview;
    try {
      for (let i = 0; i < records.length; i += BATCH) {
        const r = (await post({ records: records.slice(i, i + BATCH) })) as unknown as Summary;
        created += r.created;
        updated += r.updated;
        cloudinary = r.cloudinary;
        failed.push(...r.failed);
        setProgress(Math.min(100, Math.round(((i + BATCH) / records.length) * 100)));
      }
    } catch (e) {
      setError(`Stopped after ${created + updated} products: ${e instanceof Error ? e.message : "import failed"}. Fix the problem and import again; finished rows are simply updated.`);
    }
    // Rows that failed validation in the preview are part of the report too.
    const skipped = preview.rows.filter((r) => r.action === "error").map((r) => ({ line: r.line, sku: r.sku, error: r.errors.join("; ") }));
    setSummary({ created, updated, failed: [...skipped, ...failed], cloudinary });
    setPreview(null);
    setBusy("");
    router.refresh();
  }

  function downloadErrors() {
    const list: Failure[] = summary?.failed ?? preview?.rows.filter((r) => r.action === "error").map((r) => ({ line: r.line, sku: r.sku, error: r.errors.join("; ") })) ?? [];
    const blob = new Blob([toCsv(["line", "sku", "error"], list.map((f) => [f.line, f.sku, f.error]))], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "import-errors.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const shown = preview
    ? showAll
      ? preview.rows
      : [...preview.rows.filter((r) => r.action === "error"), ...preview.rows.filter((r) => r.action !== "error")].slice(0, 100)
    : [];
  const importable = preview ? preview.create + preview.update : 0;

  return (
    <div className="max-w-5xl space-y-6">
      <div className="border border-line bg-surface p-5 text-sm leading-relaxed text-muted">
        <p className="mb-2">Header row (comma separated). Only <code>sku</code> is always required; common aliases such as <code>title</code>, <code>price</code>, <code>qty</code> and <code>image</code> are understood.</p>
        <code className="block break-words text-xs text-fg">sku,name,slug,category,subcategory,brand,model,color,finish,price_from,price_to,currency,short_description,long_description,included_items,images,stock,status,tags</code>
        <ul className="mt-3 list-disc space-y-1 pl-5">
          <li>Use <code>|</code> to separate several values in <code>included_items</code>, <code>images</code> and <code>tags</code>.</li>
          <li>Rows are matched by <code>sku</code>: an existing SKU is updated, a new one is created. <b>An empty cell leaves the existing value unchanged</b>, so a file with just <code>sku,price_to</code> updates prices only.</li>
          <li>New products without a status are saved as <b>draft</b>. Max 5,000 rows / 5 MB per file.</li>
        </ul>
        <p className="mt-3 flex flex-wrap gap-x-4">
          <a href="/sample-products.csv" download className="text-brand underline">Download a sample CSV</a>
          <a href="/api/admin/export?type=products" className="text-brand underline">Export all products (CSV)</a>
          <a href="/api/admin/export?type=collections" className="text-brand underline">Export collections (CSV)</a>
        </p>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="csv-file">CSV file</label>
        <input ref={input} id="csv-file" type="file" accept=".csv,text/csv" className="w-full rounded-xl border border-line bg-surface px-3 py-2" disabled={!!busy} onChange={(e) => pick(e.target.files?.[0])} />
        {fileName && <p className="mt-1 text-xs text-muted">{fileName} · {(csv.length / 1024).toFixed(1)} KB</p>}
      </div>

      <div className="flex flex-wrap gap-3">
        <button disabled={!csv || !!busy} onClick={runPreview} className={`${btnGhost} disabled:opacity-40`}>{busy === "preview" ? "Checking…" : "Preview & validate"}</button>
        {(csv || preview || summary) && !busy && <button onClick={reset} className={`${btnGhost}`}>Clear</button>}
      </div>
      {error && <p role="alert" className="border border-danger/30 bg-danger/5 p-3 text-sm text-danger">{error}</p>}

      {preview && (
        <div className="space-y-4">
          <p className="text-sm">
            <b>{preview.create}</b> to create · <b>{preview.update}</b> to update · <b className={preview.invalid ? "text-danger" : ""}>{preview.invalid}</b> with errors <span className="text-muted">(rows with errors are skipped, the rest still import)</span>
          </p>
          {preview.unknownColumns.length > 0 && <p className="border border-brand/40 bg-brand-soft p-3 text-sm">Ignored unknown columns: <b>{preview.unknownColumns.join(", ")}</b></p>}
          <div className="max-h-96 overflow-auto border border-line bg-surface">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="sticky top-0 bg-surface-2 text-xs uppercase tracking-wide text-muted"><tr><th className="p-2">Line</th><th>SKU</th><th>Name</th><th>Result</th></tr></thead>
              <tbody className="divide-y divide-line">
                {shown.map((r) => (
                  <tr key={r.line}>
                    <td className="p-2">{r.line}</td><td>{r.sku}</td><td>{r.name}</td>
                    <td className={r.action === "error" ? "text-danger" : "text-[#2f7a4d]"}>{r.action === "error" ? r.errors.join("; ") : r.action === "create" ? "New product" : "Update existing"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.rows.length > shown.length && <button className="text-sm underline" onClick={() => setShowAll(true)}>Show all {preview.rows.length} rows</button>}
          <div className="flex flex-wrap items-center gap-3">
            <button disabled={!importable || !!busy} onClick={runImport} className={`${btnPrimary} disabled:opacity-40`}>{busy === "import" ? `Importing… ${progress}%` : `Import ${importable} products`}</button>
            {preview.invalid > 0 && <button onClick={downloadErrors} className={`${btnGhost}`}>Download error report (CSV)</button>}
          </div>
          {busy === "import" && <div className="h-1.5 w-full bg-line" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><div className="h-full bg-brand transition-all" style={{ width: `${progress}%` }} /></div>}
        </div>
      )}

      {summary && (
        <div role="status" className="space-y-2 border border-brand/40 bg-brand-soft p-4 text-sm">
          <p><b>Done.</b> {summary.created} created, {summary.updated} updated{summary.failed.length ? `, ${summary.failed.length} not imported` : ""}.</p>
          {!summary.cloudinary && <p className="text-muted">Image URLs were kept as given (Cloudinary is not configured, so they were not re-uploaded).</p>}
          {summary.failed.slice(0, 20).map((f) => <p key={`${f.line}-${f.sku}`} className="text-danger">Line {f.line} ({f.sku || "no sku"}): {f.error}</p>)}
          {summary.failed.length > 20 && <p className="text-muted">…and {summary.failed.length - 20} more in the error report.</p>}
          <div className="flex flex-wrap gap-3 pt-1">
            {summary.failed.length > 0 && <button onClick={downloadErrors} className={`${btnGhost}`}>Download error report (CSV)</button>}
            <Link href="/admin/products" className={`${btnPrimary}`}>View products</Link>
          </div>
        </div>
      )}
    </div>
  );
}
