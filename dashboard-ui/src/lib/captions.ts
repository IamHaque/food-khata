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

export interface WaterfallStepLike {
 label: string;
 amount: number;
 baseline?: number;
 height?: number;
 direction?: 'up' | 'down' | 'total' | string;
}

export interface CostWaterfallLike {
 subtotal?: number;
 food_discount?: number;
 net_delivery?: number;
 packaging?: number;
 platform?: number;
 tax?: number;
 tip?: number;
 other?: number;
 residual?: number;
 provider_paid?: number;
 refunds?: number;
}

/**
 * "Discounts saved ₹1,200 (15%) while fees added ₹450 (6%) to item subtotal"
 * Captions the net effect of discounts and fees relative to subtotal.
 * Returns null for missing, empty, zero, invalid or tied data so no misleading caption is shown.
 */
export function computeBillWaterfallTakeaway(
 steps?: readonly WaterfallStepLike[] | null,
 costWaterfall?: CostWaterfallLike | null,
): string | null {
 let subtotal = 0;
 let discounts = 0;
 let fees = 0;
 let paid = 0;

 if (costWaterfall && typeof costWaterfall === 'object') {
  if (isFiniteNumber(costWaterfall.subtotal) && costWaterfall.subtotal > 0) {
   subtotal = costWaterfall.subtotal;
  }
  if (isFiniteNumber(costWaterfall.food_discount)) {
   discounts = Math.abs(costWaterfall.food_discount);
  }
  const feeItems = [
   costWaterfall.net_delivery,
   costWaterfall.packaging,
   costWaterfall.platform,
   costWaterfall.tax,
   costWaterfall.tip,
   costWaterfall.other,
  ];
  for (const f of feeItems) {
   if (isFiniteNumber(f) && f > 0) {
    fees += f;
   }
  }
  if (isFiniteNumber(costWaterfall.provider_paid) && costWaterfall.provider_paid > 0) {
   paid = costWaterfall.provider_paid;
  }
 }

 if (steps && steps.length > 0) {
  if (subtotal <= 0) {
   const subStep = steps.find(
    s =>
     s &&
     (s.label.toLowerCase().includes('subtotal') || s.label.toLowerCase().includes('item')),
   );
   if (subStep && isFiniteNumber(subStep.amount) && subStep.amount > 0) {
    subtotal = subStep.amount;
   }
  }
  if (discounts <= 0) {
   for (const s of steps) {
    if (!s) continue;
    if (s.direction === 'down' || s.label.toLowerCase().includes('discount')) {
     if (isFiniteNumber(s.amount)) {
      discounts += Math.abs(s.amount);
     }
    }
   }
  }
  if (fees <= 0) {
   for (const s of steps) {
    if (!s) continue;
    const l = s.label.toLowerCase();
    if (
     s.direction === 'up' &&
     !l.includes('subtotal') &&
     !l.includes('item') &&
     !l.includes('final') &&
     !l.includes('paid')
    ) {
     if (isFiniteNumber(s.amount) && s.amount > 0) {
      fees += s.amount;
     }
    }
   }
  }
  if (paid <= 0) {
   const totalStep = steps.find(
    s => s && (s.direction === 'total' || s.label.toLowerCase().includes('final')),
   );
   if (totalStep && isFiniteNumber(totalStep.amount) && totalStep.amount > 0) {
    paid = totalStep.amount;
   }
  }
 }

 if (subtotal <= 0 && paid <= 0 && discounts <= 0 && fees <= 0) {
  return null;
 }

 if (subtotal > 0) {
  const discountPct = roundPercent(discounts, subtotal);
  const feesPct = roundPercent(fees, subtotal);

  if (discounts > 0 && fees > 0) {
   return `Discounts saved ${formatRupees(discounts)} (${discountPct}%) while fees added ${formatRupees(fees)} (${feesPct}%) to item subtotal`;
  }
  if (discounts > 0) {
   return `Discounts saved ${formatRupees(discounts)} (${discountPct}%) on item subtotal`;
  }
  if (fees > 0) {
   return `Fees and taxes added ${formatRupees(fees)} (${feesPct}%) to item subtotal`;
  }
  if (paid > 0) {
   return `Final paid equals item subtotal at ${formatRupees(paid)}`;
  }
 }

 if (paid > 0) {
  return `Final paid total is ${formatRupees(paid)}`;
 }

 return null;
}


export interface DiscountItemLike {
  label?: string;
  amount?: number;
}

/**
 * "Food discounts represent 68% of total savings (₹4,200)"
 * Captions the discount type with the largest savings.
 * Returns null for missing, empty, all-zero or tied data.
 */
export function computeDiscountBreakdownTakeaway(
  data: readonly DiscountItemLike[] | null | undefined,
): string | null {
  if (!data?.length) return null;
  const totals = new Map<string, number>();
  const displayNames = new Map<string, string>();
  for (const row of data) {
    if (!row || !isFiniteNumber(row.amount) || row.amount <= 0) continue;
    const rawLabel = String(row.label ?? '').trim();
    if (!rawLabel) continue;
    const humanized = humanize(rawLabel);
    const key = humanized.toLowerCase();
    if (!displayNames.has(key)) {
      displayNames.set(key, humanized);
    }
    addTo(totals, key, row.amount);
  }
  const total = sumValues(totals.values());
  if (total <= 0) return null;
  const winner = uniqueMax([...totals.entries()], ([, amount]) => amount);
  if (!winner) return null;
  const [key, amount] = winner;
  const label = displayNames.get(key) || key;
  const pluralLabel = pluralize(label);
  return `${pluralLabel} represent ${roundPercent(amount, total)}% of total savings (${formatRupees(amount)})`;
}

