// Arabic-aware helpers for grouping colour / size variants. Shared by lib/variants.ts, lib/import-group.ts and the db:merge-variants / db:fix-groups scripts.
// Standalone on purpose (no imports), so any of them can use it without a circular dependency.

/** Text comparison key: lower-case, no accents / Arabic diacritics / tatweel, one form of alef / ya / ta-marbuta, Arabic-Indic digits -> 0-9, punctuation -> one space. */
export function normText(s?: string | null): string {
  return (s ?? "")
    .normalize("NFKD")
    .replace(/[ً-ٰٟـ̀-ͯ]/g, "") // tashkeel, dagger alef, tatweel, Latin accents
    .replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/ؤ/g, "و").replace(/ئ/g, "ي")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Arabic colour words (normalised spelling, without the leading "ال") -> the English colour name used by the swatches. Masculine, feminine and common dialect spellings. */
export const AR_COLORS: Record<string, string> = {
  اسود: "black", سوداء: "black", سود: "black", ابيض: "white", بيضاء: "white", بيض: "white",
  بني: "brown", بنيه: "brown", قهوه: "brown", قهوي: "brown", رمادي: "grey", رماديه: "grey", سكني: "grey",
  فضي: "silver", فضيه: "silver", ذهبي: "gold", ذهبيه: "gold", دهبي: "gold", "ذهبي وردي": "rose gold", "روز جولد": "rose gold", "روزجولد": "rose gold",
  احمر: "red", حمراء: "red", ازرق: "blue", زرقاء: "blue", اخضر: "green", خضراء: "green", اصفر: "yellow", صفراء: "yellow",
  برتقالي: "orange", برتقاليه: "orange", وردي: "pink", ورديه: "pink", زهري: "pink", زهريه: "pink",
  بنفسجي: "purple", بنفسجيه: "purple", ارجواني: "purple", موف: "purple", كحلي: "navy", كحليه: "navy", "ازرق غامق": "navy", "ازرق فاتح": "light blue", سماوي: "light blue",
  بيج: "beige", كريمي: "cream", كريميه: "cream", عاجي: "ivory", عنابي: "burgundy", خمري: "burgundy", تركواز: "turquoise", فيروزي: "turquoise",
  زيتي: "olive", زيتوني: "olive", كاكي: "khaki", نحاسي: "copper", نحاسيه: "copper", برونزي: "bronze", برونزيه: "bronze", جملي: "camel", "متعدد الالوان": "multi", ملون: "multi", ملونه: "multi",
};
const AR_COLOR_KEYS = Object.keys(AR_COLORS);
const dropAl = (w: string) => (w.startsWith("ال") && w.length > 4 ? w.slice(2) : w);

/** Canonical English colour for an Arabic or English colour text ("الأسود" -> "black", "Black" -> "black"). Unknown text comes back normalised. */
export function colorKey(c?: string | null): string {
  const n = normText(c);
  if (!n) return "";
  const hit = AR_COLORS[n] ?? AR_COLORS[n.split(" ").map(dropAl).join(" ")];
  return hit ?? n;
}
/** English colour name for a swatch lookup, or undefined when the text is not a known Arabic colour. */
export const arColorToEn = (c?: string | null): string | undefined => {
  const n = normText(c);
  return n ? AR_COLORS[n] ?? AR_COLORS[n.split(" ").map(dropAl).join(" ")] : undefined;
};

const SIZE_WORDS = new Set(["مقاس", "المقاس", "حجم", "الحجم", "قياس", "القياس", "size"]);
const UNITS = new Set(["ملم", "مم", "سم", "mm", "cm"]);
const SIZE_TOKEN = /^(\d{1,3}(?:\.\d)?|xxs|xs|s|m|l|xl|xxl|xxxl)$/i;

/**
 * Splits a name that ends in Arabic colour / size words ("ساعة رولكس - أسود - مقاس 38") into base + colour + size.
 * Pass the English splitter (`splitName` from lib/variants.ts) so English parts are handled too, in any order and mixed with Arabic.
 * `color` keeps the text as written (shown to shoppers); `colorKey` is the canonical English name used to compare / group.
 */
