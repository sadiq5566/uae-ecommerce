import Link from "next/link";

export type Crumb = { label: string; href?: string };

export function Breadcrumbs({ items, label }: { items: Crumb[]; label: string }) {
  return (
    <nav aria-label={label} className="text-sm text-muted">
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((c, i) => (
          <li key={i} className="flex items-center gap-1.5">
            {i > 0 && <span aria-hidden className="flip-rtl">›</span>}
            {c.href ? <Link href={c.href} className="hover:text-brand">{c.label}</Link> : <span aria-current="page" className="text-fg">{c.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}
