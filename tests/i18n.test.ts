import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import ar from "@/messages/ar.json";
import { dirOf, formatAED, isLocale } from "@/lib/i18n";

const keys = (o: object, p = ""): string[] =>
  Object.entries(o).flatMap(([k, v]) => (typeof v === "object" ? keys(v, `${p}${k}.`) : [`${p}${k}`]));

describe("i18n", () => {
  it("has identical keys in en and ar", () => {
    expect(keys(ar).sort()).toEqual(keys(en).sort());
  });
  it("sets rtl only for Arabic", () => {
    expect(dirOf("ar")).toBe("rtl");
    expect(dirOf("en")).toBe("ltr");
  });
  it("validates locales", () => {
    expect(isLocale("en")).toBe(true);
    expect(isLocale("fr")).toBe(false);
  });
  it("formats AED", () => {
    expect(formatAED(449, "en")).toMatch(/AED/);
    expect(formatAED(10.5, "en")).toContain("10.50");
  });
});