export interface YearOverYearDatum {
  year: number;
  month: number;
  spend: number;
}

/**
 * "2025 spend exceeded 2024 by ₹14,200 across comparable months"
 * Captions the spend comparison between the two most recent years across overlapping months.
 * Returns null when there are fewer than 2 distinct years, no overlapping months,
 * or when spend is zero or invalid.
 */
export function computeYearOverYearTakeaway(
  data: readonly YearOverYearDatum[] | null | undefined,
): string | null {
  if (!data?.length) return null;

  const validEntries = data.filter(
    (d) =>
      d &&
      isFiniteNumber(d.year) &&
      isFiniteNumber(d.month) &&
      d.month >= 1 &&
      d.month <= 12 &&
      isFiniteNumber(d.spend) &&
      d.spend >= 0
  );

  const distinctYears = Array.from(new Set(validEntries.map((d) => d.year))).sort(
    (a, b) => a - b
  );

  if (distinctYears.length < 2) return null;

  const latestYear = distinctYears[distinctYears.length - 1];
  const priorYear = distinctYears[distinctYears.length - 2];

  const latestMonthMap = new Map<number, number>();
  const priorMonthMap = new Map<number, number>();

  for (const d of validEntries) {
    if (d.year === latestYear) {
      latestMonthMap.set(d.month, (latestMonthMap.get(d.month) ?? 0) + d.spend);
    } else if (d.year === priorYear) {
      priorMonthMap.set(d.month, (priorMonthMap.get(d.month) ?? 0) + d.spend);
    }
  }

  const comparableMonths = Array.from(latestMonthMap.keys()).filter((m) =>
    priorMonthMap.has(m)
  );

  if (comparableMonths.length === 0) return null;

  let sumLatest = 0;
  let sumPrior = 0;

  for (const m of comparableMonths) {
    sumLatest += latestMonthMap.get(m)!;
    sumPrior += priorMonthMap.get(m)!;
  }

  if (sumLatest === 0 && sumPrior === 0) return null;

  const diff = sumLatest - sumPrior;

  if (diff > 0) {
    return `${latestYear} spend exceeded ${priorYear} by ${formatRupees(diff)} across comparable months`;
  }
  if (diff < 0) {
    return `${latestYear} spend was ${formatRupees(Math.abs(diff))} lower than ${priorYear} across comparable months`;
  }
  return `${latestYear} spend matched ${priorYear} across comparable months`;
}

export interface FeeComponentItemLike {
  month?: string | null;
  net_delivery?: number;
  delivery?: number;
  delivery_fee?: number;
  packaging?: number;
  packaging_fee?: number;
  platform?: number;
  platform_fee?: number;
  tax?: number;
  taxes?: number;
  total_fees?: number;
  order_count?: number;
  label?: string;
  name?: string;
  component?: string;
  type?: string;
  amount?: number;
  value?: number;
  spend?: number;
}

/**
 * "Platform fees represent 38% of total fees (₹1,850)"
 * Captions the dominant fee type across active months.
 * Returns null for missing, empty, all-zero, negative, or tied data.
 */
export function computeFeeComponentsTakeaway(
  data: readonly FeeComponentItemLike[] | null | undefined,
): string | null {
  if (!data?.length) return null;

  const totals = new Map<string, number>([
    ["Platform fees", 0],
    ["Delivery fees", 0],
    ["Packaging fees", 0],
    ["Taxes", 0],
  ]);

  for (const row of data) {
    if (!row) continue;

    const netDelivery = row.net_delivery ?? row.delivery ?? row.delivery_fee;
    if (isFiniteNumber(netDelivery) && netDelivery > 0) {
      addTo(totals, "Delivery fees", netDelivery);
    }

    const packaging = row.packaging ?? row.packaging_fee;
    if (isFiniteNumber(packaging) && packaging > 0) {
      addTo(totals, "Packaging fees", packaging);
    }

    const platform = row.platform ?? row.platform_fee;
    if (isFiniteNumber(platform) && platform > 0) {
      addTo(totals, "Platform fees", platform);
    }

    const tax = row.tax ?? row.taxes;
    if (isFiniteNumber(tax) && tax > 0) {
      addTo(totals, "Taxes", tax);
    }

    const rawLabel = String(row.label ?? row.name ?? row.component ?? row.type ?? "")
      .trim()
      .toLowerCase();
    const amount = row.amount ?? row.value ?? row.spend;
    if (rawLabel && isFiniteNumber(amount) && amount > 0) {
      if (rawLabel.includes("platform")) {
        addTo(totals, "Platform fees", amount);
      } else if (rawLabel.includes("deliver")) {
        addTo(totals, "Delivery fees", amount);
      } else if (rawLabel.includes("packag")) {
        addTo(totals, "Packaging fees", amount);
      } else if (rawLabel.includes("tax")) {
        addTo(totals, "Taxes", amount);
      } else {
        const customLabel = pluralize(humanize(rawLabel));
        addTo(totals, customLabel, amount);
      }
    }
  }

  const total = sumValues(totals.values());
  if (total <= 0) return null;

  const winner = uniqueMax([...totals.entries()], ([, amount]) => amount);
  if (!winner) return null;

  const [label, amount] = winner;
  return `${label} represent ${roundPercent(amount, total)}% of total fees (${formatRupees(amount)})`;
}

