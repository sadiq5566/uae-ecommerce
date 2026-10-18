import "server-only";
import { connectDb } from "@/lib/db";
import { Lead, type LeadSource } from "@/models/lead";

/**
 * Remember a marketing contact. Idempotent per email/phone; consent is only ever turned ON by the person (never silently),
 * and a stored phone/email is kept if later submissions omit it.
 */
export async function captureLead(input: { email?: string; phone?: string; name?: string; source: LeadSource; locale: "en" | "ar"; consent: boolean }) {
  if (!input.email && !input.phone) return null;
  await connectDb();
  const or = [input.email ? { email: input.email } : null, input.phone ? { phone: input.phone } : null].filter(Boolean) as object[];
  const now = new Date();
  const set: Record<string, unknown> = {};
  if (input.consent) { set.marketingConsent = true; set.consentAt = now; set.unsubscribedAt = null; }
  if (input.name) set.name = input.name;
  try {
    const existing = await Lead.findOne({ $or: or });
    if (existing) {
      if (input.email && !existing.email) set.email = input.email;
      if (input.phone && !existing.phone) set.phone = input.phone;
      if (Object.keys(set).length) await Lead.updateOne({ _id: existing._id }, { $set: set });
      return existing._id;
    }
    const created = await Lead.create({ email: input.email, phone: input.phone, name: input.name, source: input.source, locale: input.locale, marketingConsent: input.consent, consentAt: input.consent ? now : undefined });
    return created._id;
  } catch (e) {
    if ((e as { code?: number }).code === 11000) return null; // lost a race with a parallel submit — the lead exists
    throw e;
  }
}
