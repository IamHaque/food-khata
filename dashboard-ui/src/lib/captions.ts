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

