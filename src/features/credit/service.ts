import "server-only";
import { Types } from "mongoose";
import { connectDb } from "@/lib/db";
import { CreditLot, type CreditSource } from "@/models/credit-lot";
import { Order } from "@/models/order";

/** Web credit stays spendable this long after it is issued. */
export const CREDIT_VALID_DAYS = 90;
const DAY = 86_400_000;
const toFils = (aed: number) => Math.round(aed * 100);
const active = (now: Date) => ({ remainingFils: { $gt: 0 }, expiresAt: { $gt: now } });

export type CreditSummary = { balanceFils: number; balance: number; nextExpiry?: Date; expiringFils: number; lots: { id: string; remaining: number; amount: number; expiresAt: Date; source: CreditSource; ref?: string }[] };

/** What the customer can spend right now, plus the lots behind it (soonest expiry first). */
export async function creditSummary(userId: string, now = new Date()): Promise<CreditSummary> {
  await connectDb();
  const lots = await CreditLot.find({ user: userId, ...active(now) }).sort({ expiresAt: 1 }).lean();
  const balanceFils = lots.reduce((a, l) => a + l.remainingFils, 0);
  const soon = now.getTime() + 14 * DAY;
  return {
    balanceFils, balance: balanceFils / 100, nextExpiry: lots[0]?.expiresAt,
    expiringFils: lots.filter((l) => l.expiresAt.getTime() <= soon).reduce((a, l) => a + l.remainingFils, 0),
    lots: lots.map((l) => ({ id: String(l._id), remaining: l.remainingFils / 100, amount: l.amountFils / 100, expiresAt: l.expiresAt, source: l.source, ref: l.ref ?? undefined })),
  };
}

/** Every lot ever issued to the customer, newest first, with its state — for the account history. */
export async function creditHistory(userId: string, now = new Date()) {
  await connectDb();
  const lots = await CreditLot.find({ user: userId }).sort({ createdAt: -1 }).limit(50).lean();
  return lots.map((l) => ({
    id: String(l._id), amount: l.amountFils / 100, remaining: l.remainingFils / 100, issuedAt: l.createdAt, expiresAt: l.expiresAt, source: l.source, ref: l.ref ?? undefined,
    state: (l.expiresAt <= now && l.remainingFils > 0 ? "expired" : l.remainingFils === 0 ? "used" : "active") as "active" | "used" | "expired",
  }));
}

/** Issue a new lot. A return pays out once: a repeat for the same return number returns the existing lot. */
export async function issueCredit(input: { userId: string | Types.ObjectId; amount: number; source: CreditSource; ref?: string; note?: { en: string; ar: string }; now?: Date }): Promise<{ id: string; amount: number; expiresAt: Date; created: boolean }> {
  await connectDb();
  const fils = toFils(input.amount);
  if (!(fils > 0)) throw new Error("credit amount must be positive");
  const now = input.now ?? new Date();
  try {
    const lot = await CreditLot.create({ user: input.userId, amountFils: fils, remainingFils: fils, expiresAt: new Date(now.getTime() + CREDIT_VALID_DAYS * DAY), source: input.source, ref: input.ref, note: input.note });
    return { id: String(lot._id), amount: fils / 100, expiresAt: lot.expiresAt, created: true };
  } catch (e) {
    if ((e as { code?: number }).code === 11000 && input.ref) {
      const dup = await CreditLot.findOne({ source: input.source, ref: input.ref }).lean();
      if (dup) return { id: String(dup._id), amount: dup.amountFils / 100, expiresAt: dup.expiresAt, created: false };
    }
    throw e;
  }
}

/**
 * Take `fils` from the customer's credit, soonest-expiring lot first. Each lot is debited with a conditional update
 * (remaining ≥ take), so two parallel checkouts can never spend the same money. All-or-nothing: on a shortfall every
 * debit already made is put back and `ok:false` is returned.
 */
export async function spendCredit(userId: string, fils: number, now = new Date()): Promise<{ ok: true; lots: { lot: Types.ObjectId; fils: number }[] } | { ok: false }> {
  await connectDb();
  const taken: { lot: Types.ObjectId; fils: number }[] = [];
  let need = fils;
  for (let pass = 0; need > 0 && pass < 5; pass++) {
    const lots = await CreditLot.find({ user: userId, ...active(now) }).sort({ expiresAt: 1 }).lean();
    if (!lots.length) break;
    for (const l of lots) {
      if (need <= 0) break;
      const take = Math.min(l.remainingFils, need);
      const r = await CreditLot.updateOne({ _id: l._id, remainingFils: { $gte: take } }, { $inc: { remainingFils: -take } });
      if (r.modifiedCount) { taken.push({ lot: l._id, fils: take }); need -= take; }
    }
  }
  if (need > 0) { await putBack(taken); return { ok: false }; }
  return { ok: true, lots: taken };
}

const putBack = async (lots: { lot: Types.ObjectId; fils: number }[]) => {
  for (const t of lots) await CreditLot.updateOne({ _id: t.lot }, { $inc: { remainingFils: t.fils } });
};

/**
 * Give an order's web credit back (cancelled / expired / failed order). Exactly once: the order is flagged first.
 * The restored money keeps its original lot — but never less than a week of validity, so a cancel on day 89 isn't a loss.
 */
export async function restoreOrderCredit(orderId: Types.ObjectId, now = new Date()): Promise<number> {
  await connectDb();
  const o = await Order.findOneAndUpdate({ _id: orderId, "credit.amountFils": { $gt: 0 }, "credit.restoredAt": { $exists: false } }, { $set: { "credit.restoredAt": now } }, { returnDocument: "before" }).lean();
  if (!o?.credit?.lots?.length) return 0;
  const floor = new Date(now.getTime() + 7 * DAY);
  for (const t of o.credit.lots) {
    await CreditLot.updateOne({ _id: t.lot }, { $inc: { remainingFils: t.fils } });
    await CreditLot.updateOne({ _id: t.lot, expiresAt: { $lt: floor } }, { $set: { expiresAt: floor } });
  }
  return o.credit.amountFils / 100;
}

