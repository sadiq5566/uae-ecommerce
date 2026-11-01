import "server-only";
import { Types } from "mongoose";
import { connectDb } from "@/lib/db";
import { creditSummary } from "@/features/credit/service";
import { CreditAdjustment } from "@/models/credit-adjustment";
import { User } from "@/models/user";

export type AdjustmentRow = {
  id: string; at: Date; kind: "add" | "deduct"; amount: number; balanceBefore: number; balanceAfter: number; reason: string;
  customer: { id: string; email: string; name: string }; admin: { email: string; name: string }; notified: boolean;
};

async function toRows(docs: Awaited<ReturnType<typeof CreditAdjustment.find>>): Promise<AdjustmentRow[]> {
  const ids = [...new Set(docs.map((d) => String(d.user)))].map((i) => new Types.ObjectId(i));
  const users = await User.find({ _id: { $in: ids } }).select("email name").lean();
  const byId = new Map(users.map((u) => [String(u._id), u]));
  return docs.map((d) => {
    const u = byId.get(String(d.user));
    return {
      id: String(d._id), at: d.createdAt, kind: d.kind, amount: d.amountFils / 100, balanceBefore: d.balanceBeforeFils / 100, balanceAfter: d.balanceAfterFils / 100, reason: d.reason,
      customer: { id: String(d.user), email: u?.email ?? "(deleted account)", name: u?.name ?? "" }, admin: { email: d.adminEmail ?? "—", name: d.adminName ?? "" }, notified: d.notified,
    };
  });
}

/** The credit ledger, newest first. Filter by kind and / or one customer's email. */
export async function listAdjustments(f: { page: number; per: number; kind?: "add" | "deduct"; email?: string }) {
  await connectDb();
  const match: Record<string, unknown> = {};
  if (f.kind) match.kind = f.kind;
  if (f.email) {
    const u = await User.findOne({ email: f.email.toLowerCase() }).select("_id").lean();
    match.user = u?._id ?? new Types.ObjectId();
  }
  const [total, docs] = await Promise.all([
    CreditAdjustment.countDocuments(match),
    CreditAdjustment.find(match).sort({ createdAt: -1 }).skip((f.page - 1) * f.per).limit(f.per).lean(),
  ]);
  return { total, pages: Math.max(1, Math.ceil(total / f.per)), rows: await toRows(docs as never) };
}

/** One customer's ledger (their profile page). */
export async function customerAdjustments(userId: string, limit = 8) {
  await connectDb();
  return toRows((await CreditAdjustment.find({ user: userId }).sort({ createdAt: -1 }).limit(limit).lean()) as never);
}

/** Totals for the top of the page: credit added and removed by staff in the last 30 days. */
export async function adjustmentTotals() {
  await connectDb();
  const since = new Date(Date.now() - 30 * 86_400_000);
  const agg = await CreditAdjustment.aggregate([{ $match: { createdAt: { $gte: since } } }, { $group: { _id: "$kind", fils: { $sum: "$amountFils" }, n: { $sum: 1 } } }]);
  const get = (k: string) => agg.find((a) => a._id === k) ?? { fils: 0, n: 0 };
  return { added: get("add").fils / 100, addedN: get("add").n as number, removed: get("deduct").fils / 100, removedN: get("deduct").n as number };
}

/** Look a customer up by email for the Web credit page: who they are and what they can spend now. */
export async function findCustomerCredit(email: string) {
  await connectDb();
  const u = await User.findOne({ email: email.toLowerCase(), role: "customer" }).select("email name emailVerifiedAt status").lean();
  if (!u) return null;
  const c = await creditSummary(String(u._id));
  return { id: String(u._id), email: u.email, name: u.name, verified: !!u.emailVerifiedAt, active: u.status === "active", balance: c.balance, expiring: c.expiringFils / 100, nextExpiry: c.nextExpiry };
}
