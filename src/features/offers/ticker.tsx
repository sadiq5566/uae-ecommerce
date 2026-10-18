/** Infinite offer line for the top bar. Content is repeated so the CSS marquee (−50% translate) loops seamlessly. */
export function OfferTicker({ lines, label }: { lines: { key: string; icon: string; text: string }[]; label: string }) {
  if (!lines.length) return null;
  const row = (hidden: boolean) => (
    <ul className="flex shrink-0 items-center gap-10 pe-10" aria-hidden={hidden || undefined}>
      {lines.map((l) => <li key={l.key} className="flex items-center gap-2 whitespace-nowrap"><span aria-hidden>{l.icon}</span>{l.text}</li>)}
    </ul>
  );
  return (
    <div role="region" aria-label={label} className="group overflow-hidden bg-brand py-1.5 text-xs font-semibold text-brand-fg">
      {/* Reduced-motion users get a static, wrapping list instead of a moving line (see globals.css). */}
      <div className="ticker-track animate-marquee flex w-max group-hover:[animation-play-state:paused]" style={{ animationDuration: `${Math.max(20, lines.length * 8)}s` }}>
        {row(false)}{row(true)}
      </div>
    </div>
  );
}