export interface FeeScatterItemLike {
  amount?: number | null;
  fees?: number | null;
  fee_percent?: number | null;
  order_id?: string | number | null;
}

/**
 * "Average fee burden is 14% of order value"
 * Captions the average fee burden relative to order value across orders.
 * Returns null for missing, empty, all-zero, negative, or invalid data.
 */
export function computeFeeScatterTakeaway(
  data: readonly FeeScatterItemLike[] | null | undefined
): string | null {
  if (!data?.length) return null;

  let totalAmount = 0;
  let totalFees = 0;
  let feePercentSum = 0;
  let validCount = 0;
  let hasValidFees = false;

  for (const item of data) {
    if (!item) continue;
    const amount = item.amount;
    const feePercent = item.fee_percent;
    const fees = item.fees;

    if (!isFiniteNumber(amount) || amount <= 0) continue;
    if (!isFiniteNumber(feePercent) || feePercent < 0) continue;

    feePercentSum += feePercent;
    validCount++;
    totalAmount += amount;

    if (isFiniteNumber(fees) && fees >= 0) {
      totalFees += fees;
      hasValidFees = true;
    }
  }

  if (validCount === 0 || totalAmount <= 0) return null;

  // All-zero fee data
  if (feePercentSum === 0 && (!hasValidFees || totalFees === 0)) {
    return null;
  }

  const avgFeePercent = hasValidFees && totalFees > 0
    ? Math.round((totalFees / totalAmount) * 100)
    : Math.round(feePercentSum / validCount);

  if (avgFeePercent <= 0 && feePercentSum <= 0 && (!hasValidFees || totalFees === 0)) {
    return null;
  }

  const displayPct = avgFeePercent === 0 ? "<1" : String(avgFeePercent);
  return `Average fee burden is ${displayPct}% of order value`;
}

export interface CumulativeSpendDatumLike {
  month?: string | null;
  date?: string | null;
  spend?: number | null;
  amount?: number | null;
  orders?: number | null;
}

/**
 * "Total spend reached ₹1,45,000 across 18 months, crossing 14 milestones"
 * Captions cumulative spend total, active month count, and round milestone thresholds crossed.
 * Returns null for missing, empty, all-zero, or non-positive spend data.
 */
export function computeCumulativeSpendTakeaway(
  data: readonly CumulativeSpendDatumLike[] | null | undefined,
  milestoneStep = 10000,
): string | null {
  if (!data?.length) return null;

  let totalSpend = 0;
  const uniqueMonths = new Set<string>();
  let unlabelledCount = 0;

  for (const row of data) {
    if (!row) continue;
    const spend = row.spend ?? row.amount;
    if (!isFiniteNumber(spend) || spend < 0) continue;
    totalSpend += spend;
    const key = String(row.month ?? row.date ?? "").trim();
    if (key) {
      uniqueMonths.add(key);
    } else {
      unlabelledCount++;
    }
  }

  const validMonthsCount = uniqueMonths.size > 0 ? uniqueMonths.size + unlabelledCount : unlabelledCount;
  if (validMonthsCount === 0 || totalSpend <= 0) return null;

  const milestoneCount = milestoneStep > 0 ? Math.floor(totalSpend / milestoneStep) : 0;
  const monthWord = validMonthsCount === 1 ? "month" : "months";
  const milestoneWord = milestoneCount === 1 ? "milestone" : "milestones";

  return `Total spend reached ${formatRupees(totalSpend)} across ${validMonthsCount} ${monthWord}, crossing ${milestoneCount} ${milestoneWord}`;
}

export interface OrderValueDatumLike {
  final_amount_paid?: number | null;
  amount?: number | null;
  spend?: number | null;
}

/**
 * "Median order value is ₹320; 64% of orders are under ₹500"
 * Captions order value distribution with median value and percentage of orders under a threshold.
 * Returns null for missing, empty, all-zero, or non-positive order data.
 */
export function computeOrderValueDistributionTakeaway(
  values?: readonly (number | OrderValueDatumLike | null | undefined)[] | null,
  threshold = 500,
): string | null {
  if (!values?.length) return null;

  const numbers: number[] = [];
  for (const item of values) {
    if (item === null || item === undefined) continue;
    const val = typeof item === "number" ? item : (item.final_amount_paid ?? item.amount ?? item.spend);
    if (isFiniteNumber(val) && val > 0) {
      numbers.push(val);
    }
  }

  if (numbers.length === 0) return null;

  numbers.sort((a, b) => a - b);
  const count = numbers.length;
  const median = count % 2 === 1
    ? numbers[Math.floor(count / 2)]
    : (numbers[count / 2 - 1] + numbers[count / 2]) / 2;

  const effectiveThreshold = isFiniteNumber(threshold) && threshold > 0 ? threshold : 500;
  const underCount = numbers.filter((v) => v < effectiveThreshold).length;
  const pct = Math.round((underCount / count) * 100);

  return `Median order value is ${formatRupees(Math.round(median))}; ${pct}% of orders are under ${formatRupees(effectiveThreshold)}`;
}

