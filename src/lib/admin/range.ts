// Date-range filter for reports. Days are Asia/Dubai (UTC+4, no DST) calendar days.
const DUBAI_OFFSET_MS = 4 * 3600 * 1000;
const DAY = 24 * 3600 * 1000;

export type Range = { key: string; from: Date; to: Date; label: string; days: number };

const startOfDubaiDay = (t: number) => Math.floor((t + DUBAI_OFFSET_MS) / DAY) * DAY - DUBAI_OFFSET_MS;
const ymd = (d: string | undefined) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d)) ? Date.parse(d) - DUBAI_OFFSET_MS : null);

/** `range` = 7d | 30d | 90d | today | custom (with from/to as YYYY-MM-DD). Invalid input falls back to 30d. */
export function parseRange(sp: { range?: string; from?: string; to?: string }, now = new Date()): Range {
  const todayStart = startOfDubaiDay(now.getTime());
  const key = sp.range ?? "30d";
  if (key === "custom") {
    const from = ymd(sp.from), to = ymd(sp.to);
    if (from !== null && to !== null && to >= from && to - from <= 366 * DAY) {
      return { key, from: new Date(from), to: new Date(to + DAY - 1), label: `${sp.from} → ${sp.to}`, days: Math.round((to - from) / DAY) + 1 };
    }
  }
  const days = key === "today" ? 1 : key === "7d" ? 7 : key === "90d" ? 90 : 30;
  const k = key === "today" || key === "7d" || key === "90d" ? key : "30d";
  return { key: k, from: new Date(todayStart - (days - 1) * DAY), to: new Date(todayStart + DAY - 1), label: k === "today" ? "Today" : `Last ${days} days`, days };
}

/** YYYY-MM-DD (Dubai) for a timestamp — used to bucket per-day series. */
export const dubaiDay = (d: Date) => new Date(d.getTime() + DUBAI_OFFSET_MS).toISOString().slice(0, 10);
export const eachDay = (r: Range) => Array.from({ length: r.days }, (_, i) => dubaiDay(new Date(r.from.getTime() + i * DAY)));
