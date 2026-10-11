import { z } from "zod";
import { checkbox, int, json, optDate, optText, slug, text } from "@/lib/admin/common";
import { isAllowedImageUrl } from "@/lib/image-url";
import { PAGE_SLUGS } from "@/models/content-page";

export const articleSchema = z.object({
  id: z.string().optional(),
  slug,
  title_en: text(150).min(2, "English title required"), title_ar: text(150).min(2, "Arabic title required"),
  excerpt_en: text(300), excerpt_ar: text(300),
  body_en: text(20000), body_ar: text(20000),
  category: optText(40), author: optText(80),
  cover: z.string().trim().optional().refine((v) => !v || isAllowedImageUrl(v), "Cover must be an uploaded image or an allowed https URL").transform((v) => v || undefined),
  coverAlt_en: text(150), coverAlt_ar: text(150),
  icon: z.string().trim().max(8).optional().transform((v) => v || "📰"), hue: z.coerce.number().int().min(0).max(360).default(160),
  status: z.enum(["draft", "published"], "Choose a status"),
  publishAt: optDate,
  seoTitle_en: text(70), seoTitle_ar: text(70), seoDesc_en: text(160), seoDesc_ar: text(160),
}).superRefine((a, ctx) => {
  if (a.status === "published" && (!a.body_en.trim() || !a.body_ar.trim())) ctx.addIssue({ code: "custom", path: ["body_en"], message: "Published articles need both English and Arabic body text" });
});

export const pageSchema = z.object({
  slug: z.enum(PAGE_SLUGS), title_en: text(120).min(2, "English title required"), title_ar: text(120).min(2, "Arabic title required"),
  body_en: text(30000), body_ar: text(30000), published: checkbox,
});

const href = z.string().trim().max(300).refine((v) => v === "" || /^\/(?!\/)[^\s\\]*$/.test(v) || /^https:\/\/[^\s]+$/.test(v), "Link must start with / (inside the store) or https://");
export const bannersSchema = json(z.array(z.object({
  id: z.string().max(40), active: z.boolean(), order: int("Order", 1000),
  eyebrow: z.object({ en: text(60), ar: text(60) }), title: z.object({ en: text(120).min(1, "Title (EN) required"), ar: text(120).min(1, "Title (AR) required") }),
  subtitle: z.object({ en: text(240), ar: text(240) }), ctaLabel: z.object({ en: text(40), ar: text(40) }), ctaHref: href,
  image: z.string().trim().refine((v) => !v || isAllowedImageUrl(v), "Image must be an uploaded file or an allowed https URL").optional().transform((v) => v || undefined),
  hue: z.coerce.number().int().min(0).max(360), startsAt: optDate, endsAt: optDate,
})).max(8, "At most 8 banners"), []);
