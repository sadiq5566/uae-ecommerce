"use server";
import { revalidatePath } from "next/cache";
import { Types } from "mongoose";
import { z } from "zod";
import { FORBIDDEN, actor } from "@/lib/admin/guard";
import { audit } from "@/lib/admin/audit";
import { fail, issues, money } from "@/lib/admin/common";
import { connectDb } from "@/lib/db";
import { getMailer } from "@/lib/mailer";
import { absolute, button, emailLayout, esc, getBrand, h, p } from "@/lib/email";
import { formatAED } from "@/lib/i18n";
import { issueCredit } from "@/features/credit/service";
import type { FormState } from "@/features/auth/schemas";
import { User } from "@/models/user";

const schema = z.object({
  id: z.string().regex(/^[a-f0-9]{24}$/i),
  amount: money("Amount").refine((n) => n > 0 && n <= 5000, "Enter an amount between 0.01 and 5,000"),
  note: z.string().trim().min(3, "Add a short reason (it is kept in the audit log)").max(200, "Too long"),
});

/** Give a customer web credit by hand (goodwill, a late-delivery apology…). Valid 90 days like any other credit; the customer is told by email. */
export async function grantCreditAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await actor("orders:write");
  if (!user) return { error: FORBIDDEN };
  const parsed = schema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fail(issues(parsed.error), fd);
  const { id, amount, note } = parsed.data;
  await connectDb();
  const target = await User.findOne({ _id: new Types.ObjectId(id), role: "customer", status: "active" }).select("email name locale emailVerifiedAt").lean();
  if (!target) return { error: "Customer not found or not active." };
  if (!target.emailVerifiedAt) return { error: "This customer hasn't verified their email yet, so credit can't be added." };
  const lot = await issueCredit({ userId: id, amount, source: "admin", ref: `${user.email}: ${note}`.slice(0, 200), note: { en: note, ar: note } });
  await audit(user, "credit.grant", "user", id, `Added ${amount.toFixed(2)} AED web credit (${note})`, { lot: lot.id, amount });
  const l = target.locale === "ar" ? "ar" : "en";
  try {
    const b = await getBrand(l);
    const until = new Intl.DateTimeFormat(l === "ar" ? "ar-AE" : "en-AE", { dateStyle: "long", timeZone: "Asia/Dubai" }).format(lot.expiresAt);
    const title = l === "ar" ? "تمت إضافة رصيد إلى حسابك" : "Web credit added to your account";
    const body = l === "ar" ? `أضفنا <b>${esc(formatAED(amount, l))}</b> إلى رصيدك في المتجر (${esc(note)}). صالح حتى ${esc(until)}.` : `We added <b>${esc(formatAED(amount, l))}</b> to your web credit (${esc(note)}). Valid until ${esc(until)}.`;
    await getMailer().send({ to: target.email, subject: `${b.name} — ${title}`, text: `${title}: ${formatAED(amount, l)}`, html: emailLayout(b, { preheader: title, body: h(title) + p(body) + button(absolute(`/${l}/account/credit`) ?? b.url, l === "ar" ? "رصيدي" : "My web credit") }) });
  } catch (e) { console.warn("[credit] grant email failed:", (e as Error).message); }
  revalidatePath(`/admin/customers/${id}`);
  return { ok: true };
}
