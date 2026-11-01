import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: { include: ["tests/**/*.test.ts"], fileParallelism: false /* the integration tests share one local MongoDB and flake when run side by side */, testTimeout: 30_000, hookTimeout: 60_000 }, // integration tests build indexes on first use
});
