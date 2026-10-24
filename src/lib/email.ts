import "server-only";
import { getSettings } from "@/features/checkout/prepare";
import type { Locale } from "@/lib/i18n";

export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
/** Where customers write for complaints, refunds and exchanges. */
export const supportEmailFrom = (settingsEmail?: string) => process.env.SUPPORT_EMAIL || settingsEmail || process.env.SMTP_USER || "";
/** Absolute URL for an image/page path (emails can't use relative links). */
export const absolute = (u?: string | null) => (!u ? undefined : /^https?:\/\//.test(u) ? u : `${siteUrl()}${u.startsWith("/") ? "" : "/"}${u}`);

const C = { brand: "#0b6b57", soft: "#dff1ea", gold: "#b88a3b", ink: "#1c1a17", muted: "#6b6b6b", line: "#e7e3da", bg: "#f4f1ea" };

export type Brand = { name: string; logo?: string; url: string; supportEmail: string; locale: Locale; dir: "ltr" | "rtl" };

/** Store name + logo + support address for emails: the admin Settings (store name per language, logo), env SUPPORT_EMAIL wins for the address. */
export async function getBrand(locale: Locale): Promise<Brand> {
  const s = await getSettings();
  return { name: s.storeName?.[locale] || s.storeName?.en || "Store", logo: absolute(s.logo), url: siteUrl(), supportEmail: supportEmailFrom(s.supportEmail), locale, dir: locale === "ar" ? "rtl" : "ltr" };
}

/** The site's logo mark (rounded square with the store initial + gold spark) as email-safe HTML; an uploaded logo image replaces it. */
function logoHtml(b: Brand) {
  if (b.logo) return `<img src="${esc(b.logo)}" alt="${esc(b.name)}" height="44" style="display:block;height:44px;max-width:180px;border:0">`;
  const initial = esc([...b.name.trim()][0]?.toUpperCase() ?? "S");
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="44" height="44" align="center" valign="middle" style="width:44px;height:44px;background:#ffffff;border-radius:12px;color:${C.brand};font:700 24px Georgia,serif">${initial}<span style="color:${C.gold};font-size:12px;vertical-align:top;position:relative;top:6px">&#10022;</span></td></tr></table>`;
}

export const button = (href: string, label: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 4px"><tr><td style="background:${C.brand};border-radius:12px"><a href="${esc(href)}" style="display:inline-block;padding:13px 26px;color:#ffffff;font:600 15px Arial,sans-serif;text-decoration:none">${esc(label)}</a></td></tr></table>`;

export const p = (html: string) => `<p style="margin:0 0 14px;font:400 15px/1.65 Arial,sans-serif;color:${C.ink}">${html}</p>`;
export const h = (text: string) => `<h1 style="margin:0 0 12px;font:700 24px/1.3 Georgia,serif;color:${C.ink}">${esc(text)}</h1>`;

/** Branded shell shared by every email: coloured header with logo + store name, white card, support footer. */
export function emailLayout(b: Brand, o: { preheader: string; body: string }) {
  const ar = b.locale === "ar";
  const align = ar ? "right" : "left";
  return `<!doctype html><html lang="${b.locale}" dir="${b.dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:${C.bg}"><span style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(o.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bg}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;direction:${b.dir};text-align:${align}">
<tr><td style="background:${C.brand};border-radius:18px 18px 0 0;padding:20px 28px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" dir="${b.dir}"><tr><td valign="middle">${logoHtml(b)}</td><td valign="middle" style="padding:0 14px;font:700 20px Georgia,serif;color:#ffffff">${esc(b.name)}</td></tr></table></td></tr>
<tr><td style="background:#ffffff;padding:30px 28px;border-left:1px solid ${C.line};border-right:1px solid ${C.line}">${o.body}</td></tr>
<tr><td style="background:${C.soft};border-radius:0 0 18px 18px;padding:20px 28px;font:400 13px/1.6 Arial,sans-serif;color:${C.muted}">
${ar ? "تحتاجين مساعدة؟ للشكاوى أو الاسترجاع أو الاستبدال راسلينا على" : "Need help? For complaints, refunds or exchanges write to us at"} <a href="mailto:${esc(b.supportEmail)}" style="color:${C.brand};font-weight:600">${esc(b.supportEmail)}</a>.<br>
<a href="${esc(b.url)}" style="color:${C.brand};text-decoration:none">${esc(b.url.replace(/^https?:\/\//, ""))}</a> &middot; &copy; ${new Date().getFullYear()} ${esc(b.name)}</td></tr>
</table></td></tr></table></body></html>`;
}

/** Simple two-column detail rows (label / value). */
export function rows(items: [string, string][]) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 16px;border-top:1px solid ${C.line}">${items.map(([k, v]) => `<tr><td style="padding:9px 0;border-bottom:1px solid ${C.line};font:400 14px Arial,sans-serif;color:${C.muted}">${esc(k)}</td><td align="${"right"}" style="padding:9px 0;border-bottom:1px solid ${C.line};font:600 14px Arial,sans-serif;color:${C.ink};text-align:end">${v}</td></tr>`).join("")}</table>`;
}