export interface DailySpendDatumLike {
  date?: string | null;
  spend?: number | null;
  amount?: number | null;
  orders?: number | null;
  cumulative?: number | null;
  rolling_30?: number | null;
}

/**
 * "Highest daily spend in 2025 was ₹3,450 on 2025-10-24" (or across all dates when year is not specified)
 * Captions the date with the highest daily spend.
 * Returns null for missing, empty, all-zero, or non-positive spend data.
 */
export function computeDailySpendTakeaway(
  data?: readonly (DailySpendDatumLike | null | undefined)[] | null,
  year?: string | number | null,
): string | null {
  if (!data?.length) return null;

  const yearStr = year != null && String(year).trim() !== "" ? String(year).trim() : null;

  let peakDay: { date: string; spend: number } | null = null;
  let totalSpend = 0;

  for (const item of data) {
    if (!item) continue;
    const date = item.date ? String(item.date).trim() : "";
    if (!date) continue;
    if (yearStr && !date.startsWith(yearStr)) continue;

    const rawSpend = item.spend ?? item.amount;
    if (!isFiniteNumber(rawSpend) || rawSpend <= 0) continue;

    totalSpend += rawSpend;
    if (!peakDay || rawSpend > peakDay.spend) {
      peakDay = { date, spend: rawSpend };
    }
  }

  if (!peakDay || totalSpend <= 0) return null;

  if (yearStr) {
    return `Highest daily spend in ${yearStr} was ${formatRupees(peakDay.spend)} on ${peakDay.date}`;
  }
  return `Highest daily spend was ${formatRupees(peakDay.spend)} on ${peakDay.date}`;
}

export interface CuisineDatumLike {
  name?: string | null;
  spend?: number | null;
  orders?: number | null;
  value?: number | null;
  amount?: number | null;
}

/**
 * "North Indian accounts for 42% of food spend"
 * Captions the cuisine with the largest spend and its percentage share of food spend.
 * Returns null for missing, empty, all-zero, or non-positive spend data.
 */
export function computeCuisineTakeaway(
  data?: readonly (CuisineDatumLike | null | undefined)[] | null,
): string | null {
  if (!data?.length) return null;

  const totals = new Map<string, number>();
  for (const row of data) {
    if (!row) continue;
    const spend = row.spend ?? row.value ?? row.amount;
    if (!isFiniteNumber(spend) || spend <= 0) continue;
    const label = String(row.name ?? "").trim();
    if (!label) continue;
    addTo(totals, label, spend);
  }

  const total = sumValues(totals.values());
  if (total <= 0) return null;

  const winner = uniqueMax([...totals.entries()], ([, spend]) => spend);
  if (!winner) return null;

  const [label, spend] = winner;
  return `${label} accounts for ${roundPercent(spend, total)}% of food spend`;
}

export interface NewVsRepeatDatumLike {
  month?: string | null;
  new_orders?: number | null;
  repeat_orders?: number | null;
  newOrders?: number | null;
  repeatOrders?: number | null;
  orders?: number | null;
}

/**
 * "Repeat orders account for 68% of orders overall"
 * Captions overall repeat restaurant orders share versus first-time discoveries.
 * Returns null for missing, empty, or all-zero order data.
 */
export function computeNewVsRepeatTakeaway(
  data?: readonly (NewVsRepeatDatumLike | null | undefined)[] | null,
): string | null {
  if (!data?.length) return null;

  let totalNew = 0;
  let totalRepeat = 0;
  let hasValid = false;

  for (const row of data) {
    if (!row) continue;
    const newCount = row.new_orders ?? row.newOrders ?? 0;
    const repeatCount = row.repeat_orders ?? row.repeatOrders ?? 0;
    if (isFiniteNumber(newCount) && newCount >= 0) {
      totalNew += newCount;
      hasValid = true;
    }
    if (isFiniteNumber(repeatCount) && repeatCount >= 0) {
      totalRepeat += repeatCount;
      hasValid = true;
    }
  }

  const total = totalNew + totalRepeat;
  if (!hasValid || total <= 0) return null;

  const repeatPercent = Math.round((totalRepeat / total) * 100);
  return `Repeat orders account for ${repeatPercent}% of orders overall`;
}

export interface LoyaltyParetoDatumLike {
  key?: string | null;
  name?: string | null;
  orders?: number | null;
  count?: number | null;
  spend?: number | null;
  aov?: number | null;
}

/**
 * "Top 4 restaurants account for 80% of all orders"
 * Captions restaurant concentration using the Pareto principle (cumulative 80% order threshold).
 * Returns null for missing, empty, or all-zero order data.
 */
