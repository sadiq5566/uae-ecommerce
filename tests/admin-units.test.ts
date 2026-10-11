import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { dubaiDay, eachDay, parseRange } from "@/lib/admin/range";
import { maskEmail, maskPhone } from "@/features/admin/people/mask";
import { effectivePrice } from "@/models/product";
import { sniffImage } from "@/lib/storage";
import { isAllowedImageUrl } from "@/lib/image-url";
import { slugify } from "@/features/admin/csv/products";
import { ROLE_PERMISSIONS, can } from "@/lib/auth/permissions";
import { optDate } from "@/lib/admin/common";
import { cleanText, displayName } from "@/features/reviews/service";

describe("date ranges (UAE time)", () => {
  const now = new Date("2026-10-11T20:30:00Z"); // = 2026-10-12 00:30 in Dubai
  it("treats the Dubai calendar day as 'today'", () => {
    const r = parseRange({ range: "today" }, now);
    expect(dubaiDay(r.from)).toBe("2026-10-12");
    expect(dubaiDay(r.to)).toBe("2026-10-12");
    expect(r.days).toBe(1);
  });
  it("builds rolling windows and per-day buckets", () => {
    const r = parseRange({ range: "7d" }, now);
    expect(eachDay(r)).toEqual(["2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11", "2026-10-12"]);
  });
  it("accepts a valid custom range and rejects bad ones", () => {
    const ok = parseRange({ range: "custom", from: "2026-09-01", to: "2026-09-30" }, now);
    expect(ok.days).toBe(30);
    expect(dubaiDay(ok.from)).toBe("2026-09-01");
    expect(parseRange({ range: "custom", from: "2026-09-30", to: "2026-09-01" }, now).key).toBe("30d");
    expect(parseRange({ range: "custom", from: "nope", to: "2026-09-01" }, now).key).toBe("30d");
    expect(parseRange({ range: "custom", from: "2020-01-01", to: "2026-09-01" }, now).key).toBe("30d"); // > 1 year
    expect(parseRange({ range: "bogus" }, now).days).toBe(30);
  });
});

describe("privacy masking", () => {
  it("masks emails and phones", () => {
    expect(maskEmail("sara.ali@example.com")).toBe("s***@e***.com");
    expect(maskEmail("a@b.co.uk")).toBe("a***@b***.co.uk");
    expect(maskPhone("+971501234567")).toBe("+971•••67");
  });
});

describe("sale price scheduling", () => {
  const base = { price: 100, salePrice: 80 };
  const now = new Date("2026-06-15T12:00:00Z");
  it("applies an unscheduled sale", () => expect(effectivePrice(base, now)).toBe(80));
  it("ignores a sale that hasn't started or has ended", () => {
    expect(effectivePrice({ ...base, saleStartsAt: new Date("2026-07-01") }, now)).toBe(100);
    expect(effectivePrice({ ...base, saleEndsAt: new Date("2026-06-01") }, now)).toBe(100);
  });
  it("applies a sale inside its window", () => expect(effectivePrice({ ...base, saleStartsAt: new Date("2026-06-01"), saleEndsAt: new Date("2026-06-30") }, now)).toBe(80));
  it("never raises the price", () => expect(effectivePrice({ price: 100, salePrice: 120 }, now)).toBe(100));
});

describe("uploads & image URLs", () => {
  it("detects real image types from magic bytes, not names", () => {
    expect(sniffImage(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0]))).toBe("png");
    expect(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0]))).toBe("jpg");
    expect(sniffImage(Buffer.concat([Buffer.from("RIFF"), Buffer.from([0, 0, 0, 0]), Buffer.from("WEBP"), Buffer.from([0])]))).toBe("webp");
    expect(sniffImage(Buffer.from("<svg onload=alert(1)>"))).toBeNull();
    expect(sniffImage(Buffer.from("GIF89a......"))).toBeNull();
    expect(sniffImage(Buffer.from("<?php echo 1; ?>......"))).toBeNull();
  });
  it("only allows uploaded paths and allow-listed https hosts", () => {
    expect(isAllowedImageUrl("/uploads/0123456789abcdef01234567.png")).toBe(true);
    expect(isAllowedImageUrl("/uploads/../../etc/passwd")).toBe(false);
    expect(isAllowedImageUrl("javascript:alert(1)")).toBe(false);
    expect(isAllowedImageUrl("https://not-listed.example.org/a.png")).toBe(false);
  });
});

describe("misc helpers", () => {
  it("slugifies", () => { expect(slugify("Hello, World! 2026")).toBe("hello-world-2026"); expect(slugify("  --x--  ")).toBe("x"); });
  it("reads datetime-local values as UAE time", () => {
    const d = optDate.parse("2026-10-12T14:00");
    expect(d?.toISOString()).toBe("2026-10-12T10:00:00.000Z");
    expect(optDate.parse("")).toBeUndefined();
  });
  it("review text helpers", () => {
    expect(displayName("Sara Ali")).toBe("Sara A.");
    expect(displayName("Sara")).toBe("Sara");
    expect(cleanText("hi\u0000 there\n\n\n\nbye")).toBe("hi there\n\nbye");
  });
  it("roles are least privilege", () => {
    expect(can("content_editor", "orders:write")).toBe(false);
    expect(can("operations_manager", "products:write")).toBe(false);
    expect(can("catalog_manager", "reviews:moderate")).toBe(false);
    expect(can("owner", "audit:read")).toBe(true);
    expect(ROLE_PERMISSIONS.customer).toEqual([]);
  });
});
