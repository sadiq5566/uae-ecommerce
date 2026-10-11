import type { ReactNode } from "react";

/**
 * Renders admin-authored plain text safely (React escapes everything; no HTML is ever injected).
 * Supports: blank line = paragraph, "## " heading, "- " list items.
 */
export function RichText({ text, className = "" }: { text: string; className?: string }) {
  const blocks = text.replace(/\r\n/g, "\n").split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const out: ReactNode[] = blocks.map((b, i) => {
    if (b.startsWith("## ")) return <h2 key={i} className="mt-8 font-display text-2xl font-bold">{b.slice(3)}</h2>;
    const lines = b.split("\n");
    if (lines.every((l) => l.trim().startsWith("- "))) return <ul key={i} className="my-4 list-disc space-y-1.5 ps-6">{lines.map((l, k) => <li key={k}>{l.trim().slice(2)}</li>)}</ul>;
    return <p key={i} className="my-4 leading-relaxed">{lines.map((l, k) => <span key={k}>{k > 0 && <br />}{l}</span>)}</p>;
  });
  return <div className={`text-fg/90 ${className}`}>{out}</div>;
}