export function computeLoyaltyParetoTakeaway(
  data?: readonly (LoyaltyParetoDatumLike | null | undefined)[] | null,
): string | null {
  if (!data?.length) return null;

  const totals = new Map<string, number>();
  for (const item of data) {
    if (!item) continue;
    const orders = item.orders ?? item.count;
    if (!isFiniteNumber(orders) || orders <= 0) continue;
    const name = String(item.name ?? item.key ?? "").trim();
    if (!name) continue;
    totals.set(name, (totals.get(name) ?? 0) + orders);
  }

  const totalOrders = sumValues(totals.values());
  if (totals.size === 0 || totalOrders <= 0) return null;

  const valid = [...totals.entries()].map(([name, orders]) => ({ name, orders }));
  valid.sort((a, b) => b.orders - a.orders);

  let cumOrders = 0;
  let countFor80 = 0;
  for (let i = 0; i < valid.length; i++) {
    cumOrders += valid[i].orders;
    countFor80 = i + 1;
    if (cumOrders >= 0.8 * totalOrders) {
      break;
    }
  }

  const actualPercent = Math.round((cumOrders / totalOrders) * 100);

  if (countFor80 === 1) {
    return `Top restaurant accounts for ${actualPercent}% of all orders`;
  }
  return `Top ${countFor80} restaurants account for ${actualPercent}% of all orders`;
}

export interface DietDatumLike {
  diet?: string | null;
  item_lines?: number | null;
  quantity?: number | null;
  line_total?: number | null;
}

/**
 * "Veg items represent 72% of total order quantity"
 * Captions the diet category with the largest quantity.
 * Returns null for missing, empty, all-zero, or tied data.
 */
export function computeDietTakeaway(
  data?: readonly (DietDatumLike | null | undefined)[] | null,
): string | null {
  if (!data?.length) return null;

  const totals = new Map<string, number>();
  for (const item of data) {
    if (!item) continue;
    const quantity = item.quantity ?? item.item_lines;
    if (!isFiniteNumber(quantity) || quantity <= 0) continue;
    const rawDiet = String(item.diet ?? "").trim();
    if (!rawDiet) continue;
    const norm = rawDiet.toLowerCase().replace(/[_\s-]+/g, "");
    let label = rawDiet;
    if (norm === "veg") label = "Veg";
    else if (norm === "nonveg") label = "Non-veg";
    else if (norm === "unknown") label = "Unknown";
    else label = humanize(rawDiet);

    addTo(totals, label, quantity);
  }

  const totalQuantity = sumValues(totals.values());
  if (totals.size === 0 || totalQuantity <= 0) return null;

  const winner = uniqueMax([...totals.entries()], ([, q]) => q);
  if (!winner) return null;

  const [label, quantity] = winner;
  const percent = roundPercent(quantity, totalQuantity);
  return `${label} items represent ${percent}% of total order quantity`;
}

export type DishRankingMetric = "quantity" | "amount";

export interface DishRankingDatumLike {
  key?: string | null;
  name?: string | null;
  quantity?: number | null;
  count?: number | null;
  qty?: number | null;
  amount?: number | null;
  spend?: number | null;
  total?: number | null;
  value?: number | null;
}

/**
 * "Top dish is Chicken Biryani with 28 orders (₹6,800)"
 * Captions the highest-volume or highest-expenditure dish.
 * Returns null for missing, empty, all-zero, or tied data.
 */
export function computeDishRankingTakeaway(
  data?: readonly (DishRankingDatumLike | null | undefined)[] | null,
  metric: DishRankingMetric = "quantity",
): string | null {
  if (!data?.length) return null;

  const totals = new Map<string, { name: string; quantity: number; amount: number }>();
  for (const item of data) {
    if (!item) continue;
    const name = String(item.name ?? item.key ?? "").trim();
    if (!name) continue;
    const qty = item.quantity ?? item.count ?? item.qty ?? 0;
    const quantity = isFiniteNumber(qty) && qty > 0 ? qty : 0;
    const amt = item.amount ?? item.spend ?? item.total ?? item.value ?? 0;
    const amount = isFiniteNumber(amt) && amt > 0 ? amt : 0;

    const existing = totals.get(name);
    if (existing) {
      existing.quantity += quantity;
      existing.amount += amount;
    } else {
      totals.set(name, { name, quantity, amount });
    }
  }

  if (totals.size === 0) return null;

  const rows = [...totals.values()];
  const isAmount = metric === "amount";

  const totalPrimary = rows.reduce(
    (acc, r) => acc + (isAmount ? r.amount : r.quantity),
    0,
  );
  if (totalPrimary <= 0) return null;

  const winner = uniqueMax(rows, (r) => (isAmount ? r.amount : r.quantity));
  if (!winner) return null;

  const dishName = winner.name;
  const roundedQty = Math.round(winner.quantity);
  const roundedAmt = Math.round(winner.amount);

  if (!isAmount) {
    const qtyText = `${roundedQty} ${roundedQty === 1 ? "order" : "orders"}`;
    const amtText = roundedAmt > 0 ? ` (${formatRupees(roundedAmt)})` : "";
    return `Top dish is ${dishName} with ${qtyText}${amtText}`;
  } else {
    const amtText = formatRupees(roundedAmt);
    const qtyText = roundedQty > 0 ? ` (${roundedQty} ${roundedQty === 1 ? "order" : "orders"})` : "";
    return `Top dish is ${dishName} with ${amtText}${qtyText}`;
  }
}

export interface HourWeekdayDatum {
  key?: string | number | null;
  orders?: number | null;
  spend?: number | null;
  count?: number | null;
  amount?: number | null;
}

/**
 * "Peak ordering is Friday at 20:00 with 15 orders"
 * Captions the day and hour with the most orders. Returns null for missing,
 * empty, all-zero, or tied data.
 */
