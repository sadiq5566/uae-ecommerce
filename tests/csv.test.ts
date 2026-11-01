import { describe, expect, it, vi } from "vitest";
import { csvCell, mapColumns, parseCsv, parseJsonl, rowObject, toCsv } from "@/lib/csv";

vi.stubEnv("IMAGE_HOSTS", "cdn.example.com");

describe("parseCsv", () => {
  it("handles quotes, commas, escaped quotes and newlines inside fields", () => {
    const r = parseCsv('a,b,c\r\n1,"x, y","say ""hi"""\r\n"line1\nline2",2,3\r\n');
    expect(r.headers).toEqual(["a", "b", "c"]);
    expect(r.rows).toEqual([["1", "x, y", 'say "hi"'], ["line1\nline2", "2", "3"]]);
  });
  it("strips a BOM, ignores blank lines, supports LF only", () => {
    expect(parseCsv("﻿sku,price\n\nA,1\n").rows).toEqual([["A", "1"]]);
  });
  it("rejects malformed / binary / oversized input", () => {
    expect(parseCsv('a,b\n"oops,1').error).toMatch(/Unterminated/);
    expect(parseCsv("a\u0000b").error).toMatch(/binary/);
    expect(parseCsv("a\n1\n2\n3", { maxRows: 2 }).error).toMatch(/Too many rows/);
    expect(parseCsv("").error).toBeTruthy();
  });
  it("never evaluates anything: formulas stay plain strings", () => {
    expect(parseCsv("a\n=SUM(1+1)\n").rows[0][0]).toBe("=SUM(1+1)");
  });
  it("handles Arabic text and trailing field without newline", () => {
    expect(parseCsv("n\nسماعات").rows).toEqual([["سماعات"]]);
  });
});

describe("CSV export is safe against formula injection", () => {
  it.each(["=1+1", "+cmd", "-2+3", "@SUM(A1)", "\tTAB", "\rCR"])("neutralises %j", (v) => expect(csvCell(v).replace(/^"/, "")).toMatch(/^'/));
  it("does not touch normal text or numbers", () => {
    expect(csvCell("Hello")).toBe("Hello");
    expect(csvCell(-5)).toBe("-5");
    expect(csvCell(12.5)).toBe("12.5");
    expect(csvCell(true)).toBe("true");
    expect(csvCell(null)).toBe("");
  });
  it("quotes fields containing commas, quotes or newlines", () => {
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(csvCell("x\ny")).toBe('"x\ny"');
  });
  it("round-trips through the parser", () => {
    const rows = [["SKU-1", 'He said "hi", ok', "line1\nline2", 10]];
    const parsed = parseCsv(toCsv(["sku", "name", "desc", "n"], rows));
    expect(parsed.rows[0]).toEqual(["SKU-1", 'He said "hi", ok', "line1\nline2", "10"]);
  });
});

// The importer's own column list lives in the product import module; these tests cover the generic mapper with a small alias table.
const COLUMNS: Record<string, string[]> = { sku: ["sku", "code"], name_en: ["name_en", "name", "title"], sale_price: ["sale_price", "sale price"], category_slug: ["category_slug", "category"] };

describe("column mapping", () => {
  it("accepts aliases, case and spacing; reports unknown columns", () => {
    const m = mapColumns(["SKU", "Name", "Sale Price", "weird"], COLUMNS);
    expect(Object.keys(m.index).sort()).toEqual(["name_en", "sale_price", "sku"]);
    expect(m.unknown).toEqual(["weird"]);
    expect(rowObject(["a", "b", "c", "d"], m.index)).toEqual({ sku: "a", name_en: "b", sale_price: "c" });
  });
  it("reports duplicate columns", () => {
    expect(mapColumns(["sku", "SKU"], COLUMNS).dupes).toEqual(["SKU"]);
    expect(mapColumns(["category", "category_slug"], COLUMNS).alt).toEqual({ category_slug: [1] });
    expect(rowObject(["", "watches"], { category_slug: 0 }, { category_slug: [1] }).category_slug).toBe("watches");
  });
});

describe("parseJsonl", () => {
  it("flattens arrays/objects like CSV cells", () => {
    const r = parseJsonl('{"sku":"A1","tags":["x","y"],"attributes":{"color":"red"},"price":10}\n\n{"sku":"A2","images":[{"url":"https://a/b.jpg"}]}\n');
    expect(r.error).toBeUndefined();
    expect(r.headers).toEqual(["sku", "tags", "attributes", "price", "images"]);
    expect(r.rows[0]).toEqual(["A1", "x|y", "color:red", "10", ""]);
    expect(r.rows[1][4]).toBe("https://a/b.jpg");
    expect(parseJsonl("{bad").error).toMatch(/not valid JSON/);
  });
});
