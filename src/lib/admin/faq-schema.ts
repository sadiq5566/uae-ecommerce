import { z } from "zod";
import { text } from "./common";

const row = z.object({ q: text(200), a: text(1200), qAr: text(200).optional().default(""), aAr: text(1200).optional().default(""), auto: z.boolean().optional() });

/**
 * The FAQ editor's hidden `faqs` field (JSON). A form that does not send the field leaves the stored FAQs untouched (undefined);
 * a form that sends "[]" clears them. Half-filled rows are an error; fully blank rows are dropped. Rows edited by hand lose `auto`
 * in the editor, so `npm run db:seo-faq` never overwrites them.
 */
export const faqsField = z.preprocess((v) => {
  // json() from ./common defaults a missing value to [], which would wipe stored FAQs; here a missing/blank field must stay undefined.
  if (typeof v !== "string" || v.trim() === "") return undefined;
  try { return JSON.parse(v); } catch { return "__bad_json__"; }
}, z.array(row).max(20, "At most 20 questions").superRefine((rows, ctx) => {
  rows.forEach((r, i) => { if (!!r.q !== !!r.a) ctx.addIssue({ code: "custom", path: [i], message: `Question ${i + 1}: write both the question and the English answer` }); });
}).optional()).transform((rows) => rows?.filter((r) => r.q && r.a).map((r) => ({ q: r.q, a: r.a, qAr: r.qAr || undefined, aAr: r.aAr || undefined, ...(r.auto ? { auto: true } : {}) })));