export function computeHourWeekdayTakeaway(
  data?: readonly (HourWeekdayDatum | null | undefined)[] | null,
): string | null {
  if (!data?.length) return null;

  interface CellAgg {
    weekday: number;
    hour: number;
    orders: number;
    spend: number;
  }

  const cells = new Map<number, CellAgg>();
  let totalOrders = 0;

  for (const row of data) {
    if (!row) continue;
    const rawKey = row.key;
    if (rawKey == null || rawKey === "") continue;
    const keyNum = typeof rawKey === "number" ? rawKey : parseInt(String(rawKey), 10);
    if (!isFiniteNumber(keyNum) || keyNum < 0 || keyNum >= 168) continue;

    const weekday = Math.floor(keyNum / 24);
    const hour = keyNum % 24;
    const orders = Number(row.orders ?? row.count ?? 0);
    const spend = Number(row.spend ?? row.amount ?? 0);

    if (!isFiniteNumber(orders) || orders <= 0) continue;

    const existing = cells.get(keyNum);
    if (existing) {
      existing.orders += orders;
      existing.spend += spend;
    } else {
      cells.set(keyNum, { weekday, hour, orders, spend });
    }
    totalOrders += orders;
  }

  if (totalOrders <= 0 || cells.size === 0) return null;

  const winner = uniqueMax([...cells.values()], (c) => c.orders);
  if (!winner) return null;

  const dayNames = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];
  const dayName = dayNames[winner.weekday] ?? "Unknown";
  const hourFormatted = `${String(winner.hour).padStart(2, "0")}:00`;
  const orderCountText = `${winner.orders} ${winner.orders === 1 ? "order" : "orders"}`;

  return `Peak ordering is ${dayName} at ${hourFormatted} with ${orderCountText}`;
}

export interface MealSlotItemLike {
  key?: string | null;
  slot?: string | null;
  orders?: number | null;
  count?: number | null;
  spend?: number | null;
  amount?: number | null;
}

const CANONICAL_MEAL_LABELS: Record<string, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  snack: "Snack",
  dinner: "Dinner",
  late_night: "Late night",
};

/**
 * "Dinner is your most frequent meal slot with 45 orders (₹18,500)"
 * Captions the meal slot with the most orders along with total spend formatted in rupees.
 * Returns null for missing, empty, all-zero, or tied data.
 */
export function computeMealSlotsTakeaway(
  data?: readonly (MealSlotItemLike | null | undefined)[] | null,
): string | null {
  if (!data?.length) return null;

  const totals = new Map<string, { orders: number; spend: number }>();

  for (const row of data) {
    if (!row) continue;
    const rawKey = row.key ?? row.slot;
    if (rawKey == null || rawKey === "") continue;
    const orders = Number(row.orders ?? row.count ?? 0);
    const spend = Number(row.spend ?? row.amount ?? 0);
    if (!isFiniteNumber(orders) || orders <= 0) continue;

    const key = String(rawKey).trim().toLowerCase().replace(/[\s-]+/g, "_");
    const existing = totals.get(key);
    if (existing) {
      existing.orders += orders;
      existing.spend += isFiniteNumber(spend) ? spend : 0;
    } else {
      totals.set(key, {
        orders,
        spend: isFiniteNumber(spend) ? spend : 0,
      });
    }
  }

  if (totals.size === 0) return null;

  const winner = uniqueMax([...totals.entries()], ([, stat]) => stat.orders);
  if (!winner) return null;

  const [slotKey, { orders, spend }] = winner;
  const label = CANONICAL_MEAL_LABELS[slotKey] ?? humanize(slotKey);
  const orderText = `${orders.toLocaleString("en-IN")} ${orders === 1 ? "order" : "orders"}`;

  if (spend > 0) {
    return `${label} is your most frequent meal slot with ${orderText} (${formatRupees(spend)})`;
  }
  return `${label} is your most frequent meal slot with ${orderText}`;
}

export interface WeekdayItemLike {
  key?: string | number | null;
  day?: string | number | null;
  weekday?: string | number | null;
  orders?: number | null;
  count?: number | null;
  spend?: number | null;
  amount?: number | null;
  isWeekend?: boolean | null;
}

const WEEKDAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

const WEEKDAY_LOOKUP: Record<string, number> = {
  mon: 0,
  monday: 0,
  tue: 1,
  tues: 1,
  tuesday: 1,
  wed: 2,
  wednesday: 2,
  thu: 3,
  thur: 3,
  thurs: 3,
  thursday: 3,
  fri: 4,
  friday: 4,
  sat: 5,
  saturday: 5,
  sun: 6,
  sunday: 6,
};

/**
 * "Sunday is your busiest day with 24 orders (₹9,200); weekends account for 38% of total orders"
 * Captions the day with the most orders along with spend and weekend share.
 * Returns null for missing, empty, all-zero, or tied data.
 */
