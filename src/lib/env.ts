import "server-only";
import { z } from "zod";

const blankToUndefined = (v: unknown) => (v === "" ? undefined : v);

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXT_PUBLIC_SITE_URL: z.url().default("http://localhost:3000"),
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  MONGODB_DB: z.string().min(1).default("souq_uae_dev"),
  PAYMENT_PROVIDER: z.preprocess(blankToUndefined, z.enum(["mock"]).optional()), // add real provider ids here as adapters are written
  PAYMENT_WEBHOOK_SECRET: z.preprocess(blankToUndefined, z.string().min(16).optional()),
  CRON_SECRET: z.preprocess(blankToUndefined, z.string().min(16).optional()),
}).superRefine((e, ctx) => {
  if (e.PAYMENT_PROVIDER && !e.PAYMENT_WEBHOOK_SECRET) ctx.addIssue({ code: "custom", path: ["PAYMENT_WEBHOOK_SECRET"], message: "required when PAYMENT_PROVIDER is set" });
  if (e.PAYMENT_PROVIDER === "mock" && e.NODE_ENV === "production") ctx.addIssue({ code: "custom", path: ["PAYMENT_PROVIDER"], message: "the mock provider must not be used in production" });
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Validated server environment. Throws a readable error listing bad variables. */
export function getEnv(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${issues.join("\n")}`);
  }
  return (cached = parsed.data);
}
