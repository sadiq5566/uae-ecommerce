import { describe, expect, it, vi } from "vitest";
import { csvCell, mapColumns, parseCsv, rowObject, toCsv } from "@/lib/csv";
import { PRODUCT_COLUMNS, validateProductRows, type ProductCtx } from "@/features/admin/csv/products";
import { CATEGORY_COLUMNS, parseAttributes, validateCategoryRows } from "@/features/admin/csv/categories";

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

describe("column mapping", () => {
  it("accepts aliases, case and spacing; reports unknown columns", () => {
    const m = mapColumns(["SKU", "Name", "Sale Price", "weird"], PRODUCT_COLUMNS);
    expect(Object.keys(m.index).sort()).toEqual(["name_en", "sale_price", "sku"]);
    expect(m.unknown).toEqual(["weird"]);
    expect(rowObject(["a", "b", "c", "d"], m.index)).toEqual({ sku: "a", name_en: "b", sale_price: "c" });
  });
  it("reports duplicate columns", () => {
    expect(mapColumns(["sku", "SKU"], PRODUCT_COLUMNS).dupes).toEqual(["SKU"]);
  });
});

const ctx = (over: Partial<ProductCtx> = {}, present = ["sku", "name_en", "name_ar", "category_slug", "price", "stock", "status", "image_urls", "attributes", "sale_price", "slug"]): ProductCtx => ({
  categories: new Map([["electronics", { id: "c1", attrKeys: ["color"] }]]),
  bySku: new Map(), slugOwner: new Map(), present: new Set(present), ...over,
});
const good = { sku: "ab-1", name_en: "Phone", name_ar: "هاتف", category_slug: "electronics", price: "100", stock: "5" };
const v = (rows: Record<string, string>[], c = ctx()) => validateProductRows(rows, c);

describe("product CSV validation", () => {
  it("creates a valid new product as a DRAFT with an auto slug", () => {
    const [r] = v([good]);
    expect(r).toMatchObject({ action: "create", sku: "AB-1", errors: [] });
    expect(r.doc).toMatchObject({ slug: "phone", status: "draft", price: 100, stock: 5, "name.ar": "هاتف" });
    expect(r.stockDelta).toBe(5);
  });
  it("collects every error on a row with line numbers", () => {
    const [r] = v([{ sku: "x", name_en: "", name_ar: "", category_slug: "nope", price: "abc", stock: "-1", status: "live" }]);
    expect(r.action).toBe("error");
    expect(r.line).toBe(2);
    const msg = r.errors.join("|");
    for (const m of ["sku may only", "name_en is required", "unknown category_slug", "price must be", "stock must be", "status must be"]) expect(msg).toContain(m);
  });
  it("flags duplicate SKUs and slugs inside the file", () => {
    const rows = v([good, { ...good }, { ...good, sku: "AB-2", slug: "phone" }]);
    expect(rows[0].action).toBe("create");
    expect(rows[1].errors.join()).toMatch(/duplicate sku in this file \(first on line 2\)/);
    expect(rows[2].errors.join()).toMatch(/duplicate slug/);
  });
  it("rejects a slug owned by another product", () => {
    const c = ctx({ slugOwner: new Map([["phone", "OTHER-1"]]) });
    expect(v([good], c)[0].errors.join()).toMatch(/already used by OTHER-1/);
  });
  it("updates by SKU and only touches columns that have a value (no surprise overwrites)", () => {
    const existing = { id: "p1", sku: "AB-1", slug: "phone", price: 100, salePrice: null, stock: 5, hasVariants: false, categoryId: "c1" };
    const c = ctx({ bySku: new Map([["AB-1", existing]]) }, ["sku", "price", "stock", "name_en"]);
    const [r] = v([{ sku: "ab-1", price: "120", stock: "", name_en: "" }], c);
    expect(r.action).toBe("update");
    expect(r.doc).toEqual({ price: 120, finalPrice: 120 });
    expect(r.doc).not.toHaveProperty("stock");
    expect(r.doc).not.toHaveProperty("name.en");
  });
  it("computes the stock delta on update and blocks stock edits for variant products", () => {
    const existing = { id: "p1", sku: "AB-1", slug: "phone", price: 100, salePrice: null, stock: 5, hasVariants: false, categoryId: "c1" };
    expect(v([{ sku: "AB-1", stock: "2" }], ctx({ bySku: new Map([["AB-1", existing]]) }, ["sku", "stock"]))[0].stockDelta).toBe(-3);
    const withVariants = { ...existing, hasVariants: true };
    expect(v([{ sku: "AB-1", stock: "2" }], ctx({ bySku: new Map([["AB-1", withVariants]]) }, ["sku", "stock"]))[0].errors.join()).toMatch(/variants/);
  });
  it("validates sale price against price (incl. the existing price on update)", () => {
    expect(v([{ ...good, sale_price: "100" }])[0].errors.join()).toMatch(/sale_price must be lower/);
    expect(v([{ ...good, sale_price: "80" }])[0].doc).toMatchObject({ salePrice: 80, finalPrice: 80 });
  });
  it("validates image URLs against the allowlist", () => {
    expect(v([{ ...good, image_urls: "https://evil.example.org/a.png" }])[0].errors.join()).toMatch(/not allowed/);
    expect(v([{ ...good, image_urls: "http://cdn.example.com/a.png" }])[0].action).toBe("error");
    expect(v([{ ...good, image_urls: "https://cdn.example.com/a.png|https://cdn.example.com/b.png" }])[0].doc?.images).toHaveLength(2);
  });
  it("only accepts attributes defined on the category", () => {
    expect(v([{ ...good, attributes: "color:Black" }])[0].doc?.attrs).toEqual({ color: "Black" });
    expect(v([{ ...good, attributes: "size:XL" }])[0].errors.join()).toMatch(/not defined on this category/);
    expect(v([{ ...good, attributes: "garbage" }])[0].errors.join()).toMatch(/key:value/);
  });
  it("stores formula-looking text verbatim (nothing is evaluated) — escaping happens on export", () => {
    expect(v([{ ...good, name_en: "=cmd|' /C calc'!A0" }])[0].doc?.["name.en"]).toBe("=cmd|' /C calc'!A0");
  });
});

