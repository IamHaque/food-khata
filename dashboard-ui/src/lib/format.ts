// One place for ledger-style figures. Indian digit grouping everywhere.
/** Round first, then format, so a value that rounds to zero never carries a sign (a rounded zero shows as ₹0.00). */
const split = (n: number, dp: number) => {
  const r = Math.round(Math.abs(n) * 10 ** dp) / 10 ** dp;
  return { zero: r === 0, neg: n < 0, text: r.toLocaleString("en-IN", { minimumFractionDigits: dp, maximumFractionDigits: dp }) };
};

/** ₹1,23,456 (dp=0) or ₹1,23,456.50 (dp=2). Real negatives get a leading minus; a rounded zero gets none. */
export function inr(value: number | null | undefined, dp = 0): string {
  if (value == null || !Number.isFinite(Number(value))) return "–";
  const { zero, neg, text } = split(Number(value), dp);
  return `${neg && !zero ? "−" : ""}₹${text}`;
}

/** Always shows a sign: +₹120 / −₹120. Use for discounts, refunds and deltas. A rounded zero shows no sign. */
export function signedInr(value: number, dp = 2): string {
  const { zero, neg, text } = split(value, dp);
  return zero ? `₹${text}` : `${neg ? "−" : "+"}₹${text}`;
}

/** "1 order", "2 orders", "1 second". Pass `plural` for irregular words. */
export function pluralize(n: number, singular: string, plural = `${singular}s`): string {
  return `${Number(n).toLocaleString("en-IN")} ${Number(n) === 1 ? singular : plural}`;
}

export const pct = (value: number, dp = 1): string => `${value.toLocaleString("en-IN", { maximumFractionDigits: dp })}%`;

const PLATFORM_NAMES: Record<string, string> = { zomato: "Zomato", swiggy: "Swiggy" };
/** Provider ids come from the API in any case; the UI always shows "Zomato" / "Swiggy". */
export function platformLabel(p: string | null | undefined): string {
  const key = String(p ?? "").toLowerCase();
  return PLATFORM_NAMES[key] ?? (key ? key[0].toUpperCase() + key.slice(1) : "Unknown");
}