export function computeWeekdayTakeaway(
  data?: readonly (WeekdayItemLike | null | undefined)[] | null,
): string | null {
  if (!data?.length) return null;

  const days = Array.from({ length: 7 }, (_, i) => ({
    weekday: i,
    orders: 0,
    spend: 0,
  }));

  let hasValidRow = false;

  for (const row of data) {
    if (!row) continue;
    let w: number | undefined;

    if (typeof row.weekday === "number" && row.weekday >= 0 && row.weekday <= 6) {
      w = Math.floor(row.weekday);
    } else if (typeof row.weekday === "string") {
      const lower = row.weekday.trim().toLowerCase();
      if (lower in WEEKDAY_LOOKUP) {
        w = WEEKDAY_LOOKUP[lower];
      } else {
        const n = parseInt(lower, 10);
        if (Number.isFinite(n) && n >= 0 && n <= 6) w = n;
      }
    } else if (typeof row.day === "string") {
      const lower = row.day.trim().toLowerCase();
      if (lower in WEEKDAY_LOOKUP) {
        w = WEEKDAY_LOOKUP[lower];
      } else {
        const n = parseInt(lower, 10);
        if (Number.isFinite(n) && n >= 0 && n <= 6) w = n;
      }
    } else if (typeof row.day === "number" && row.day >= 0 && row.day <= 6) {
      w = Math.floor(row.day);
    } else if (row.key != null && row.key !== "") {
      const keyStr = String(row.key).trim().toLowerCase();
      if (keyStr in WEEKDAY_LOOKUP) {
        w = WEEKDAY_LOOKUP[keyStr];
      } else {
        const keyNum = typeof row.key === "number" ? row.key : parseInt(keyStr, 10);
        if (Number.isFinite(keyNum)) {
          if (keyNum >= 0 && keyNum < 7) {
            w = keyNum;
          } else if (keyNum >= 7 && keyNum < 168) {
            w = Math.floor(keyNum / 24);
          }
        }
      }
    }

    if (w === undefined || w < 0 || w > 6) continue;

    const orders = Number(row.orders ?? row.count ?? 0);
    const spend = Number(row.spend ?? row.amount ?? 0);

    if (isFiniteNumber(orders) && orders > 0) {
      days[w].orders += orders;
      hasValidRow = true;
    }
    if (isFiniteNumber(spend) && spend > 0) {
      days[w].spend += spend;
    }
  }

  if (!hasValidRow) return null;

  const totalOrders = sumValues(days.map((d) => d.orders));
  if (totalOrders <= 0) return null;

  const winner = uniqueMax(days, (d) => d.orders);
  if (!winner) return null;

  const dayName = WEEKDAY_NAMES[winner.weekday] ?? "Unknown";
  const orderText = `${winner.orders.toLocaleString("en-IN")} ${
    winner.orders === 1 ? "order" : "orders"
  }`;
  const spendText = winner.spend > 0 ? ` (${formatRupees(winner.spend)})` : "";
  const weekendOrders = days[5].orders + days[6].orders;
  const weekendPct = roundPercent(weekendOrders, totalOrders);

  return `${dayName} is your busiest day with ${orderText}${spendText}; weekends account for ${weekendPct}% of total orders`;
}

export interface OrderGapItemLike {
  days?: number | null;
  orders?: number | null;
  count?: number | null;
}

/**
 * Calculates the weighted median of elapsed days across all order intervals.
 * Returns null if no valid gaps or total intervals is 0.
 */
export function computeWeightedMedianGap(
  gaps?: readonly (OrderGapItemLike | null | undefined)[] | null,
): number | null {
  if (!gaps || gaps.length === 0) return null;

  const valid: Array<{ days: number; count: number }> = [];
  let totalCount = 0;

  for (const item of gaps) {
    if (!item) continue;
    const days = item.days;
    const count = item.orders ?? item.count;
    if (
      isFiniteNumber(days) &&
      days >= 0 &&
      isFiniteNumber(count) &&
      count > 0
    ) {
      valid.push({ days: Math.round(days), count });
      totalCount += count;
    }
  }

  if (totalCount === 0 || valid.length === 0) return null;

  valid.sort((a, b) => a.days - b.days);

  const target1 = Math.floor((totalCount - 1) / 2);
  const target2 = Math.floor(totalCount / 2);

  let cumulative = 0;
  let val1: number | null = null;
  let val2: number | null = null;

  for (const item of valid) {
    const prev = cumulative;
    cumulative += item.count;
    if (val1 === null && prev <= target1 && target1 < cumulative) {
      val1 = item.days;
    }
    if (val2 === null && prev <= target2 && target2 < cumulative) {
      val2 = item.days;
    }
    if (val1 !== null && val2 !== null) break;
  }

  if (val1 === null || val2 === null) return null;
  const median = (val1 + val2) / 2;
  return Math.round(median * 10) / 10;
}

/**
 * S-063: Computes takeaway caption for gap between orders histogram.
 * e.g. "Median gap between orders is 2 days (longest gap: 14 days; 62% of orders placed within 3 days)"
 */
export function computeOrderGapsTakeaway(
  gaps?: readonly (OrderGapItemLike | null | undefined)[] | null,
  longest_gap?: number | null,
): string | null {
  if (!gaps || gaps.length === 0) return null;

  const median = computeWeightedMedianGap(gaps);
  if (median === null) return null;

  let totalCount = 0;
  let within3Count = 0;
  let maxDays = 0;

  for (const item of gaps) {
    if (!item) continue;
    const days = item.days;
    const count = item.orders ?? item.count;
    if (
      isFiniteNumber(days) &&
      days >= 0 &&
      isFiniteNumber(count) &&
      count > 0
    ) {
      totalCount += count;
      if (days <= 3) {
        within3Count += count;
      }
      if (days > maxDays) {
        maxDays = days;
      }
    }
  }

  if (totalCount === 0) return null;

  const effectiveLongest =
    isFiniteNumber(longest_gap) && longest_gap >= 0 ? longest_gap : maxDays;

  const medianStr = median === 1 ? "1 day" : `${median} days`;
  const longestStr = effectiveLongest === 1 ? "1 day" : `${effectiveLongest} days`;
  const within3Pct = Math.round((within3Count / totalCount) * 100);

  return `Median gap between orders is ${medianStr} (longest gap: ${longestStr}; ${within3Pct}% of orders placed within 3 days)`;
}