describe("category CSV validation", () => {
  const cctx = (present: string[], bySlug: Record<string, { id: string; parent: string | null }> = {}) => ({ bySlug: new Map(Object.entries(bySlug)), present: new Set(present) });
  const P = ["slug", "parent_slug", "name_en", "name_ar", "attributes"];
  it("accepts parents defined in the same file and enforces two levels", () => {
    const r = validateCategoryRows([{ slug: "tv", parent_slug: "electronics", name_en: "TV", name_ar: "تلفاز" }, { slug: "electronics", name_en: "E", name_ar: "إ" }, { slug: "oled", parent_slug: "tv", name_en: "O", name_ar: "أ" }], cctx(P));
    expect(r.map((x) => x.action)).toEqual(["create", "create", "error"]);
    expect(r[2].errors.join()).toMatch(/only two levels/);
  });
  it("rejects self-parent, unknown parent, missing names, duplicate slugs", () => {
    const r = validateCategoryRows([{ slug: "a", parent_slug: "a", name_en: "A", name_ar: "ا" }, { slug: "b", parent_slug: "zzz", name_en: "B", name_ar: "ب" }, { slug: "c" }, { slug: "d", name_en: "D", name_ar: "د" }, { slug: "d", name_en: "D", name_ar: "د" }], cctx(P));
    expect(r.map((x) => x.action)).toEqual(["error", "error", "error", "create", "error"]);
  });
  it("parses attribute definitions", () => {
    expect(parseAttributes("color:Colour/اللون|size:Size/المقاس")).toEqual({ ok: true, attrs: [{ key: "color", label: { en: "Colour", ar: "اللون" } }, { key: "size", label: { en: "Size", ar: "المقاس" } }] });
    expect(parseAttributes("color:OnlyEnglish").ok).toBe(false);
    expect(parseAttributes("a:A/ا|a:B/ب").ok).toBe(false);
  });
  it("has the expected column set", () => expect(Object.keys(CATEGORY_COLUMNS)).toContain("parent_slug"));
});
