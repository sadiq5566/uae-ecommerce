const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Product names scraped from other shops often end with the colour ("Earrings - Red"). The page shows the *selected* option instead, so strip any trailing " - <variant label>". */
export function baseName(name: string, labels: string[]): string {
  let out = name.trim();
  for (const l of labels.filter(Boolean)) out = out.replace(new RegExp(`\\s*[-–—|:/,]\\s*${escapeRe(l.trim())}\\s*$`, "i"), "");
  return out;
}
