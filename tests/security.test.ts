import { afterEach, describe, expect, it, vi } from "vitest";
import { contentSecurityPolicy, privateHeaders, securityHeaders } from "@/lib/security-headers";

describe("security headers", () => {
  const get = (h: { key: string; value: string }[], k: string) => h.find((x) => x.key === k)?.value;

  it("always sends the baseline headers", () => {
    const h = securityHeaders({ production: false });
    expect(get(h, "X-Content-Type-Options")).toBe("nosniff");
    expect(get(h, "X-Frame-Options")).toBe("DENY");
    expect(get(h, "Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(get(h, "Permissions-Policy")).toMatch(/camera=\(\)/);
    expect(get(h, "Cross-Origin-Opener-Policy")).toBe("same-origin");
  });
  it("adds HSTS and CSP only in production (dev needs eval/websockets)", () => {
    expect(get(securityHeaders({ production: false }), "Content-Security-Policy")).toBeUndefined();
    expect(get(securityHeaders({ production: false }), "Strict-Transport-Security")).toBeUndefined();
    const prod = securityHeaders({ production: true });
    expect(get(prod, "Strict-Transport-Security")).toMatch(/max-age=63072000/);
    expect(get(prod, "Content-Security-Policy")).toBeTruthy();
  });
  it("CSP blocks framing, plugins, foreign form posts and foreign scripts/connections", () => {
    const csp = contentSecurityPolicy();
    for (const d of ["default-src 'self'", "object-src 'none'", "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'", "connect-src 'self'", "upgrade-insecure-requests"]) expect(csp).toContain(d);
    expect(csp).not.toMatch(/unsafe-eval/);
    expect(csp).not.toMatch(/script-src[^;]*\*/);
    expect(csp).not.toMatch(/script-src[^;]*https?:/);
  });
  it("allows images only from self/data/blob and the configured hosts", () => {
    const csp = contentSecurityPolicy(["cdn.example.com"]);
    expect(csp).toContain("img-src 'self' data: blob: https://cdn.example.com");
    expect(contentSecurityPolicy()).not.toContain("https:");
  });
  it("private areas are noindex and never shared-cached", () => {
    expect(get(privateHeaders, "X-Robots-Tag")).toContain("noindex");
    expect(get(privateHeaders, "Cache-Control")).toMatch(/no-store/);
  });
});

describe("cookie policy", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });
  it("uses __Host- prefixed names and Secure in production", async () => {
    vi.stubEnv("NODE_ENV", "production"); vi.resetModules();
    const c = await import("@/lib/auth/cookies");
    expect(c.SESSION_COOKIE).toBe("__Host-session");
    expect(c.CART_COOKIE).toBe("__Host-cart");
    expect(c.secureCookie).toBe(true);
  });
  it("uses plain names over http in development", async () => {
    vi.stubEnv("NODE_ENV", "development"); vi.resetModules();
    const c = await import("@/lib/auth/cookies");
    expect(c.SESSION_COOKIE).toBe("session");
    expect(c.secureCookie).toBe(false);
  });
  it("staff sessions are shorter than customer sessions", async () => {
    const c = await import("@/lib/auth/cookies");
    expect(c.ttlFor("customer")).toBeGreaterThan(c.ttlFor("owner"));
    for (const r of ["owner", "catalog_manager", "operations_manager", "content_editor"]) expect(c.ttlFor(r)).toBe(c.SESSION_TTL_S.staff);
    expect(c.ttlFor(undefined)).toBe(c.SESSION_TTL_S.customer);
  });
});
