import type { EChartsType } from 'echarts/core';

export interface EChartsLike {
  dispatchAction: (payload: { type: string; [key: string]: unknown }) => void;
  getOption?: () => unknown;
  on?: (eventName: string, handler: (...args: unknown[]) => void) => void;
  off?: (eventName: string, handler: (...args: unknown[]) => void) => void;
  isDisposed?: () => boolean;
  resize?: () => void;
}

export type SupportedChart = EChartsType | EChartsLike;

export type HighlightAction = {
  type: string;
  seriesIndex?: number;
  dataIndex?: number;
  name?: string;
  [key: string]: unknown;
};

export type HighlightMatcher = (
  dimension: string,
  value: string,
  chart: SupportedChart
) => HighlightAction | HighlightAction[] | boolean | void | undefined;

export interface ChartRegistrationOptions {
  matcher?: HighlightMatcher;
  dimension?: string;
}

export interface RegisteredChartEntry {
  chart: SupportedChart;
  matcher?: HighlightMatcher;
  dimension?: string;
}

export const CLEAR_DELAY_MS = 120;

export const SUPPORTED_DIMENSIONS = [
  'month',
  'platform',
  'restaurant',
  'cuisine',
  'weekday',
  'hour',
] as const;

export type SupportedDimension = (typeof SUPPORTED_DIMENSIONS)[number];

// Module-level imperative bus state (no React state, zero re-renders)
const chartRegistry = new Map<string, RegisteredChartEntry>();
let clearTimer: ReturnType<typeof setTimeout> | null = null;

const MONTH_NAMES = [
  'jan', 'feb', 'mar', 'apr', 'may', 'jun',
  'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
];
const FULL_MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

const WEEKDAY_MAP: Record<string, number> = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tuesday: 2,
  wed: 3, wednesday: 3,
  thu: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
};

export function isMonthMatch(a: string, b: string): boolean {
  const normA = a.trim().toLowerCase();
  const normB = b.trim().toLowerCase();
  if (normA === normB) return true;

  // Check prefix matching (e.g. '2024-01-15' vs '2024-01')
  if (normA.startsWith(normB) || normB.startsWith(normA)) return true;

  // Extract month index from YYYY-MM
  const extractMonthNum = (str: string): number | null => {
    const m = str.match(/(?:^|\D)(\d{4})[-/.](\d{1,2})(?:\D|$)/);
    if (m) {
      const num = parseInt(m[2], 10);
      if (num >= 1 && num <= 12) return num - 1;
    }
    return null;
  };

  const monthIdxA = extractMonthNum(normA);
  const monthIdxB = extractMonthNum(normB);

  if (monthIdxA !== null && monthIdxB !== null) {
    return monthIdxA === monthIdxB;
  }

  // Compare month name to YYYY-MM
  const checkNameMatch = (numIdx: number, nameStr: string): boolean => {
    return nameStr.includes(MONTH_NAMES[numIdx]) || nameStr.includes(FULL_MONTH_NAMES[numIdx]);
  };

  if (monthIdxA !== null && checkNameMatch(monthIdxA, normB)) return true;
  if (monthIdxB !== null && checkNameMatch(monthIdxB, normA)) return true;

  return false;
}

export function isWeekdayMatch(a: string, b: string): boolean {
  const normA = a.trim().toLowerCase();
  const normB = b.trim().toLowerCase();
  if (normA === normB) return true;

  const dayA = WEEKDAY_MAP[normA];
  const dayB = WEEKDAY_MAP[normB];

  if (dayA !== undefined && dayB !== undefined) {
    return dayA === dayB;
  }

  if (normA === 'weekday' && dayB !== undefined) return dayB >= 1 && dayB <= 5;
  if (normB === 'weekday' && dayA !== undefined) return dayA >= 1 && dayA <= 5;
  if (normA === 'weekend' && dayB !== undefined) return dayB === 0 || dayB === 6;
  if (normB === 'weekend' && dayA !== undefined) return dayA === 0 || dayA === 6;

  return false;
}

