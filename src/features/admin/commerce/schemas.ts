import { z } from "zod";
import { EMIRATES } from "@/features/auth/schemas";
import { checkbox, int, money, optDate, optMoney, optText, text } from "@/lib/admin/common";
import { isAllowedImageUrl } from "@/lib/image-url";

export const couponSchema = z.object({
  id: z.string().optional(),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,30}$/, "Code: 3–30 letters, numbers, - or _"),
  desc_en: text(200), desc_ar: text(200),
  type: z.enum(["percent", "fixed"], "Choose a type"),
  value: money("Value"),
  maxDiscount: optMoney("Max discount"),
  minSubtotal: money("Minimum subtotal").default(0),
  startsAt: optDate, endsAt: optDate,
  active: checkbox,
  usageLimit: z.preprocess((v) => (v === "" || v == null ? undefined : v), int("Usage limit").min(1, "Must be at least 1").optional()),
  perCustomerLimit: int("Per-customer limit", 1000).min(1, "Must be at least 1"),
  stackWithSale: checkbox,
  productSkus: z.string().trim().max(2000).optional().transform((v) => (v ? v.split(/[\s,]+/).map((s) => s.trim().toUpperCase()).filter(Boolean) : [])),
  excludeSkus: z.string().trim().max(2000).optional().transform((v) => (v ? v.split(/[\s,]+/).map((s) => s.trim().toUpperCase()).filter(Boolean) : [])),
  categories: z.array(z.string().regex(/^[a-f0-9]{24}$/)).default([]),
  excludeCategories: z.array(z.string().regex(/^[a-f0-9]{24}$/)).default([]),
}).superRefine((c, ctx) => {
  if (c.type === "percent" && (c.value <= 0 || c.value > 100)) ctx.addIssue({ code: "custom", path: ["value"], message: "Percent must be between 0 and 100" });
  if (c.type === "fixed" && c.value <= 0) ctx.addIssue({ code: "custom", path: ["value"], message: "Amount must be greater than 0" });
  if (c.startsAt && c.endsAt && c.endsAt <= c.startsAt) ctx.addIssue({ code: "custom", path: ["endsAt"], message: "End must be after the start" });
});

const zoneBase = {
  key: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,30}$/, "Key: lowercase letters, numbers, hyphens"),
  name_en: text(80).min(2, "English name required"), name_ar: text(80).min(2, "Arabic name required"),
  emirates: z.array(z.enum(EMIRATES)).min(1, "Select at least one emirate"),
  fee: money("Fee"), freeThreshold: optMoney("Free-delivery threshold"),
  est_en: text(80).min(2, "English estimate required"), est_ar: text(80).min(2, "Arabic estimate required"),
  active: checkbox,
};
export const zoneSchema = z.object(zoneBase);

export const settingsSchema = z.object({
  storeName_en: text(60).min(2, "English store name required"), storeName_ar: text(60).min(2, "Arabic store name required"),
  minOrder: money("Minimum order"), freeDeliveryThreshold: money("Free-delivery threshold"), baseDeliveryFee: money("Base delivery fee"),
  codEnabled: checkbox, codFee: money("COD fee"), codMaxOrder: money("COD maximum"),
  taxEnabled: checkbox, taxRate: z.coerce.number().min(0, "0–100").max(100, "0–100"), taxInclusive: checkbox,
  pendingPaymentMinutes: int("Payment window", 1440).min(5, "At least 5 minutes"),
  supportEmail: z.string().trim().optional().refine((v) => !v || z.email().safeParse(v).success, "Enter a valid email").transform((v) => v || undefined),
  supportPhone: optText(30),
  logo: z.string().trim().optional().refine((v) => !v || isAllowedImageUrl(v), "Logo must be an uploaded image or an allowed https URL").transform((v) => v || undefined),
});
