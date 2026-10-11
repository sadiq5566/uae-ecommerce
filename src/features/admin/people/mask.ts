/** Partial masking for privacy: "sara.ali@example.com" → "s***@e***.com". */
export function maskEmail(email: string) {
  const [local, domain = ""] = email.split("@");
  const [host, ...tld] = domain.split(".");
  return `${local.slice(0, 1)}***@${host.slice(0, 1)}***${tld.length ? "." + tld.join(".") : ""}`;
}
export const maskPhone = (p: string) => (p.length > 5 ? `${p.slice(0, 4)}•••${p.slice(-2)}` : "•••");
