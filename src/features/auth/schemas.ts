import { z } from "zod";

// Error messages are dictionary keys (see messages/*.json "errors"), so validation is localisable.
const email = z.string().trim().toLowerCase().max(254, "email_invalid").pipe(z.email("email_invalid"));
const password = z.string().min(10, "password_short").max(128, "password_long");

export const registerSchema = z.object({
  name: z.string().trim().min(2, "name_short").max(100, "name_long"),
  email,
  password,
});
export const loginSchema = z.object({ email, password: z.string().min(1, "required").max(128) });
export const forgotSchema = z.object({ email });
export const resetSchema = z.object({ token: z.string().min(20).max(200), password });

/** UAE phone: mobile (5X XXX XXXX) or landline (2/3/4/6/7/9 XXX XXXX), with +971 / 00971 / 0 prefix. Normalised to +971XXXXXXXXX. */
export function normalizeUaePhone(input: string): string | null {
  const s = input.replace(/[\s\-().]/g, "");
  const m = /^(?:\+971|00971|971|0)?((?:5\d{8})|(?:[2-4679]\d{7}))$/.exec(s);
  return m ? `+971${m[1]}` : null;
}

export const profileSchema = z.object({
  name: z.string().trim().min(2, "name_short").max(100, "name_long"),
  phone: z.string().trim().optional().transform((v, ctx) => {
    if (!v) return undefined;
    const n = normalizeUaePhone(v);
    if (!n) { ctx.addIssue({ code: "custom", message: "phone_invalid" }); return z.NEVER; }
    return n;
  }),
  locale: z.enum(["en", "ar"]),
});

export const EMIRATES = ["abu-dhabi", "dubai", "sharjah", "ajman", "umm-al-quwain", "ras-al-khaimah", "fujairah"] as const;
const opt = (max: number) => z.string().trim().max(max, "too_long").optional().transform((v) => v || undefined);

export const addressSchema = z.object({
  label: opt(40),
  recipientName: z.string().trim().min(2, "name_short").max(100, "name_long"),
  phone: z.string().trim().transform((v, ctx) => {
    const n = normalizeUaePhone(v);
    if (!n) { ctx.addIssue({ code: "custom", message: "phone_invalid" }); return z.NEVER; }
    return n;
  }),
  emirate: z.enum(EMIRATES, "required"),
  area: z.string().trim().min(2, "required").max(100, "too_long"),
  street: opt(150),
  building: z.string().trim().min(1, "required").max(100, "too_long"),
  unit: opt(40),
  landmark: opt(150),
  instructions: opt(300),
  isDefault: z.preprocess((v) => v === "on" || v === "1" || v === "true", z.boolean()),
});

export type FormState = { ok?: boolean; error?: string; fieldErrors?: Record<string, string>; values?: Record<string, string> };

/** Echo submitted text fields back on validation errors (React resets uncontrolled forms after an action). Never echoes secrets. */
export function echo(fd: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string" && !/password|token/i.test(k) && v.length < 500) out[k] = v;
  return out;
}

/** Flatten a Zod error into {field: messageKey}. Only the first issue per field is kept. */
export function fieldErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of err.issues) { const k = String(i.path[0] ?? "form"); out[k] ??= i.message; }
  return out;
}
