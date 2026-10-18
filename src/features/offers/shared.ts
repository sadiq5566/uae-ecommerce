import { fmt } from "@/lib/format";
import { formatAED, type Locale } from "@/lib/i18n";
import type { Dictionary } from "@/lib/dictionaries";

/** Storefront-safe view of the store's automatic offers (numbers only — never secrets). */
export type PublicOffers = {
  freeDelivery: { enabled: boolean; min: number };
  tier: { enabled: boolean; min: number; pct: number };
  firstOrder: { enabled: boolean; pct: number };
  cod: boolean; returnDays: number;
  modal: { enabled: boolean; delaySeconds: number; version: string; collectLeads: boolean; title?: { en?: string; ar?: string }; body?: { en?: string; ar?: string } };
};

/** The human-readable offer lines, in the order they should be advertised. */
export function offerLines(o: PublicOffers, t: Dictionary, locale: Locale): { key: string; icon: string; text: string }[] {
  const out: { key: string; icon: string; text: string }[] = [];
  if (o.freeDelivery.enabled) out.push({ key: "free", icon: "🚚", text: fmt(t.offers.freeDelivery, { min: formatAED(o.freeDelivery.min, locale) }) });
  if (o.tier.enabled) out.push({ key: "tier", icon: "🏷️", text: fmt(t.offers.tier, { pct: o.tier.pct, min: formatAED(o.tier.min, locale) }) });
  if (o.firstOrder.enabled) out.push({ key: "first", icon: "🎁", text: fmt(t.offers.firstOrder, { pct: o.firstOrder.pct }) });
  if (o.cod) out.push({ key: "cod", icon: "💵", text: t.offers.cod });
  if (o.returnDays > 0) out.push({ key: "returns", icon: "↩️", text: fmt(t.offers.returns, { days: o.returnDays }) });
  return out;
}

/** How far the cart is from the next reward. Pure — used by the cart and checkout nudges. */
export function offerProgress(subtotal: number, o: PublicOffers) {
  const freeLeft = o.freeDelivery.enabled ? Math.max(0, o.freeDelivery.min - subtotal) : 0;
  const tierLeft = o.tier.enabled ? Math.max(0, o.tier.min - subtotal) : 0;
  return {
    freeLeft, tierLeft,
    freeUnlocked: o.freeDelivery.enabled && freeLeft === 0 && subtotal > 0,
    tierUnlocked: o.tier.enabled && tierLeft === 0 && subtotal > 0,
    // The next goal to nudge toward: the nearest locked reward.
    next: ((): { kind: "free" | "tier"; left: number; target: number } | null => {
      const c = [
        o.freeDelivery.enabled && freeLeft > 0 ? { kind: "free" as const, left: freeLeft, target: o.freeDelivery.min } : null,
        o.tier.enabled && tierLeft > 0 ? { kind: "tier" as const, left: tierLeft, target: o.tier.min } : null,
      ].filter((x): x is NonNullable<typeof x> => !!x);
      return c.sort((a, b) => a.left - b.left)[0] ?? null;
    })(),
  };
}
