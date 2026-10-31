/** Keywords / hashtags typed by an admin: "#abaya, summer dress\n#uae" → "abaya, summer dress, uae". Separators: comma, semicolon, new line or #. */
export function cleanKeywords(raw: string | undefined | null): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of (raw ?? "").split(/[,;\n#]+/)) {
    const w = k.replace(/\s+/g, " ").trim().slice(0, 50);
    if (w.length < 2 || seen.has(w.toLowerCase())) continue;
    seen.add(w.toLowerCase()); out.push(w);
    if (out.length >= 25) break;
  }
  return out.join(", ");
}

/** The stored string as a list, for the <meta name="keywords"> tag and article tags. */
export const keywordList = (stored: string | undefined | null) => (stored ? stored.split(",").map((k) => k.trim()).filter(Boolean) : []);
