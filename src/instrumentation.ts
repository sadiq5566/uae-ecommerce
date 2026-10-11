import type { Instrumentation } from "next";

/** Fail fast on bad production configuration (clear message at boot instead of a 500 on the first request). */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "production") return;
  const { getEnv } = await import("./lib/env");
  const env = getEnv();
  if (!env.NEXT_PUBLIC_SITE_URL.startsWith("https://")) console.warn("[config] NEXT_PUBLIC_SITE_URL is not https:// — cookies are Secure and payment/webhook URLs must be https in production.");
  if (/^mongodb:\/\/(127\.0\.0\.1|localhost)/.test(env.MONGODB_URI)) console.warn("[config] MONGODB_URI points at localhost in production.");
  if (!env.CRON_SECRET) console.warn("[config] CRON_SECRET is not set: /api/cron/maintenance is disabled (unpaid orders won't expire).");
}

/**
 * Central place for server error reporting. Logs a structured line (picked up by your host's log drain) and is the hook for
 * Sentry/Datadog/etc. — e.g. `await Sentry.captureRequestError(err, request, context)`. Never log request bodies, cookies or headers.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const e = err as { message?: string; digest?: string };
  console.error(JSON.stringify({ level: "error", msg: e?.message ?? String(err), digest: e?.digest, path: request.path.split("?")[0], method: request.method, route: context.routePath, type: context.routeType }));
};
