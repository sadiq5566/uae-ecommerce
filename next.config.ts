import path from "node:path";
import type { NextConfig } from "next";

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
  images: {
    remotePatterns: imageHosts.map((hostname) => ({ protocol: "https" as const, hostname })),
  },
};

export default nextConfig;
