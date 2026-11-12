import { inr } from "./format";

/** ₹950, ₹12k, ₹1.2L, ₹3.4Cr: short enough that axis ticks never need rotating. */
export function compactInr(v: number): string {
  const a = Math.abs(v);
  const sign = v < 0 ? "−" : "";
  const trim = (n: number) => String(Number(n.toFixed(1)));
  if (a >= 1e7) return `${sign}₹${trim(a / 1e7)}Cr`;
  if (a >= 1e5) return `${sign}₹${trim(a / 1e5)}L`;
  if (a >= 1e3) return `${sign}₹${trim(a / 1e3)}k`;
  return `${sign}₹${Math.round(a)}`;
}

export const moneyAxis = (extra: Record<string, unknown> = {}) => ({
  type: "value" as const,
  min: 0,
  axisLabel: { formatter: compactInr },
  ...extra,
});

/** Month/year ticks on a time axis, never rotated. Pass data as [date, value] pairs. */
export const timeAxis = (extra: Record<string, unknown> = {}) => ({
  type: "time" as const,
  axisLabel: {
    hideOverlap: true,
    rotate: 0,
    formatter: { year: "{yyyy}", month: "{MMM} {yyyy}", day: "{d} {MMM}" },
  },
  ...extra,
});

export const inrTooltip = (val: unknown) => (val != null ? inr(Number(val), 0) : "–");

/** "2024-03" -> "Mar 2024". Other labels pass through. */
export const monthLabel = (v: string): string =>
  /^\d{4}-\d{2}$/.test(v)
    ? new Date(`${v}-01T00:00:00`).toLocaleDateString("en-IN", { month: "short", year: "numeric" })
    : v;

/** Keep at most `max` evenly spaced items. */
export function thin<T>(items: readonly T[], max: number): T[] {
  if (items.length <= max) return [...items];
  const step = items.length / max;
  return Array.from({ length: max }, (_, i) => items[Math.floor(i * step)]);
}
