import path from "node:path";
import type { NextConfig } from "next";
import { privateHeaders, securityHeaders } from "./src/lib/security-headers";

// Remote images (product photos on your CDN / object storage). Comma-separated hostnames in IMAGE_HOSTS.
// The same list is enforced when staff add image URLs or import CSVs, so next/image never proxies arbitrary hosts.
const imageHosts = (process.env.IMAGE_HOSTS ?? "").split(",").map((h) => h.trim()).filter(Boolean);

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.resolve(process.cwd()),
  turbopack: {
    root: path.resolve(process.cwd()),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders({ production: process.env.NODE_ENV === "production", imageHosts, stripe: process.env.PAYMENT_PROVIDER === "stripe" }) },
      // Admin, API and account areas: never indexed, never cached by shared caches.
      { source: "/admin/:path*", headers: privateHeaders },
      { source: "/api/:path*", headers: privateHeaders },
      { source: "/:lang(en|ar)/(account|cart|checkout|wishlist|pay)/:path*", headers: privateHeaders },
    ];
  },
  poweredByHeader: false,
  images: {
    remotePatterns: imageHosts.map((hostname) => ({ protocol: "https" as const, hostname })),
  },
};

export default nextConfig;
