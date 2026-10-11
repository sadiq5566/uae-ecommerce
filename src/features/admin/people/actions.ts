"use server";
import { revalidatePath } from "next/cache";
import { Types } from "mongoose";
import { FORBIDDEN, actor } from "@/lib/admin/guard";
import { audit } from "@/lib/admin/audit";
import { fail, issues } from "@/lib/admin/common";
import { destroyAllSessions } from "@/lib/auth/session";
import { connectDb } from "@/lib/db";
import type { FormState } from "@/features/auth/schemas";
import { ROLES, User } from "@/models/user";
import { z } from "zod";

/** Enable/disable a customer account (disabling signs them out everywhere). Owner only. */
export async function setCustomerStatusAction(fd: FormData) {
  const user = await actor("users:manage");
  const id = String(fd.get("id") ?? ""); const status = String(fd.get("status"));
  if (!user || !Types.ObjectId.isValid(id) || !["active", "disabled"].includes(status) || id === user.id) return;
  await connectDb();
  const target = await User.findOneAndUpdate({ _id: id, role: "customer" }, { status }, { returnDocument: "after" });
  if (!target) return;
  if (status === "disabled") await destroyAllSessions(id);
  await audit(user, `customer.${status === "disabled" ? "disable" : "enable"}`, "user", id, `${status === "disabled" ? "Disabled" : "Enabled"} customer account`);
  revalidatePath(`/admin/customers/${id}`); revalidatePath("/admin/customers");
}

const roleSchema = z.object({ email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email")), role: z.enum(ROLES, "Choose a role") });

/** Give an existing account a staff role (or set it back to customer). Owner only; can't change your own role or remove the last owner. */
export async function setRoleAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await actor("users:manage");
  if (!user) return { error: FORBIDDEN };
  const parsed = roleSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fail(issues(parsed.error), fd);
  const { email, role } = parsed.data;
  await connectDb();
  const target = await User.findOne({ email });
  if (!target) return fail({ email: "No account with this email. Ask them to register first." }, fd);
  if (String(target._id) === user.id) return fail({ email: "You can't change your own role." }, fd);
  if (target.role === "owner" && role !== "owner" && (await User.countDocuments({ role: "owner", status: "active" })) <= 1) return fail({ role: "There must always be at least one owner." }, fd);
  const before = target.role;
  target.role = role; await target.save();
  if (before !== role) await destroyAllSessions(String(target._id)); // force re-login so the new permissions apply immediately
  await audit(user, "user.role", "user", String(target._id), `Role of ${email}: ${before} → ${role}`);
  revalidatePath("/admin/users");
  return { ok: true };
}
