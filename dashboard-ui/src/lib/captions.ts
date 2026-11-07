export interface MealSlotDatum {
 slot: string;
 count: number;
 spend?: number;
}

export interface PlatformDatum {
 platform: string;
 spend: number;
}

export interface TopRestaurantDatum {
 name: string;
 count: number;
 total?: number;
}

export interface SpendTrendDatum {
 date: string;
 amount: number;
}

export interface DayTypeDatum {
 dayType: string;
 amount: number;
}

const MONTH_NAMES = [
 'January', 'February', 'March', 'April', 'May', 'June',
 'July', 'August', 'September', 'October', 'November', 'December',
];

function isFiniteNumber(value: unknown): value is number {
 return typeof value === 'number' && Number.isFinite(value);
}

/** Groups a run of digits the Indian way: 1234567 -> 12,34,567. */
function groupIndianDigits(digits: string): string {
 if (digits.length <= 3) return digits;
 const lastThree = digits.slice(-3);
 const rest = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
 return `${rest},${lastThree}`;
}

/** Formats a rupee amount without paise, e.g. 12450 -> ₹12,450. */
export function formatRupees(value: number): string {
 if (!isFiniteNumber(value)) return '';
 const sign = value < 0 ? '-' : '';
 return `${sign}₹${groupIndianDigits(String(Math.round(Math.abs(value))))}`;
}

function roundPercent(part: number, whole: number): number {
 return Math.round((part / whole) * 100);
}

/** Turns "late_night" into "Late night" while preserving brand casing. */
function humanize(raw: string): string {
 const text = raw.trim().replace(/[_-]+/g, ' ');
 if (!text) return '';
 return text.charAt(0).toUpperCase() + text.slice(1);
}

function pluralize(label: string): string {
 return /s$/i.test(label) ? label : `${label}s`;
}

/**
 * Returns the single largest positive entry, or null when there is no
 * positive entry or when the largest value is shared (a tie would make an
 * arbitrary winner misleading).
 */
function uniqueMax<T>(items: readonly T[], valueOf: (item: T) => number): T | null {
 let best: T | null = null;
 let bestValue = 0;
 let winners = 0;
 for (const item of items) {
  const value = valueOf(item);
  if (!isFiniteNumber(value) || value <= 0) continue;
  if (value > bestValue) {
   best = item;
   bestValue = value;
   winners = 1;
  } else if (value === bestValue) {
   winners += 1;
  }
 }
 return best !== null && winners === 1 ? best : null;
}

function sumValues(values: Iterable<number>): number {
 let total = 0;
 for (const value of values) total += value;
 return total;
}

function addTo(map: Map<string, number>, key: string, value: number): void {
 map.set(key, (map.get(key) ?? 0) + value);
}

/**
 * "Dinner accounts for 48% of orders"
 * Captions the meal slot with the most orders. Returns null for missing,
 * empty, all-zero or tied data so no wrong caption is rendered.
 */
export function computeMealSlotTakeaway(
 data: readonly MealSlotDatum[] | null | undefined,
): string | null {
 if (!data?.length) return null;
 const totals = new Map<string, number>();
 for (const row of data) {
  if (!row || !isFiniteNumber(row.count) || row.count <= 0) continue;
  const label = humanize(String(row.slot ?? ''));
  if (!label) continue;
  addTo(totals, label, row.count);
 }
 const total = sumValues(totals.values());
 if (total <= 0) return null;
 const winner = uniqueMax([...totals.entries()], ([, count]) => count);
 if (!winner) return null;
 const [label, count] = winner;
 return `${label} accounts for ${roundPercent(count, total)}% of orders`;
}

/**
 * "Swiggy represents 64% of total food spend"
 * Captions the platform with the largest spend. Returns null when spend is
 * missing, empty, all-zero or tied.
 */
export function computePlatformTakeaway(
 data: readonly PlatformDatum[] | null | undefined,
): string | null {
 if (!data?.length) return null;
 const totals = new Map<string, number>();
 for (const row of data) {
  if (!row || !isFiniteNumber(row.spend) || row.spend <= 0) continue;
  const label = humanize(String(row.platform ?? ''));
  if (!label) continue;
  addTo(totals, label, row.spend);
 }
 const total = sumValues(totals.values());
 if (total <= 0) return null;
 const winner = uniqueMax([...totals.entries()], ([, spend]) => spend);
 if (!winner) return null;
 const [label, spend] = winner;
 return `${label} represents ${roundPercent(spend, total)}% of total food spend`;
}

