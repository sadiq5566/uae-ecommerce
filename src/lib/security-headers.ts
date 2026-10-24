// Security response headers, kept in one pure module so they can be unit-tested and reused by next.config.ts.

export function contentSecurityPolicy(imageHosts: string[] = [], stripe = false) {
  const img = ["'self'", "data:", "blob:", "https:", ...imageHosts.map((h) => `https://${h}`)].join(" ");
  return [
    "default-src 'self'",
    // 'unsafe-inline' is required today for Next's inline bootstrap and the no-flash theme script. To go nonce-based
    // (strict) see docs/security.md — it needs dynamic rendering of every page via proxy.ts.
    `script-src 'self' 'unsafe-inline'${stripe ? " https://js.stripe.com" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src ${img}`,
    "font-src 'self' data:",
    `connect-src 'self'${stripe ? " https://api.stripe.com https://m.stripe.network https://r.stripe.com" : ""}`, // add analytics/Sentry hosts here when integrating them
    ...(stripe ? ["frame-src https://js.stripe.com https://hooks.stripe.com https://checkout.stripe.com"] : []),
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

export type Header = { key: string; value: string };

export function securityHeaders({ production, imageHosts = [], stripe = false }: { production: boolean; imageHosts?: string[]; stripe?: boolean }): Header[] {
  const h: Header[] = [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    // payment=(self) is needed for Apple Pay / Google Pay in the Payment Request API if you enable them.
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self), usb=(), interest-cohort=()" },
  ];
  if (production) {
    h.push({ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" });
    h.push({ key: "Content-Security-Policy", value: contentSecurityPolicy(imageHosts, stripe) }); // dev needs eval/websockets, so CSP is production-only
  }
  return h;
}

/** Private areas must never be indexed or cached by shared caches. */
export const privateHeaders: Header[] = [
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
  { key: "Cache-Control", value: "private, no-store, max-age=0" },
];