export function splitNameAny(
  name: string,
  splitEn: (n: string) => { base: string; color?: string; size?: string },
): { base: string; color?: string; size?: string; colorKey?: string } {
  let base = (name ?? "").replace(/\s+/g, " ").trim();
  let color: string | undefined;
  let size: string | undefined;
  const sep = /^[-–—|/(),:]+$/;
  for (let round = 0; round < 4; round++) {
    let hit = false;
    const en = splitEn(base);
    if (en.base !== base) { color ??= en.color; size ??= en.size; base = en.base; hit = true; }
    const t = base.split(" ");
    while (t.length && sep.test(t[t.length - 1])) t.pop();
    const stripEnd = (s: string) => s.replace(/[()]+$/g, "");
    // size: "[مقاس|حجم] 38 [مم]" at the end
    if (!size && t.length) {
      let end = t.length;
      const unit = UNITS.has(normText(t[end - 1])) && end >= 2;
      if (unit) end--;
      const num = normText(stripEnd(t[end - 1] ?? "")).replace(/\s/g, "");
      const before = normText(t[end - 2] ?? "");
      if (SIZE_TOKEN.test(num) && (SIZE_WORDS.has(before) || unit || (sep.test(t[end - 2] ?? "") && end >= 3))) {
        size = num.toUpperCase().replace(/\.0$/, "");
        t.length = SIZE_WORDS.has(before) || sep.test(t[end - 2] ?? "") ? end - 2 : end - 1;
        hit = true;
      }
    }
    while (t.length && sep.test(t[t.length - 1])) t.pop();
    // colour: one or two trailing words that are a known Arabic colour (with or without "ال")
    if (!color && t.length > 1) {
      for (const n of [2, 1]) {
        if (t.length <= n) continue;
        const words = t.slice(-n).map((w) => stripEnd(w.replace(/^\(/, "")));
        const key = words.map((w) => dropAl(normText(w))).join(" ");
        if (AR_COLORS[key] || AR_COLORS[normText(words.join(" "))]) {
          color = words.join(" ").replace(/^[-–—|/(),:\s]+|[-–—|/(),:\s]+$/g, "");
          t.length -= n;
          hit = true;
          break;
        }
      }
    }
    while (t.length && sep.test(t[t.length - 1])) t.pop();
    base = t.join(" ").replace(/[-–|/(\s]+$/, "").trim();
    if (!hit) break;
  }
  // Arabic puts the colour adjective right after the noun, often in the middle ("قبعة غوتشي سوداء بشعار كانفاس"): take the first colour run out of the name.
  if (!color && /[؀-ۿ]/.test(base)) {
    const t = base.split(" ");
    const isColor = (w: string) => !!AR_COLORS[dropAl(normText(w.replace(/^و(?=\S{3,})/, "")))] || !!AR_COLORS[dropAl(normText(w))];
    for (let i = 0; i < t.length; i++) {
      let j = i;
      const two = i + 1 < t.length && (AR_COLORS[dropAl(normText(t[i])) + " " + dropAl(normText(t[i + 1]))] || AR_COLORS[normText(t[i] + " " + t[i + 1])]);
      if (two) j = i + 2;
      else if (isColor(t[i]) && i > 0) j = i + 1; // never the very first word (that is the product noun)
      if (j === i) continue;
      while (j < t.length && (isColor(t[j]) || (t[j] === "و" && j + 1 < t.length && isColor(t[j + 1])))) j++;
      color = t.slice(i, j).join(" ");
      base = [...t.slice(0, i), ...t.slice(j)].join(" ").trim();
      break;
    }
  }
  return { base, color, size, colorKey: color ? colorKey(color) : undefined };
}

/** Same product? Compares normalised text, so Arabic spelling variants, diacritics, tatweel and odd spaces do not matter. */
export const sameText = (a?: string | null, b?: string | null) => !!normText(a) && normText(a) === normText(b);

export { AR_COLOR_KEYS };
