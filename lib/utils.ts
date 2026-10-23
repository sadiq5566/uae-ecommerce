// Arabic letters -> Latin, so an Arabic product name still gives a readable URL slug (vowels are not written in Arabic, so "حقيبة" -> "hqybh").
const AR: Record<string, string> = {
  "ا": "a", "أ": "a", "إ": "i", "آ": "aa", "ء": "", "ؤ": "w", "ئ": "y", "ى": "a", "ة": "h", "ب": "b", "ت": "t", "ث": "th", "ج": "j", "ح": "h", "خ": "kh",
  "د": "d", "ذ": "dh", "ر": "r", "ز": "z", "س": "s", "ش": "sh", "ص": "s", "ض": "d", "ط": "t", "ظ": "z", "ع": "a", "غ": "gh", "ف": "f", "ق": "q",
  "ك": "k", "ل": "l", "م": "m", "ن": "n", "ه": "h", "و": "w", "ي": "y", "پ": "p", "چ": "ch", "ژ": "zh", "گ": "g",
};
const transliterate = (s: string) =>
  s
    .replace(/[ً-ٰٟـ]/g, "") // vowel marks and tatweel
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)) // Arabic-Indic digits
    .replace(/[؀-ۿ]/g, (c) => AR[c] ?? "");

export const slugify = (s: string) =>
  transliterate(s.normalize("NFKD"))
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export const isDuplicateKey = (e: unknown) => typeof e === "object" && e !== null && (e as { code?: number }).code === 11000;
