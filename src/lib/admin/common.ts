import { z } from "zod";
import type { FormState } from "@/features/auth/schemas";

/** Error messages in admin schemas are plain English; Field looks messages up in `errors`, so map each key to itself. */
export const plain: Record<string, string> = new Proxy({}, { get: (_t, k) => (typeof k === "string" ? k : undefined) });

export const slug = z.string().trim().toLowerCase().min(2, "Slug is required").max(100, "Too long").regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and single hyphens");
export const objectId = z.string().regex(/^[a-f0-9]{24}$/i, "Invalid id");
export const money = (label = "Price") => z.coerce.number({ error: `${label} must be a number` }).min(0, `${label} can't be negative`).max(1_000_000, `${label} is too large`).transform((n) => Math.round(n * 100) / 100);
export const optMoney = (label: string) => z.preprocess((v) => (v === "" || v == null ? undefined : v), money(label).optional());
export const int = (label: string, max = 1_000_000) => z.coerce.number({ error: `${label} must be a number` }).int(`${label} must be a whole number`).min(0, `${label} can't be negative`).max(max, `${label} is too large`);
/** Date/time from a form. `datetime-local` values are wall-clock times in the UAE (UTC+4, no DST), not the server's timezone. */
export const optDate = z.preprocess((v) => {
  if (v === "" || v == null) return undefined;
  if (typeof v === "string") { if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return `${v}:00+04:00`; if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return `${v}T00:00:00+04:00`; }
  return v;
}, z.coerce.date({ error: "Invalid date" }).optional());
export const checkbox = z.preprocess((v) => v === "on" || v === "1" || v === "true", z.boolean());
export const text = (max: number, label = "Text") => z.string().trim().max(max, `${label} is too long (max ${max})`);
export const optText = (max: number) => z.string().trim().max(max, `Too long (max ${max})`).optional().transform((v) => v || undefined);
export const json = <T extends z.ZodType>(schema: T, fallback: unknown = []) =>
  z.preprocess((v) => { if (typeof v !== "string" || v.trim() === "") return fallback; try { return JSON.parse(v); } catch { return "__bad_json__"; } }, schema);

export const issues = (err: z.ZodError): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const i of err.issues) { const k = String(i.path[0] ?? "form"); out[k] ??= i.path.length > 1 ? `${i.message} (${i.path.slice(1).join(" → ")})` : i.message; }
  return out;
};

export const formObj = (fd: FormData) => Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === "string")) as Record<string, string>;
export const fail = (fe: Record<string, string>, fd?: FormData): FormState => ({ fieldErrors: fe, values: fd ? formObj(fd) : undefined, error: "Please fix the highlighted fields." });
export const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export const isDupKey = (e: unknown, key?: string) => (e as { code?: number; keyPattern?: Record<string, number> }).code === 11000 && (!key || !!(e as { keyPattern?: Record<string, number> }).keyPattern?.[key]);