export function parseHour(val: string): number | null {
  const norm = val.trim().toLowerCase();
  const ampmMatch = norm.match(/^(\d{1,2})(?::\d{2})?\s*(am|pm)$/);
  if (ampmMatch) {
    let h = parseInt(ampmMatch[1], 10);
    const meridiem = ampmMatch[2];
    if (meridiem === 'pm' && h < 12) h += 12;
    if (meridiem === 'am' && h === 12) h = 0;
    return h;
  }
  const match = norm.match(/^(\d{1,2})(?::\d{2})?/);
  if (match) {
    const h = parseInt(match[1], 10);
    if (h >= 0 && h <= 23) return h;
  }
  return null;
}

export function isHourMatch(a: string, b: string): boolean {
  const hA = parseHour(a);
  const hB = parseHour(b);
  if (hA !== null && hB !== null) {
    return hA === hB;
  }
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function isDimensionMatch(dimension: string, candidate: string, targetValue: string): boolean {
  const dim = dimension.trim().toLowerCase();
  switch (dim) {
    case 'month':
      return isMonthMatch(candidate, targetValue);
    case 'weekday':
      return isWeekdayMatch(candidate, targetValue);
    case 'hour':
      return isHourMatch(candidate, targetValue);
    case 'platform':
    case 'cuisine':
    case 'restaurant':
    default:
      return (
        candidate.trim().toLowerCase() === targetValue.trim().toLowerCase() ||
        candidate.trim().toLowerCase().includes(targetValue.trim().toLowerCase())
      );
  }
}

export function detectDimension(
  value: string,
  headers?: string[],
  summary?: string
): string | undefined {
  if (headers && headers.length > 0) {
    const firstHeader = headers[0].toLowerCase();
    if (firstHeader.includes('month') || firstHeader.includes('year') || firstHeader.includes('date')) return 'month';
    if (firstHeader.includes('platform')) return 'platform';
    if (firstHeader.includes('restaurant')) return 'restaurant';
    if (firstHeader.includes('cuisine')) return 'cuisine';
    if (firstHeader.includes('weekday') || firstHeader.includes('day')) return 'weekday';
    if (firstHeader.includes('hour') || firstHeader.includes('time')) return 'hour';
  }

  if (summary) {
    const sum = summary.toLowerCase();
    if (sum.includes('month') || sum.includes('calendar')) return 'month';
    if (sum.includes('platform')) return 'platform';
    if (sum.includes('restaurant') || sum.includes('loyalty')) return 'restaurant';
    if (sum.includes('cuisine')) return 'cuisine';
    if (sum.includes('weekday')) return 'weekday';
    if (sum.includes('hour') || sum.includes('time')) return 'hour';
  }

  const v = value.trim();
  if (/^\d{4}-\d{2}/.test(v) || /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i.test(v)) {
    return 'month';
  }
  if (/^(swiggy|zomato)$/i.test(v)) {
    return 'platform';
  }
  if (/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/i.test(v) || /^(weekday|weekend)$/i.test(v)) {
    return 'weekday';
  }
  if (/^(\d{1,2}):\d{2}/.test(v) || /^\d{1,2}\s*(am|pm)$/i.test(v)) {
    return 'hour';
  }

  return undefined;
}

export function extractHoverInfo(
  params: unknown,
  explicitDimension?: string,
  headers?: string[],
  summary?: string
): { dimension: string; value: string } | null {
  if (!params || typeof params !== 'object') return null;

  const p = params as Record<string, unknown>;
  let rawValue: string | undefined;

  if (typeof p.name === 'string' && p.name.trim().length > 0) {
    rawValue = p.name.trim();
  } else if (typeof p.axisValueLabel === 'string' && p.axisValueLabel.trim().length > 0) {
    rawValue = p.axisValueLabel.trim();
  } else if (typeof p.axisValue === 'string' && p.axisValue.trim().length > 0) {
    rawValue = p.axisValue.trim();
  } else if (p.data && typeof p.data === 'object') {
    const dataObj = p.data as Record<string, unknown>;
    if (typeof dataObj.name === 'string' && dataObj.name.trim().length > 0) {
      rawValue = dataObj.name.trim();
    } else if (Array.isArray(p.data) && p.data.length > 0) {
      rawValue = String(p.data[0]).trim();
    }
  } else if (Array.isArray(p.value) && p.value.length > 0) {
    rawValue = String(p.value[0]).trim();
  } else if (p.value !== undefined && p.value !== null) {
    rawValue = String(p.value).trim();
  }

  if (!rawValue) return null;

  if (explicitDimension) {
    return { dimension: explicitDimension, value: rawValue };
  }

  const detected = detectDimension(rawValue, headers, summary);
  return { dimension: detected || 'default', value: rawValue };
}

export function dispatchHighlightToChart(
  entry: RegisteredChartEntry,
  dimension: string,
  value: string
): void {
  const chart = entry.chart;
  if (chart.isDisposed && chart.isDisposed()) return;

  // 1. Reset highlights elsewhere on this chart
  chart.dispatchAction({ type: 'downplay' });

  // 2. Custom matcher if provided
  if (entry.matcher) {
    const customResult = entry.matcher(dimension, value, chart);
    if (customResult === false) {
      return;
    }
    if (Array.isArray(customResult)) {
      for (const act of customResult) {
        chart.dispatchAction(act);
      }
      return;
    }
    if (typeof customResult === 'object' && customResult !== null) {
      chart.dispatchAction(customResult);
      return;
    }
    // true or undefined -> proceed to default matching
  }

  // 3. Inspect chart option to highlight specific mark series and dataIndex
  const actions: HighlightAction[] = [];

  if (typeof chart.getOption === 'function') {
    const opt = chart.getOption() as Record<string, unknown> | null;
    if (opt && typeof opt === 'object') {
      // Check xAxis category items
      const xAxes = Array.isArray(opt.xAxis) ? opt.xAxis : opt.xAxis ? [opt.xAxis] : [];
      for (const xAxis of xAxes) {
        const xObj = xAxis as { data?: unknown[] } | undefined;
        if (Array.isArray(xObj?.data)) {
          xObj.data.forEach((item: unknown, dIdx: number) => {
            const label =
              typeof item === 'object' && item !== null && 'value' in item
                ? String((item as { value: unknown }).value)
                : String(item);
            if (isDimensionMatch(dimension, label, value)) {
              const seriesList = Array.isArray(opt.series) ? opt.series : [];
              if (seriesList.length > 0) {
                seriesList.forEach((_: unknown, sIdx: number) => {
                  actions.push({ type: 'highlight', seriesIndex: sIdx, dataIndex: dIdx, name: label });
                });
              } else {
                actions.push({ type: 'highlight', dataIndex: dIdx, name: label });
              }
            }
          });
        }
      }

      // Check yAxis category items
      const yAxes = Array.isArray(opt.yAxis) ? opt.yAxis : opt.yAxis ? [opt.yAxis] : [];
      for (const yAxis of yAxes) {
        const yObj = yAxis as { data?: unknown[] } | undefined;
        if (Array.isArray(yObj?.data)) {
          yObj.data.forEach((item: unknown, dIdx: number) => {
            const label =
              typeof item === 'object' && item !== null && 'value' in item
                ? String((item as { value: unknown }).value)
                : String(item);
            if (isDimensionMatch(dimension, label, value)) {
              const seriesList = Array.isArray(opt.series) ? opt.series : [];
              if (seriesList.length > 0) {
                seriesList.forEach((_: unknown, sIdx: number) => {
                  actions.push({ type: 'highlight', seriesIndex: sIdx, dataIndex: dIdx, name: label });
                });
              } else {
                actions.push({ type: 'highlight', dataIndex: dIdx, name: label });
              }
            }
          });
        }
      }

      // Check series data items (e.g. pie slice names or calendar [date, val])
      const seriesList = Array.isArray(opt.series) ? opt.series : [];
      seriesList.forEach((series: unknown, sIdx: number) => {
        const sObj = series as { data?: unknown[] } | undefined;
        if (Array.isArray(sObj?.data)) {
          sObj.data.forEach((item: unknown, dIdx: number) => {
            if (typeof item === 'object' && item !== null) {
              if ('name' in item && isDimensionMatch(dimension, String((item as { name: unknown }).name), value)) {
                actions.push({
                  type: 'highlight',
                  seriesIndex: sIdx,
                  dataIndex: dIdx,
                  name: String((item as { name: unknown }).name),
                });
              } else if (Array.isArray(item) && typeof item[0] === 'string') {
                if (isDimensionMatch(dimension, item[0], value)) {
                  actions.push({ type: 'highlight', seriesIndex: sIdx, dataIndex: dIdx });
                }
              }
            }
          });
        }
      });
    }
  }

  if (actions.length > 0) {
    for (const act of actions) {
      chart.dispatchAction(act);
    }
  } else {
    // Universal highlight fallback (also covers mock charts in tests)
    chart.dispatchAction({ type: 'highlight', name: value });
  }
}

/**
 * Registers an ECharts instance to the highlight bus.
 * Returns an unregister cleanup function.
 */
export function registerChart(
  id: string,
  chart: SupportedChart,
  matcherOrOptions?: HighlightMatcher | ChartRegistrationOptions
): () => void {
  const matcher =
    typeof matcherOrOptions === 'function'
      ? matcherOrOptions
      : matcherOrOptions?.matcher;
  const dimension =
    typeof matcherOrOptions === 'object' ? matcherOrOptions.dimension : undefined;

  chartRegistry.set(id, { chart, matcher, dimension });

  return () => {
    unregisterChart(id);
  };
}

/**
 * Unregisters an ECharts instance from the highlight bus.
 */
export function unregisterChart(id: string): void {
  chartRegistry.delete(id);
}

/**
 * Emits a highlight event for a hovered dimension and value.
 * Cancels any pending clear timer and broadcasts to all other registered charts.
 */
export function emitHighlight(sourceId: string, dimension: string, value: string): void {
  if (clearTimer !== null) {
    clearTimeout(clearTimer);
    clearTimer = null;
  }

  for (const [id, entry] of chartRegistry.entries()) {
    if (id === sourceId) continue;
    try {
      if (entry.chart.isDisposed && entry.chart.isDisposed()) continue;
      dispatchHighlightToChart(entry, dimension, value);
    } catch {
      // Ignore disposed or errored chart instances
    }
  }
}

/**
 * Clears highlights across all registered charts immediately.
 */
export function clearHighlights(): void {
  for (const entry of chartRegistry.values()) {
    try {
      if (entry.chart.isDisposed && entry.chart.isDisposed()) continue;
      entry.chart.dispatchAction({ type: 'downplay' });
    } catch {
      // Ignore disposed or errored chart instances
    }
  }
}

/**
 * Schedules clearing of highlights within 120ms with debounce cancellation.
 */
export function emitClear(sourceId?: string): void {
  void sourceId;
  if (clearTimer !== null) {
    clearTimeout(clearTimer);
    clearTimer = null;
  }

  clearTimer = setTimeout(() => {
    clearHighlights();
    clearTimer = null;
  }, CLEAR_DELAY_MS);
}

// Helpers for testing and diagnostics
export function isClearPending(): boolean {
  return clearTimer !== null;
}

export function cancelPendingClear(): void {
  if (clearTimer !== null) {
    clearTimeout(clearTimer);
    clearTimer = null;
  }
}

export function clearRegistry(): void {
  cancelPendingClear();
  chartRegistry.clear();
}

export function getRegisteredChartCount(): number {
  return chartRegistry.size;
}

export function getRegisteredChart(id: string): RegisteredChartEntry | undefined {
  return chartRegistry.get(id);
}
