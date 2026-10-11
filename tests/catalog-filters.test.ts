import { describe, expect, it } from "vitest";
import { PAGE_SIZE, isFiltered, parseFilters, toQuery } from "@/features/catalog/filters";

describe("parseFilters", () => {
  it("returns defaults for empty input", () => {
    const f = parseFilters({});
    expect(f).toMatchObject({ sort: "relevance", page: 1, brand: [], inStock: false, onSale: false });
    expect(isFiltered(f)).toBe(false);
  });
  it("parses valid values", () => {
    const f = parseFilters({ q: " phone ", brand: ["A", "B"], minPrice: "10", maxPrice: "99", sort: "price_asc", page: "2", inStock: "1", "attr.color": "Black", rating: "4" });
    expect(f).toMatchObject({ q: "phone", brand: ["A", "B"], minPrice: 10, maxPrice: 99, sort: "price_asc", page: 2, inStock: true, rating: 4, attrs: { color: ["Black"] } });
    expect(isFiltered(f)).toBe(true);
  });
  it("falls back to defaults on invalid input instead of throwing", () => {
    const f = parseFilters({ sort: "hack", page: "-5", minPrice: "abc" });
    expect(f.sort).toBe("relevance");
    expect(f.page).toBe(1);
    expect(f.minPrice).toBeUndefined();
  });
  it("ignores attribute keys with unsafe characters", () => {
    expect(parseFilters({ "attr.$where": "1", "attr.a.b": "x" }).attrs).toEqual({});
  });
  it("round-trips through toQuery", () => {
    const f = parseFilters({ q: "tv", brand: "Lumen", sort: "newest", page: "3", "attr.color": ["Black", "Grey"] });
    const qs = toQuery(f);
    const back = parseFilters(Object.fromEntries(new URLSearchParams(qs).entries()));
    expect(back.q).toBe("tv");
    expect(back.sort).toBe("newest");
    expect(back.page).toBe(3);
    expect(qs).toContain("attr.color=Black&attr.color=Grey");
  });
  it("has a bounded page size", () => {
    expect(PAGE_SIZE).toBeLessThanOrEqual(50);
  });
});
