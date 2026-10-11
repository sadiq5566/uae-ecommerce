import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: () => { throw new Error("redirect"); } }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => null }));
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { can, isStaff, ROLE_PERMISSIONS } from "@/lib/auth/permissions";
import { addressSchema, loginSchema, normalizeUaePhone, profileSchema, registerSchema } from "@/features/auth/schemas";
import { ROLES } from "@/models/user";

const { safeNext } = await import("@/lib/auth/guard");

describe("password hashing", () => {
  it("verifies the right password and rejects wrong ones", async () => {
    const h = await hashPassword("correct horse battery");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("correct horse battery", h)).toBe(true);
    expect(await verifyPassword("wrong", h)).toBe(false);
  });
  it("salts: same password hashes differently", async () => {
    expect(await hashPassword("same-password-1")).not.toBe(await hashPassword("same-password-1"));
  });
  it("never verifies when the account doesn't exist", async () => {
    expect(await verifyPassword("anything", undefined)).toBe(false);
  });
});

describe("safeNext (open-redirect guard)", () => {
  it("allows same-site paths", () => expect(safeNext("/en/account?x=1", "/f")).toBe("/en/account?x=1"));
  it.each(["//evil.com", "https://evil.com", "/\\evil.com", "javascript:alert(1)", "", null, undefined])("rejects %s", (v) => expect(safeNext(v as string, "/f")).toBe("/f"));
});

describe("roles & permissions", () => {
  it("customers have no staff permissions", () => {
    expect(ROLE_PERMISSIONS.customer).toHaveLength(0);
    expect(isStaff("customer")).toBe(false);
    expect(can("customer", "products:write")).toBe(false);
  });
  it("owner can do everything every role can", () => {
    for (const r of ROLES) for (const p of ROLE_PERMISSIONS[r]) expect(can("owner", p)).toBe(true);
  });
  it("roles are least-privilege", () => {
    expect(can("catalog_manager", "products:write")).toBe(true);
    expect(can("catalog_manager", "orders:write")).toBe(false);
    expect(can("content_editor", "products:write")).toBe(false);
    expect(can("operations_manager", "users:manage")).toBe(false);
    expect(can(undefined, "dashboard:read")).toBe(false);
  });
});

describe("UAE phone numbers", () => {
  it.each([["050 123 4567", "+971501234567"], ["+971 50 123 4567", "+971501234567"], ["00971501234567", "+971501234567"], ["04 123 4567", "+97141234567"], ["0551234567", "+971551234567"]])("normalises %s", (i, o) => expect(normalizeUaePhone(i)).toBe(o));
  it.each(["12345", "+1 202 555 0100", "050123", "abc", "0101234567"])("rejects %s", (i) => expect(normalizeUaePhone(i)).toBeNull());
});

describe("schemas", () => {
  it("normalises and validates registration", () => {
    const r = registerSchema.safeParse({ name: " Sara ", email: " SARA@Example.COM ", password: "longenough1" });
    expect(r.success && r.data.email).toBe("sara@example.com");
    expect(registerSchema.safeParse({ name: "S", email: "bad", password: "short" }).success).toBe(false);
  });
  it("returns localisable error keys", () => {
    const r = registerSchema.safeParse({ name: "Sara", email: "a@b.co", password: "short" });
    expect(!r.success && r.error.issues[0].message).toBe("password_short");
  });
  it("login accepts any non-empty password (no policy leak)", () => {
    expect(loginSchema.safeParse({ email: "a@b.co", password: "x" }).success).toBe(true);
  });
  it("validates a UAE address and rejects unknown emirates", () => {
    const ok = { recipientName: "Sara Ali", phone: "050 123 4567", emirate: "dubai", area: "Marina", building: "Tower 1", isDefault: "on" };
    const r = addressSchema.safeParse(ok);
    expect(r.success && r.data.phone).toBe("+971501234567");
    expect(r.success && r.data.isDefault).toBe(true);
    expect(addressSchema.safeParse({ ...ok, emirate: "riyadh" }).success).toBe(false);
    expect(addressSchema.safeParse({ ...ok, phone: "123" }).success).toBe(false);
  });
  it("profile phone is optional", () => {
    expect(profileSchema.safeParse({ name: "Sara", phone: "", locale: "en" }).success).toBe(true);
    expect(profileSchema.safeParse({ name: "Sara", phone: "999", locale: "en" }).success).toBe(false);
  });
});
