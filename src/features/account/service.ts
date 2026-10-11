import "server-only";
import { connectDb } from "@/lib/db";
import { Address } from "@/models/address";

export type AddressView = {
  id: string; label?: string; recipientName: string; phone: string; emirate: string; area: string; street?: string;
  building: string; unit?: string; landmark?: string; instructions?: string; isDefault: boolean;
};

export async function getAddresses(userId: string): Promise<AddressView[]> {
  await connectDb();
  const rows = await Address.find({ user: userId }).sort({ isDefault: -1, updatedAt: -1 }).lean();
  return rows.map((a) => ({
    id: String(a._id), label: a.label ?? undefined, recipientName: a.recipientName, phone: a.phone, emirate: a.emirate, area: a.area,
    street: a.street ?? undefined, building: a.building, unit: a.unit ?? undefined, landmark: a.landmark ?? undefined,
    instructions: a.instructions ?? undefined, isDefault: !!a.isDefault,
  }));
}
