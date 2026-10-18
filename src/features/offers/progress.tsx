import type { Dictionary } from "@/lib/dictionaries";
import { fmt } from "@/lib/format";
import { formatAED, type Locale } from "@/lib/i18n";
import { offerProgress, type PublicOffers } from "./shared";

/** "Add AED X more for free delivery" nudge with a progress bar toward the nearest locked reward. */
export function OfferProgress({ subtotal, offers, locale, t }: { subtotal: number; offers: PublicOffers; locale: Locale; t: Dictionary }) {
  const p = offerProgress(subtotal, offers);
  if (!p.next && !p.freeUnlocked && !p.tierUnlocked) return null;
  const pct = p.next ? Math.min(100, Math.round((subtotal / p.next.target) * 100)) : 100;
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 text-sm" role="status">
      {p.next && (
        <>
          <p className="font-semibold">{p.next.kind === "free" ? fmt(t.offers.progressFree, { amount: formatAED(p.next.left, locale) }) : fmt(t.offers.progressTier, { amount: formatAED(p.next.left, locale), pct: offers.tier.pct })}</p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden><div className="h-full rounded-full bg-brand transition-all duration-500" style={{ width: `${pct}%` }} /></div>
        </>
      )}
      {(p.freeUnlocked || p.tierUnlocked) && (
        <ul className={`flex flex-col gap-1 font-medium text-brand ${p.next ? "mt-3" : ""}`}>
          {p.freeUnlocked && <li>{t.offers.unlockedFree}</li>}
          {p.tierUnlocked && <li>{fmt(t.offers.unlockedTier, { pct: offers.tier.pct })}</li>}
        </ul>
      )}
    </div>
  );
}
