// In production, auth-bearing cookies use the __Host- prefix: browsers then require Secure, Path=/ and no Domain,
// which blocks subdomain cookie-injection/fixation. (The prefix needs HTTPS, so development uses plain names.)
const prod = process.env.NODE_ENV === "production";
export const SESSION_COOKIE = prod ? "__Host-session" : "session";
export const CART_COOKIE = prod ? "__Host-cart" : "cart_id";

export const secureCookie = prod;

/** Staff (admin) sessions are shorter-lived than customer sessions. */
export const SESSION_TTL_S = { customer: 60 * 60 * 24 * 30, staff: 60 * 60 * 24 * 3 } as const;
export const ttlFor = (role: string | undefined) => (role && role !== "customer" ? SESSION_TTL_S.staff : SESSION_TTL_S.customer);