/**
 * "Top restaurant is Behrouz Biryani with 18 orders"
 * Captions the most ordered restaurant. Returns null when counts are missing,
 * empty, all-zero or tied.
 */
export function computeTopRestaurantTakeaway(
 data: readonly TopRestaurantDatum[] | null | undefined,
): string | null {
 if (!data?.length) return null;
 const totals = new Map<string, number>();
 for (const row of data) {
  if (!row || !isFiniteNumber(row.count) || row.count <= 0) continue;
  const label = String(row.name ?? '').trim();
  if (!label) continue;
  addTo(totals, label, row.count);
 }
 const total = sumValues(totals.values());
 if (total <= 0) return null;
 const winner = uniqueMax([...totals.entries()], ([, count]) => count);
 if (!winner) return null;
 const [label, count] = winner;
 const rounded = Math.round(count);
 return `Top restaurant is ${label} with ${rounded} ${rounded === 1 ? 'order' : 'orders'}`;
}

function monthOf(raw: string): { key: string; month: number } | null {
 const text = String(raw ?? '').trim();
 if (!text) return null;
 const match = /^(\d{4})-(\d{2})(?:-\d{2})?(?:$|[T\s])/.exec(text);
 if (match) {
  const month = Number(match[2]);
  if (month >= 1 && month <= 12) return { key: `${match[1]}-${match[2]}`, month: month - 1 };
 }
 const parsed = new Date(text);
 if (Number.isNaN(parsed.getTime())) return null;
 const month = parsed.getUTCMonth();
 return { key: `${parsed.getUTCFullYear()}-${String(month + 1).padStart(2, '0')}`, month };
}

/**
 * "Monthly spending peaked in October at ₹12,450"
 * Captions the highest-spend month. Returns null when dates or amounts are
 * missing, empty, all-zero or tied between months.
 */
export function computeSpendTrendTakeaway(
 data: readonly SpendTrendDatum[] | null | undefined,
): string | null {
 if (!data?.length) return null;
 const totals = new Map<string, { month: number; amount: number }>();
 for (const row of data) {
  if (!row || !isFiniteNumber(row.amount) || row.amount <= 0) continue;
  const month = monthOf(String(row.date ?? ''));
  if (!month) continue;
  const current = totals.get(month.key);
  totals.set(month.key, { month: month.month, amount: (current?.amount ?? 0) + row.amount });
 }
 const total = sumValues([...totals.values()].map(entry => entry.amount));
 if (total <= 0) return null;
 const winner = uniqueMax([...totals.values()], entry => entry.amount);
 if (!winner) return null;
 return `Monthly spending peaked in ${MONTH_NAMES[winner.month]} at ${formatRupees(winner.amount)}`;
}

function dayTypeLabel(raw: string): string {
 const text = raw.trim().toLowerCase();
 if (text === 'weekend' || text === 'weekends') return 'Weekends';
 if (text === 'weekday' || text === 'weekdays') return 'Weekdays';
 const label = humanize(text);
 return label ? pluralize(label) : '';
}

/**
 * "Weekends account for 55% of total spend"
 * Captions the day type with the largest spend. Returns null when spend is
 * missing, empty, all-zero or tied.
 */
export function computeDayTypeTakeaway(
 data: readonly DayTypeDatum[] | null | undefined,
): string | null {
 if (!data?.length) return null;
 const totals = new Map<string, number>();
 for (const row of data) {
  if (!row || !isFiniteNumber(row.amount) || row.amount <= 0) continue;
  const label = dayTypeLabel(String(row.dayType ?? ''));
  if (!label) continue;
  addTo(totals, label, row.amount);
 }
 const total = sumValues(totals.values());
 if (total <= 0) return null;
 const winner = uniqueMax([...totals.entries()], ([, amount]) => amount);
 if (!winner) return null;
 const [label, amount] = winner;
 return `${label} account for ${roundPercent(amount, total)}% of total spend`;
}
