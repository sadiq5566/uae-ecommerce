import { describe, expect, it } from "vitest";
import { groupKey, splitName, swatchFor } from "../lib/variants";
import { colorKey, normText, sameText, splitNameAny } from "../lib/variants-ar";
import { groupRows } from "../lib/import-group";
import type { CsvRow } from "../lib/csv";

const split = (n: string) => splitNameAny(n, splitName);

describe("variant grouping: English and Arabic names", () => {
  it("splits trailing English colour and size", () => {
    expect(split("Royal Oak Mini - Black - 36mm")).toMatchObject({ base: "Royal Oak Mini", colorKey: "black", size: "36" });
    expect(split("Rolex Datejust").color).toBeUndefined();
  });

  it("splits Arabic colour (end or middle) and size words", () => {
    expect(split("ساعة رولكس - أسود").base).toBe("ساعة رولكس");
    expect(split("قبعة غوتشي سوداء بشعار كانفاس").base).toBe("قبعة غوتشي بشعار كانفاس");
    const s = split("ساعة كارتييه ذهبي وردي - مقاس ٤٠");
    expect(s).toMatchObject({ base: "ساعة كارتييه", colorKey: "rose gold", size: "40" });
    expect(split("ساعة رولكس").color).toBeUndefined();
  });

  it("treats Arabic and English colours as the same colour", () => {
    expect(colorKey("الأسود")).toBe(colorKey("Black"));
    expect(colorKey("أبيض")).not.toBe(colorKey("أسود"));
  });

  it("normalises Arabic text", () => {
    expect(normText("ساعـة  رولكس")).toBe("ساعه رولكس");
    expect(sameText("أحمر", "احمر")).toBe(true);
    expect(normText("٣٨")).toBe("38");
  });

  it("does not collapse different Arabic products into one group key", () => {
    expect(groupKey("Gucci", "قبعة غوتشي")).not.toBe(groupKey("Gucci", "حزام غوتشي"));
  });

  it("draws swatches for Arabic colour names", () => {
    expect(swatchFor("أسود")).toBe(swatchFor("black"));
    expect(swatchFor("???")).toBe("#cccccc");
  });
});

const row = (line: number, name: string, sku: string, color: string): CsvRow => ({ line, data: { name, sku, color, price_to: "100", category: "caps", brand: "Gucci" } as never });

describe("CSV import grouping", () => {
  it("merges Arabic colour rows into one product with variants", () => {
    const out = groupRows([row(2, "قبعة غوتشي", "A1", "أسود"), row(3, "قبعة غوتشي", "A2", "بيج"), row(4, "حزام غوتشي", "B1", "بني")]);
    expect(out).toHaveLength(2);
    expect(JSON.parse(out.find((r) => r.data.name === "قبعة غوتشي")!.data.variants_json)).toHaveLength(2);
  });

  it("keeps rows apart when two share the same colour", () => {
    expect(groupRows([row(2, "Cap", "A1", "Black"), row(3, "Cap", "A2", "black")])).toHaveLength(2);
  });
});
