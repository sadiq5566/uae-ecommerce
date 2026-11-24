import { describe, expect, it } from "vitest";
import { z } from "zod";
import { faqsField } from "../src/lib/admin/faq-schema";

const parse = (v?: string) => z.object({ faqs: faqsField }).safeParse(v === undefined ? {} : { faqs: v });

describe("admin faqsField", () => {
  it("leaves stored FAQs untouched when the form does not send the field", () => {
    const r = parse(); expect(r.success && r.data.faqs).toBeUndefined();
  });
  it("clears them when the editor sends an empty list", () => {
    const r = parse("[]"); expect(r.success && r.data.faqs).toEqual([]);
  });
  it("keeps full rows, drops blank rows and keeps the auto flag only when true", () => {
    const r = parse(JSON.stringify([{ q: "Q?", a: "A", qAr: "", aAr: "", auto: true }, { q: "", a: "" }, { q: "Q2?", a: "A2", qAr: "س", aAr: "ج", auto: false }]));
    expect(r.success && r.data.faqs).toEqual([{ q: "Q?", a: "A", auto: true }, { q: "Q2?", a: "A2", qAr: "س", aAr: "ج" }]);
  });
  it("rejects a half-filled row and more than 20 rows", () => {
    expect(parse(JSON.stringify([{ q: "Q?", a: "" }])).success).toBe(false);
    expect(parse(JSON.stringify(Array.from({ length: 21 }, () => ({ q: "Q?", a: "A" })))).success).toBe(false);
  });
  it("rejects broken JSON", () => { expect(parse("{nope").success).toBe(false); });
});
