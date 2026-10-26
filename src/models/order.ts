import { Schema, model, models, type Model, type Types } from "mongoose";

export const ORDER_STATUSES = ["pending_payment", "confirmed", "processing", "packed", "out_for_delivery", "delivered", "cancelled", "refund_pending", "refunded"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export const PAYMENT_METHODS = ["card", "apple_pay", "google_pay", "tabby", "cod", "credit"] as const; // "credit" = fully covered by web credit
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_STATUSES = ["pending", "paid", "failed", "cod_pending", "cod_collected", "refund_pending", "refunded"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

const i18n = { en: String, ar: String };

// Everything on an order is a snapshot: later catalogue/address/settings edits never change history.
const orderSchema = new Schema(
  {
    orderNumber: { type: String, required: true, unique: true },
    // Guest orders (no account) have no user; they're found by order number + phone, or by the secret trackToken in the link.
    user: { type: Schema.Types.ObjectId, ref: "User", index: true },
    guest: { type: Boolean, default: false },
    // Guest cart to empty once an online payment succeeds (the cart is kept while payment is pending).
    cartGuestId: String,
    trackToken: { type: String, index: true },
    email: { type: String, trim: true, lowercase: true },
    source: { type: String, enum: ["cart", "buy_now"], default: "cart" },
    locale: { type: String, enum: ["en", "ar"], default: "en" },
    idempotencyKey: { type: String, required: true },
    status: { type: String, enum: ORDER_STATUSES, required: true, index: true },
    items: [{
      _id: false, productId: Schema.Types.ObjectId, sku: String, name: i18n, variantLabel: i18n, icon: String, image: String,
      qty: Number, unitPrice: Number, listPrice: Number, lineTotal: Number, couponShare: { type: Number, default: 0 },
    }],
    address: {
      recipientName: String, phone: String, emirate: String, area: String, street: String, building: String, unit: String, landmark: String, instructions: String,
    },
    delivery: { zone: String, zoneName: i18n, estimate: i18n },
    totals: {
      listSubtotal: Number, itemDiscounts: Number, subtotal: Number, couponDiscount: Number, offerDiscount: { type: Number, default: 0 }, deliveryFee: Number, codFee: Number,
      credit: { type: Number, default: 0 }, tax: Number, taxIncluded: Boolean, total: Number, currency: { type: String, default: "AED" },
    },
    coupon: { code: String, discount: Number },
    // Web credit spent on this order: which lots paid how much (fils), so a cancelled order can give it back exactly once.
    credit: { _id: false, amountFils: Number, lots: [{ _id: false, lot: Schema.Types.ObjectId, fils: Number }], restoredAt: Date },
    offer: { kind: String, percent: Number, discount: Number }, // automatic offer applied (tier / first_order)
    payment: {
      method: { type: String, enum: PAYMENT_METHODS, required: true },
      status: { type: String, enum: PAYMENT_STATUSES, required: true },
      provider: String, providerRef: String, amount: Number, paidAt: Date, failureReason: String,
    },
    stockReserved: { type: Boolean, default: false },
    expiresAt: Date, // unpaid online-payment orders are cancelled and stock released after this
    timeline: [{ _id: false, status: String, at: { type: Date, default: Date.now }, by: String, note: String }],
  },
  { timestamps: true },
);
orderSchema.index({ user: 1, idempotencyKey: 1 }, { unique: true }); // duplicate submissions can't create two orders
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ status: 1, expiresAt: 1 });
orderSchema.index({ "payment.providerRef": 1 }, { sparse: true });

type L10n = { en: string; ar: string };
// Explicit shape (Mongoose's inferred type makes every nested field optional/nullable, which is noisy for lean reads).
export interface OrderDoc {
  _id: Types.ObjectId;
  orderNumber: string; user?: Types.ObjectId | null; guest?: boolean; cartGuestId?: string; trackToken?: string; email?: string | null; source?: "cart" | "buy_now"; locale: "en" | "ar"; idempotencyKey: string; status: OrderStatus;
  items: { productId: Types.ObjectId; sku: string; name: L10n; variantLabel?: L10n; icon?: string; image?: string; qty: number; unitPrice: number; listPrice: number; lineTotal: number; couponShare: number }[];
  address: { recipientName: string; phone: string; emirate: string; area: string; street?: string; building: string; unit?: string; landmark?: string; instructions?: string };
  delivery: { zone: string; zoneName: L10n; estimate: L10n };
  totals: { listSubtotal: number; itemDiscounts: number; subtotal: number; couponDiscount: number; offerDiscount?: number; deliveryFee: number; codFee: number; credit?: number; tax: number; taxIncluded: boolean; total: number; currency: string };
  coupon?: { code: string; discount: number };
  credit?: { amountFils: number; lots: { lot: Types.ObjectId; fils: number }[]; restoredAt?: Date };
  offer?: { kind: "tier" | "first_order"; percent?: number; discount: number };
  payment: { method: PaymentMethod; status: PaymentStatus; provider?: string; providerRef?: string; amount?: number; paidAt?: Date; failureReason?: string };
  stockReserved: boolean; expiresAt?: Date | null;
  timeline: { status: string; at: Date; by?: string; note?: string }[];
  createdAt: Date; updatedAt: Date;
}
export const Order = ((models.Order as unknown as Model<OrderDoc>) ?? model<OrderDoc>("Order", orderSchema)) as Model<OrderDoc>;
