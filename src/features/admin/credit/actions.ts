"use server";
import { revalidatePath } from "next/cache";
import { Types } from "mongoose";
import { z } from "zod";
import { FORBIDDEN, actor } from "@/lib/admin/guard";
import { audit } from "@/lib/admin/audit";
import { checkbox, fail, formObj, issues, money } from "@/lib/admin/common";
import { connectDb } from "@/lib/db";
import { getMailer } from "@/lib/mailer";
import { absolute, button, emailLayout, esc, getBrand, h, p } from "@/lib/email";
import { formatAED } from "@/lib/i18n";
import { adjustCredit } from "@/features/credit/service";
import type { FormState } from "@/features/auth/schemas";
import { User } from "@/models/user";

const schema = z.object({
  id: z.string().regex(/^[a-f0-9]{24}$/i).optional().or(z.literal("")),
  email: z.string().trim().toLowerCase().max(254).optional(),
  kind: z.enum(["add", "deduct"], "Choose add or remove"),
  amount: money("Amount").refine((n) => n > 0 && n <= 5000, "Enter an amount between 0.01 and 5,000"),
  note: z.string().trim().min(3, "Add a short reason (it is kept in the record)").max(200, "Too long (max 200)"),
  notify: checkbox,
});

/**
 * Add web credit to a customer, or take some back (goodwill, an apology, a wrong grant, a fraud clawback…). The customer is found by id (their
 * profile page) or by email (the Web credit page). Every change is written to the credit ledger with who did it, when and why.
 */
export async function adjustCreditAction(_: FormState, fd: FormData): Promise<FormState> {
  const staff = await actor("orders:write");
  if (!staff) return { error: FORBIDDEN };
  const parsed = schema.safeParse(formObj(fd));
  if (!parsed.success) return fail(issues(parsed.error), fd);
  const { id, email, kind, amount, note, notify } = parsed.data;
  if (!id && !email) return fail({ email: "Enter the customer's email" }, fd);
  await connectDb();
  const target = await User.findOne(id ? { _id: new Types.ObjectId(id) } : { email }).select("email name locale emailVerifiedAt role status").lean();
  if (!target || target.role !== "customer") return fail({ email: "No customer account with this email." }, fd);
  if (kind === "add") {
    if (target.status !== "active") return { error: "This customer's account isn't active, so credit can't be added." };
    if (!target.emailVerifiedAt) return { error: "This customer hasn't verified their email yet, so credit can't be added." };
  }
  const res = await adjustCredit({ userId: String(target._id), kind, amount, reason: note, admin: { id: staff.id, email: staff.email, name: staff.name }, notified: notify });
  if (!res.ok) return res.error === "balance" ? fail({ amount: `They only have ${formatAED(res.balance ?? 0, "en")} of web credit to take back.` }, fd) : fail({ amount: "Enter a valid amount." }, fd);
  const a = res.adjustment;
  await audit(staff, kind === "add" ? "credit.grant" : "credit.deduct", "user", String(target._id), `${kind === "add" ? "Added" : "Removed"} ${a.amount.toFixed(2)} AED web credit (${note})`, { adjustment: a.id, amount: a.amount, balanceBefore: a.balanceBefore, balanceAfter: a.balanceAfter });
  if (notify) {
    const l = target.locale === "ar" ? "ar" : "en";
    try {
      const b = await getBrand(l);
      const money = formatAED(a.amount, l);
      const until = res.expiresAt ? new Intl.DateTimeFormat(l === "ar" ? "ar-AE" : "en-AE", { dateStyle: "long", timeZone: "Asia/Dubai" }).format(res.expiresAt) : "";
      const title = kind === "add" ? (l === "ar" ? "تمت إضافة رصيد إلى حسابك" : "Web credit added to your account") : (l === "ar" ? "تم تعديل رصيدك في المتجر" : "Your web credit was adjusted");
      const body = kind === "add"
        ? (l === "ar" ? `أضفنا <b>${esc(money)}</b> إلى رصيدك في المتجر (${esc(note)}). صالح حتى ${esc(until)}.` : `We added <b>${esc(money)}</b> to your web credit (${esc(note)}). Valid until ${esc(until)}.`)
        : (l === "ar" ? `خصمنا <b>${esc(money)}</b> من رصيدك في المتجر (${esc(note)}). رصيدك الآن ${esc(formatAED(a.balanceAfter, l))}.` : `We took <b>${esc(money)}</b> off your web credit (${esc(note)}). Your balance is now ${esc(formatAED(a.balanceAfter, l))}.`);
      await getMailer().send({ to: target.email, subject: `${b.name} — ${title}`, text: `${title}: ${money}`, html: emailLayout(b, { preheader: title, body: h(title) + p(body) + button(absolute(`/${l}/account/credit`) ?? b.url, l === "ar" ? "رصيدي" : "My web credit") }) });
    } catch (e) { console.warn("[credit] adjustment email failed:", (e as Error).message); }
  }
  revalidatePath(`/admin/customers/${target._id}`);
  revalidatePath("/admin/credit");
  return { ok: true, values: { message: `${kind === "add" ? "Added" : "Removed"} ${formatAED(a.amount, "en")}. Balance is now ${formatAED(a.balanceAfter, "en")}.` } };
}
