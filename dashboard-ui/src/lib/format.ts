// One place for ledger-style figures. Indian digit grouping everywhere.
const grouped = (n: number, dp: number) =>
  Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: dp, maximumFractionDigits: dp });

/** ₹1,23,456 (dp=0) or ₹1,23,456.50 (dp=2). Negative values get a leading minus. */
export function inr(value: number | null | undefined, dp = 0): string {
  if (value == null || !Number.isFinite(Number(value))) return "–";
  const n = Number(value);
  return `${n < 0 ? "−" : ""}₹${grouped(n, dp)}`;
}

/** Always shows a sign: +₹120 / −₹120. Use for discounts, refunds and deltas. */
export function signedInr(value: number, dp = 2): string {
  return `${value < 0 ? "−" : "+"}₹${grouped(value, dp)}`;
}

/** "1 order", "2 orders". */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${Number(n).toLocaleString("en-IN")} ${Number(n) === 1 ? one : many}`;
}

export const pct = (value: number, dp = 1): string => `${value.toLocaleString("en-IN", { maximumFractionDigits: dp })}%`;

const PLATFORM_NAMES: Record<string, string> = { zomato: "Zomato", swiggy: "Swiggy" };
/** Provider ids come from the API in any case; the UI always shows "Zomato" / "Swiggy". */
export function platformLabel(p: string | null | undefined): string {
  const key = String(p ?? "").toLowerCase();
  return PLATFORM_NAMES[key] ?? (key ? key[0].toUpperCase() + key.slice(1) : "Unknown");
}
