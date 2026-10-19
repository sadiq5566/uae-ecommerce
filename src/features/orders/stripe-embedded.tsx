"use client";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import type { Appearance } from "@stripe/stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { useMemo, useState, useSyncExternalStore } from "react";

export type PayLabels = { pay: string; processing: string; secure: string; failed: string };

// The pay form follows the store's light/dark theme: same colours, radius and focus ring as the rest of the site.
const themeOf = () => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");
const subscribeTheme = (cb: () => void) => {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => mo.disconnect();
};

function appearance(theme: string): Appearance {
  const root = getComputedStyle(document.documentElement);
  const v = (n: string) => root.getPropertyValue(n).trim();
  return {
    theme: theme === "dark" ? "night" : "stripe",
    variables: {
      colorPrimary: v("--brand"), colorBackground: v("--surface"), colorText: v("--fg"), colorTextSecondary: v("--muted"), colorDanger: v("--danger"),
      fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif", borderRadius: "12px", spacingUnit: "4px", spacingGridRow: "16px",
    },
    rules: {
      ".Input": { border: `1px solid ${v("--line")}`, boxShadow: "none", padding: "13px 14px" },
      ".Input:focus": { border: `1px solid ${v("--brand")}`, boxShadow: `0 0 0 1px ${v("--brand")}` },
      ".Label": { fontWeight: "500", marginBottom: "6px" },
      ".Tab": { border: `1px solid ${v("--line")}`, boxShadow: "none" },
      ".Tab--selected": { border: `1px solid ${v("--brand")}`, boxShadow: `0 0 0 1px ${v("--brand")}` },
    },
  };
}

function Form({ returnUrl, labels }: { returnUrl: string; labels: PayLabels }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [ready, setReady] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!stripe || !elements || busy) return;
        setBusy(true); setError(undefined);
        const res = await stripe.confirmPayment({ elements, confirmParams: { return_url: returnUrl } });
        // On success Stripe redirects to returnUrl; we only get here when the customer needs to fix something.
        setError(res.error?.message ?? labels.failed); setBusy(false);
      }}
      className="flex flex-col gap-5"
    >
      {!ready && <div className="skeleton h-48 rounded-2xl" aria-hidden />}
      <div className={ready ? "" : "sr-only"}><PaymentElement onReady={() => setReady(true)} options={{ layout: "tabs" }} /></div>
      {error && <p role="alert" className="rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p>}
      <button
        disabled={!stripe || !ready || busy}
        className="rounded-xl bg-brand px-6 py-4 text-base font-semibold text-brand-fg shadow-card transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
      >{busy ? `${labels.processing}…` : `🔒 ${labels.pay}`}</button>
      <p className="text-center text-xs text-muted">{labels.secure}</p>
    </form>
  );
}

export function StripeEmbedded({ publishableKey, clientSecret, returnUrl, locale, labels }: { publishableKey: string; clientSecret: string; returnUrl: string; locale: "en" | "ar"; labels: PayLabels }) {
  const stripe = useMemo(() => loadStripe(publishableKey), [publishableKey]);
  const theme = useSyncExternalStore(subscribeTheme, themeOf, () => "light");
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false); // false during SSR/hydration: the theme is only known in the browser
  if (!mounted) return <div className="skeleton h-64 rounded-2xl" aria-hidden />;
  // Keyed by theme: switching light/dark rebuilds the element with matching colours.
  return (
    <Elements key={theme} stripe={stripe} options={{ clientSecret, appearance: appearance(theme), locale }}>
      <Form returnUrl={returnUrl} labels={labels} />
    </Elements>
  );
}
