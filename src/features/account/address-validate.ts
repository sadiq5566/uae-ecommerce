import { EMIRATES, normalizeUaePhone } from "@/features/auth/schemas";

/** Fields the shopper types in an address form, as submitted. */
export type AddressValues = Record<string, string | undefined>;

/**
 * Client-side mirror of addressSchema (features/auth/schemas.ts): same rules, same message keys (messages/*.json "errors"), so the shopper sees
 * the problem as they leave a field instead of after a round trip. The server still validates everything.
 */
export function validateAddressField(name: string, raw: string | undefined): string | undefined {
  const v = (raw ?? "").trim();
  switch (name) {
    case "recipientName": return v.length < 2 ? "name_short" : v.length > 100 ? "name_long" : undefined;
    case "phone": return normalizeUaePhone(v) ? undefined : "phone_invalid";
    case "emirate": return (EMIRATES as readonly string[]).includes(v) ? undefined : "required";
    case "area": return v.length < 2 ? "required" : v.length > 100 ? "too_long" : undefined;
    case "building": return v.length < 1 ? "required" : v.length > 100 ? "too_long" : undefined;
    case "label": case "unit": return v.length > 40 ? "too_long" : undefined;
    case "street": case "landmark": return v.length > 150 ? "too_long" : undefined;
    case "instructions": return v.length > 300 ? "too_long" : undefined;
    default: return undefined;
  }
}

export const ADDRESS_FIELDS = ["label", "recipientName", "phone", "emirate", "area", "street", "building", "unit", "landmark", "instructions"] as const;

export function validateAddress(values: AddressValues): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of ADDRESS_FIELDS) { const e = validateAddressField(f, values[f]); if (e) out[f] = e; }
  return out;
}