export interface DestinationLabelLike {
  label?: string | null;
  city?: string | null;
  orders?: number | null;
  spend?: number | null;
  fee?: number | null;
}

/**
 * S-064: Dynamic takeaway caption for delivery destinations ranking.
 * e.g. "Top destination is Home (Bangalore) with ₹18,400 across 32 orders (48% of total spend)"
 * Returns null when data is missing, empty, all-zero, or tied for top spend.
 */
export function computeDestinationsTakeaway(
  data?: readonly (DestinationLabelLike | null | undefined)[] | null,
): string | null {
  if (!data?.length) return null;

  const totals = new Map<string, { label: string; city: string; orders: number; spend: number }>();
  for (const item of data) {
    if (!item) continue;
    const label = String(item.label ?? '').trim();
    if (!label) continue;
    const city = String(item.city ?? '').trim();
    const ord = item.orders ?? 0;
    const orders = isFiniteNumber(ord) && ord > 0 ? ord : 0;
    const sp = item.spend ?? 0;
    const spend = isFiniteNumber(sp) && sp > 0 ? sp : 0;

    const key = city ? `${label}:::${city}` : label;
    const existing = totals.get(key);
    if (existing) {
      existing.orders += orders;
      existing.spend += spend;
    } else {
      totals.set(key, { label, city, orders, spend });
    }
  }

  if (totals.size === 0) return null;

  const rows = [...totals.values()];
  const totalSpend = sumValues(rows.map((r) => r.spend));
  const totalOrders = sumValues(rows.map((r) => r.orders));
  if (totalSpend <= 0 && totalOrders <= 0) return null;

  const winner = totalSpend > 0
    ? uniqueMax(rows, (r) => r.spend)
    : uniqueMax(rows, (r) => r.orders);

  if (!winner) return null;

  const destText = winner.city && !winner.label.toLowerCase().includes(winner.city.toLowerCase())
    ? `${winner.label} (${winner.city})`
    : winner.label;

  const roundedOrders = Math.round(winner.orders);
  const orderText = `${roundedOrders} ${roundedOrders === 1 ? 'order' : 'orders'}`;

  if (totalSpend > 0 && winner.spend > 0) {
    const formattedSpend = formatRupees(winner.spend);
    const pct = Math.round((winner.spend / totalSpend) * 100);
    return `Top destination is ${destText} with ${formattedSpend} across ${orderText} (${pct}% of total spend)`;
  }

  return `Top destination is ${destText} across ${orderText}`;
}

export interface DistanceItemLike {
  distance_km?: number | null;
  fee?: number | null;
  restaurant?: string | null;
}

/**
 * S-065: Dynamic takeaway caption for distance vs delivery fee scatter.
 * e.g. "Average delivery fee is ₹34 across 4.2 km mean distance (~₹5.20/km trend)"
 * Returns null when distance_unavailable_reason is present, or data is missing, empty, or all-zero.
 */
export function computeDistanceVsFeeTakeaway(
  distances?: readonly (DistanceItemLike | null | undefined)[] | null,
  distance_unavailable_reason?: string | null,
): string | null {
  if (distance_unavailable_reason) return null;
  if (!distances?.length) return null;

  const valid = distances.filter(
    (d): d is DistanceItemLike & { distance_km: number; fee: number } =>
      d != null &&
      isFiniteNumber(d.distance_km) &&
      d.distance_km >= 0 &&
      isFiniteNumber(d.fee) &&
      d.fee >= 0,
  );

  if (valid.length === 0) return null;

  let totalFee = 0;
  let totalDist = 0;
  for (const item of valid) {
    totalFee += item.fee;
    totalDist += item.distance_km;
  }

  const meanFee = totalFee / valid.length;
  const meanDist = totalDist / valid.length;

  if (meanFee === 0 && meanDist === 0) {
    return null;
  }

  // Calculate OLS linear regression slope if >= 2 points
  let slopeStr = '';
  if (valid.length >= 2) {
    const n = valid.length;
    let sumXY = 0;
    let sumX2 = 0;
    for (const item of valid) {
      sumXY += item.distance_km * item.fee;
      sumX2 += item.distance_km * item.distance_km;
    }
    const denominator = n * sumX2 - totalDist * totalDist;
    if (Math.abs(denominator) > 1e-9) {
      const slope = (n * sumXY - totalDist * totalFee) / denominator;
      if (isFiniteNumber(slope)) {
        const sign = slope < 0 ? '-' : '';
        slopeStr = ` (~${sign}₹${Math.abs(slope).toFixed(2)}/km trend)`;
      }
    }
  }

  return `Average delivery fee is ${formatRupees(meanFee)} across ${meanDist.toFixed(1)} km mean distance${slopeStr}`;
}

