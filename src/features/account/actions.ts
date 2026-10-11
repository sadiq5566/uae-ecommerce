"use server";
import { revalidatePath } from "next/cache";
import { Types } from "mongoose";
import { connectDb } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { rateLimit } from "@/lib/rate-limit";
import { createSession, destroyAllSessions, getCurrentUser } from "@/lib/auth/session";
import { echo, fieldErrors, addressSchema, profileSchema, type FormState } from "@/features/auth/schemas";
import { Address } from "@/models/address";
import { User } from "@/models/user";

const MAX_ADDRESSES = 10;
const fdObj = (fd: FormData) => Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === "string"));

export async function updateProfileAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "auth" };
  const parsed = profileSchema.safeParse(fdObj(fd));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values: echo(fd) };
  await connectDb();
  const { phone, ...rest } = parsed.data;
  await User.updateOne({ _id: user.id }, phone ? { ...rest, phone } : { ...rest, $unset: { phone: 1 } });
  revalidatePath("/[lang]/account", "layout");
  return { ok: true };
}

export async function saveAddressAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "auth" };
  const parsed = addressSchema.safeParse(fdObj(fd));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values: echo(fd) };
  await connectDb();
  const id = String(fd.get("id") ?? "");
  const count = await Address.countDocuments({ user: user.id });
  const first = count === 0;
  let savedId: string;
  if (id) {
    if (!Types.ObjectId.isValid(id)) return { error: "not_found" };
    // Ownership is part of the query: a user can never edit someone else's address.
    const res = await Address.findOneAndUpdate({ _id: id, user: user.id }, parsed.data, { returnDocument: "after" });
    if (!res) return { error: "not_found" };
    savedId = String(res._id);
  } else {
    if (count >= MAX_ADDRESSES) return { error: "address_limit" };
    savedId = String((await Address.create({ ...parsed.data, user: user.id, isDefault: first || parsed.data.isDefault }))._id);
  }
  if (parsed.data.isDefault || first) await Address.updateMany({ user: user.id, _id: { $ne: savedId } }, { isDefault: false });
  revalidatePath("/[lang]/account/addresses", "page");
  revalidatePath("/[lang]/checkout", "page");
  return { ok: true };
}

export async function deleteAddressAction(fd: FormData) {
  const user = await getCurrentUser();
  const id = String(fd.get("id") ?? "");
  if (!user || !Types.ObjectId.isValid(id)) return;
  await connectDb();
  const gone = await Address.findOneAndDelete({ _id: id, user: user.id });
  if (gone?.isDefault) { // keep one default if any addresses remain
    const next = await Address.findOne({ user: user.id }).sort({ updatedAt: -1 });
    if (next) await Address.updateOne({ _id: next._id }, { isDefault: true });
  }
  revalidatePath("/[lang]/account/addresses", "page");
}

export async function setDefaultAddressAction(fd: FormData) {
  const user = await getCurrentUser();
  const id = String(fd.get("id") ?? "");
  if (!user || !Types.ObjectId.isValid(id)) return;
  await connectDb();
  if (!(await Address.exists({ _id: id, user: user.id }))) return;
  await Address.updateMany({ user: user.id }, [{ $set: { isDefault: { $eq: ["$_id", new Types.ObjectId(id)] } } }]);
  revalidatePath("/[lang]/account/addresses", "page");
}

/** Change password while signed in: needs the current password, signs out every other device, keeps this one. */
export async function changePasswordAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "auth" };
  const current = String(fd.get("current") ?? ""); const next = String(fd.get("password") ?? "");
  if (next.length < 10) return { fieldErrors: { password: "password_short" } };
  if (next.length > 128) return { fieldErrors: { password: "password_long" } };
  if (!(await rateLimit(`chpw:${user.id}`, 5, 900)).ok) return { error: "rate_limited" };
  await connectDb();
  const doc = await User.findById(user.id).select("+passwordHash");
  if (!doc || !(await verifyPassword(current, doc.passwordHash))) return { fieldErrors: { current: "password_wrong" } };
  if (current === next) return { fieldErrors: { password: "password_same" } };
  doc.passwordHash = await hashPassword(next);
  await doc.save();
  await destroyAllSessions(user.id);
  await createSession(user.id);
  return { ok: true };
}
