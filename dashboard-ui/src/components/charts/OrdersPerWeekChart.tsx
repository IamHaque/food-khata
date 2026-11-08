import * as React from "react";
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  AriaComponent,
  MarkLineComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsCoreOption } from "echarts/core";
import { Info } from "lucide-react";

import { ChartCard } from "@/components/dashboard/ChartCard";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  getCurrentChartTheme,
  buildBaseChartOption,
  resolveChartTheme,
  type ChartTheme,
} from "@/lib/chart-theme";
import {
  computeOrdersPerWeekTakeaway,
  type WeeklyOrderTakeawayDatumLike,
} from "@/lib/captions";
import { subscribeTheme } from "@/app/theme";

let echartsRegistered = false;
function registerOrdersPerWeekModules() {
  if (echartsRegistered) return;
  echarts.use([
    LineChart,
    GridComponent,
    TooltipComponent,
    LegendComponent,
    AriaComponent,
    MarkLineComponent,
    CanvasRenderer,
  ]);
  echartsRegistered = true;
}
registerOrdersPerWeekModules();

export interface CalendarItemLike {
  date?: string | null;
  orders?: number | null;
  spend?: number | null;
}

export interface WeeklyOrderDatum extends WeeklyOrderTakeawayDatumLike {
  week: string; // e.g. "2025-W11"
  label: string; // e.g. "Mar 10"
  orders: number;
  movingAverage: number | null;
  startDate: string; // "2025-03-10"
  endDate: string; // "2025-03-16"
}

const MONTH_NAMES_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * Returns UTC Monday date of the ISO week containing the given UTC timestamp or date string.
 */
function getIsoMonday(year: number, monthIndex: number, day: number): Date {
  const d = new Date(Date.UTC(year, monthIndex, day));
  const dayOfWeek = d.getUTCDay() || 7; // Sunday is 7 in ISO
  d.setUTCDate(d.getUTCDate() - dayOfWeek + 1);
  return d;
}

/**
 * Calculates standard ISO 8601 week string (e.g. "2025-W11") from a Monday UTC Date.
 */
function getIsoWeekString(monday: Date): string {
  // Thursday of that week determines the ISO week year
  const thursday = new Date(monday.getTime() + 3 * 86400000);
  const isoYear = thursday.getUTCFullYear();

  // First Thursday of the ISO year
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const jan4DayOfWeek = jan4.getUTCDay() || 7;
  const firstThursday = new Date(jan4.getTime() + (4 - jan4DayOfWeek) * 86400000);

  const weekNum = 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * 86400000));
  return `${isoYear}-W${String(weekNum).padStart(2, "0")}`;
}

/**
 * Formats a Date object as YYYY-MM-DD.
 */
function formatDateKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Pure aggregation helper: groups daily calendar entries into consecutive ISO weeks (Monday to Sunday)
 * and calculates a trailing 4-week simple moving average (SMA) for each week.
 */
export function aggregateOrdersByWeek(
  calendar?: readonly CalendarItemLike[] | null,
): WeeklyOrderDatum[] {
  if (!calendar || calendar.length === 0) return [];

  // 1. Collect valid dates and sum orders per date
  const dayOrdersMap = new Map<string, number>();
  let minDateStr: string | null = null;
  let maxDateStr: string | null = null;

  for (const item of calendar) {
    if (!item || !item.date) continue;
    const rawDate = String(item.date).trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) continue;

    const rawCount = Number(item.orders ?? 0);
    const orders = Number.isFinite(rawCount) && rawCount > 0 ? Math.round(rawCount) : 0;

    dayOrdersMap.set(rawDate, (dayOrdersMap.get(rawDate) ?? 0) + orders);

    if (!minDateStr || rawDate < minDateStr) minDateStr = rawDate;
    if (!maxDateStr || rawDate > maxDateStr) maxDateStr = rawDate;
  }

  if (!minDateStr || !maxDateStr) return [];

  const [minY, minM, minD] = minDateStr.split("-").map(Number);
  const [maxY, maxM, maxD] = maxDateStr.split("-").map(Number);

  const startMonday = getIsoMonday(minY, minM - 1, minD);
  const endMonday = getIsoMonday(maxY, maxM - 1, maxD);

  // 2. Iterate through consecutive calendar weeks from startMonday to endMonday
  const weeks: WeeklyOrderDatum[] = [];
  const currMonday = new Date(startMonday.getTime());

  while (currMonday.getTime() <= endMonday.getTime()) {
    const mondayStr = formatDateKey(currMonday);
    const sundayDate = new Date(currMonday.getTime() + 6 * 86400000);
    const sundayStr = formatDateKey(sundayDate);

    const weekIso = getIsoWeekString(currMonday);
    const mIndex = currMonday.getUTCMonth();
    const dNum = currMonday.getUTCDate();
    const label = `${MONTH_NAMES_SHORT[mIndex]} ${dNum}`;

    // Sum orders in this week interval [mondayStr, sundayStr]
    let weekOrders = 0;
    const dayCursor = new Date(currMonday.getTime());
    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const dayKey = formatDateKey(dayCursor);
      weekOrders += dayOrdersMap.get(dayKey) ?? 0;
      dayCursor.setUTCDate(dayCursor.getUTCDate() + 1);
    }

    weeks.push({
      week: weekIso,
      label,
      orders: weekOrders,
      movingAverage: null,
      startDate: mondayStr,
      endDate: sundayStr,
    });

    currMonday.setUTCDate(currMonday.getUTCDate() + 7);
  }

  // 3. Compute trailing 4-week simple moving average (SMA) for each week i
  for (let i = 0; i < weeks.length; i++) {
    const windowStart = Math.max(0, i - 3);
    const windowWeeks = weeks.slice(windowStart, i + 1);
    const sum = windowWeeks.reduce((acc, curr) => acc + curr.orders, 0);
    const avg = sum / windowWeeks.length;
    weeks[i].movingAverage = Math.round(avg * 100) / 100;
  }

  return weeks;
}

/**
 * Builds table alternative rows and data for screen readers and CSV exports.
 */
export function buildOrdersPerWeekTableRows(
  weeklyData?: readonly WeeklyOrderDatum[] | null,
): {
  tableHeaders: string[];
  tableRows: Array<Array<string | number>>;
  tableData: Array<Record<string, any>>;
} {
  const tableHeaders = ["Week", "Orders", "4-Week Moving Avg"];
  if (!weeklyData || weeklyData.length === 0) {
    return { tableHeaders, tableRows: [], tableData: [] };
  }

  const tableRows: Array<Array<string | number>> = [];
  const tableData: Array<Record<string, any>> = [];

  for (const d of weeklyData) {
    const maText = d.movingAverage != null ? d.movingAverage : "-";
    tableRows.push([d.label, d.orders, maText]);
    tableData.push({
      Week: d.label,
      Orders: d.orders,
      "4-Week Moving Avg": maText,
    });
  }

  return { tableHeaders, tableRows, tableData };
}

/**
 * Formats rich tooltip showing Week label, Weekly orders count, 4-week moving average,
 * and comparison to overall benchmark.
 */
export function formatOrdersPerWeekTooltip(
  params: unknown,
  weeklyData: readonly WeeklyOrderDatum[],
  orders_per_week: number | null | undefined,
  theme: ChartTheme,
): string {
  const pList = Array.isArray(params) ? params : [params];
  const first = pList[0] as { dataIndex?: number; axisValueLabel?: string } | undefined;
  if (!first) return "";

  const idx = typeof first.dataIndex === "number" ? first.dataIndex : 0;
  const datum = weeklyData[idx];
  if (!datum) return "";

  const weekHeader = `${datum.label} (${datum.startDate} to ${datum.endDate})`;
  const orderText = `${datum.orders} ${datum.orders === 1 ? "order" : "orders"}`;
  const maText = datum.movingAverage != null ? `${datum.movingAverage} orders` : "-";

  let benchmarkHtml = "";
  if (typeof orders_per_week === "number" && Number.isFinite(orders_per_week) && orders_per_week > 0) {
    const diff = datum.orders - orders_per_week;
    const diffAbs = Math.abs(diff);
    const diffStr = (Math.round(diffAbs * 10) / 10).toFixed(1);
    const benchmarkLabel = `${(Math.round(orders_per_week * 10) / 10).toFixed(1)}/wk`;

    let comparisonText = "";
    if (diffAbs < 0.05) {
      comparisonText = `Equal to overall avg (${benchmarkLabel})`;
    } else if (diff > 0) {
      comparisonText = `+${diffStr} vs overall avg (${benchmarkLabel})`;
    } else {
      comparisonText = `-${diffStr} vs overall avg (${benchmarkLabel})`;
    }

    benchmarkHtml = `
      <div style="margin-top: 6px; padding-top: 5px; border-top: 1px dashed ${theme.border}; color: ${theme.mutedText}; font-size: 11px;">
        ${comparisonText}
      </div>`;
  }

  return `
    <div style="font-family: inherit; font-size: 12px; color: ${theme.text}; min-width: 175px;">
      <div style="font-weight: 700; margin-bottom: 4px;">${weekHeader}</div>
      <div style="display: flex; justify-content: space-between; gap: 12px; margin-bottom: 2px;">
        <span style="color: ${theme.mutedText};">Weekly orders:</span>
        <span style="font-weight: 600;">${orderText}</span>
      </div>
      <div style="display: flex; justify-content: space-between; gap: 12px;">
        <span style="color: ${theme.mutedText};">4-week moving avg:</span>
        <span style="font-weight: 600;">${maText}</span>
      </div>
      ${benchmarkHtml}
    </div>
  `.trim();
}

/**
 * Pure ECharts option builder for Orders Per Week chart (S-067).
 */
export function buildOrdersPerWeekOption(
  weeklyData: readonly WeeklyOrderDatum[],
  orders_per_week?: number | null,
  theme?: ChartTheme,
  prefersReducedMotion = false,
): EChartsCoreOption {
  const currentTheme =
    theme ??
    (typeof document === "undefined"
      ? resolveChartTheme("light", "emerald")
      : getCurrentChartTheme());

  const base = buildBaseChartOption(currentTheme, prefersReducedMotion);
  const primaryColor = currentTheme.colors[0] || currentTheme["chart-1"] || currentTheme.primary;
  const maColor = currentTheme.colors[1] || currentTheme["chart-2"] || currentTheme.colors[0];

  const categories = weeklyData.map((d) => d.label);
  const ordersSeries = weeklyData.map((d) => d.orders);
  const maSeries = weeklyData.map((d) => d.movingAverage);

  let markLineOption: any = undefined;
  if (typeof orders_per_week === "number" && Number.isFinite(orders_per_week) && orders_per_week > 0) {
    const benchmarkVal = Math.round(orders_per_week * 10) / 10;
    markLineOption = {
      silent: true,
      symbol: "none",
      data: [
        {
          yAxis: benchmarkVal,
          name: "Overall avg",
          lineStyle: {
            color: currentTheme.mutedColor || currentTheme.axis,
            type: "dotted",
            width: 1.5,
          },
          label: {
            show: true,
            position: "insideEndTop",
            formatter: `Overall avg: ${benchmarkVal}/wk`,
            fontSize: 10,
            color: currentTheme.mutedText || currentTheme.text,
          },
        },
      ],
    };
  }

  const option: EChartsCoreOption = {
    ...base,
    animation: !prefersReducedMotion,
    animationDuration: prefersReducedMotion ? 0 : 600,
    animationEasing: "cubicOut",
    legend: {
      show: true,
      top: 8,
      right: 16,
      icon: "circle",
      textStyle: {
        color: currentTheme.text,
        fontSize: 11,
      },
      data: ["Weekly orders", "4-week moving avg"],
    },
    tooltip: {
      ...(base.tooltip as object),
      trigger: "axis",
      axisPointer: {
        type: "line",
        lineStyle: {
          color: currentTheme.border,
          type: "dashed",
        },
      },
      formatter: (params: unknown) =>
        formatOrdersPerWeekTooltip(params, weeklyData, orders_per_week, currentTheme),
    },
    grid: {
      left: 45,
      right: 30,
      top: 48,
      bottom: 45,
      containLabel: true,
    },
    xAxis: {
      type: "category",
      data: categories,
      boundaryGap: false,
      axisLabel: {
        fontSize: 10,
        color: currentTheme.mutedColor,
        rotate: categories.length > 14 ? 30 : 0,
      },
      axisLine: {
        lineStyle: {
          color: currentTheme.axis,
        },
      },
      axisTick: {
        alignWithLabel: true,
      },
    },
    yAxis: {
      type: "value",
      name: "Orders",
      nameTextStyle: {
        fontSize: 10,
        color: currentTheme.mutedColor,
      },
      minInterval: 1,
      axisLabel: {
        fontSize: 10,
        color: currentTheme.mutedColor,
      },
      splitLine: {
        show: true,
        lineStyle: {
          color: currentTheme.splitLine,
          type: "dashed",
        },
      },
    },
    series: [
      {
        name: "Weekly orders",
        type: "line",
        data: ordersSeries,
        smooth: false,
        showSymbol: true,
        symbol: "circle",
        symbolSize: 6,
        itemStyle: {
          color: primaryColor,
        },
        lineStyle: {
          color: primaryColor,
          width: 2.5,
        },
        markLine: markLineOption,
        animation: !prefersReducedMotion,
        animationDuration: prefersReducedMotion ? 0 : 600,
        animationEasing: "cubicOut",
      },
      {
        name: "4-week moving avg",
        type: "line",
        data: maSeries,
        smooth: true,
        showSymbol: false,
        itemStyle: {
          color: maColor,
        },
        lineStyle: {
          color: maColor,
          type: "dashed",
          width: 2,
        },
        animation: !prefersReducedMotion,
        animationDuration: prefersReducedMotion ? 0 : 600,
        animationEasing: "cubicOut",
      },
    ],
  };

  return option;
}

export function OrdersPerWeekInfoContent() {
  return (
    <div className="w-80 text-xs space-y-2.5 p-3.5 bg-popover text-popover-foreground shadow-md rounded-md border border-border">
      <div>
        <p className="font-semibold text-foreground text-sm">
          Weekly Ordering Rhythm
        </p>
        <p className="text-muted-foreground mt-0.5 leading-relaxed">
          Weekly order counts paired with a trailing 4-week moving average to identify rhythms and shifts.
        </p>
      </div>
      <div className="space-y-1.5 text-muted-foreground leading-relaxed">
        <p>
          <strong className="text-foreground">Weekly Grouping:</strong> Orders are aggregated into standard Monday to Sunday ISO weeks.
        </p>
        <p>
          <strong className="text-foreground">4-Week Moving Average:</strong> Trailing simple moving average computed over the current and prior 3 weeks to smooth out week-to-week volatility.
        </p>
        <p>
          <strong className="text-foreground">Overall Average Benchmark:</strong> Horizontal reference line indicates your overall average weekly order volume.
        </p>
      </div>
    </div>
  );
}

export interface OrdersPerWeekChartProps {
  calendar?: readonly CalendarItemLike[] | null;
  orders_per_week?: number | null;
  isLoading?: boolean;
  isEmpty?: boolean;
  emptyReason?: string;
  error?: Error | string | null;
  onRetry?: () => void;
  className?: string;
  title?: string;
  subtitle?: string;
  caption?: string;
  showTable?: boolean;
  onShowTableChange?: (value: boolean) => void;
  fullscreen?: boolean;
  onFullscreenChange?: (value: boolean) => void;
}

export function OrdersPerWeekChart({
  calendar,
  orders_per_week,
  isLoading,
  isEmpty: isEmptyProp,
  emptyReason = "No weekly ordering data available",
  error,
  onRetry,
  className,
  title,
  subtitle,
  caption,
  showTable,
  onShowTableChange,
  fullscreen,
  onFullscreenChange,
}: OrdersPerWeekChartProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const chartInstanceRef = React.useRef<echarts.ECharts | null>(null);

  // 1. Weekly data calculation
  const weeklyData = React.useMemo(
    () => aggregateOrdersByWeek(calendar),
    [calendar],
  );

  const totalOrders = React.useMemo(
    () => weeklyData.reduce((acc, curr) => acc + curr.orders, 0),
    [weeklyData],
  );

  const hasData = weeklyData.length > 0 && totalOrders > 0;
  const isEmpty = isEmptyProp ?? !hasData;

  // 2. Pure takeaway caption
  const takeawayCaption = React.useMemo(() => {
    if (caption) return caption;
    if (!hasData) return null;
    return computeOrdersPerWeekTakeaway(weeklyData, orders_per_week);
  }, [caption, hasData, weeklyData, orders_per_week]);

  // 3. Screen reader & export table representation
  const { tableHeaders, tableRows, tableData } = React.useMemo(
    () => buildOrdersPerWeekTableRows(weeklyData),
    [weeklyData],
  );

  // 4. ECharts mounting, resize, and theme subscription
  React.useEffect(() => {
    if (isEmpty || isLoading || error || !containerRef.current) {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.dispose();
        chartInstanceRef.current = null;
      }
      return;
    }

    const chart = echarts.init(containerRef.current);
    chartInstanceRef.current = chart;

    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const initialTheme = getCurrentChartTheme();
    chart.setOption(
      buildOrdersPerWeekOption(
        weeklyData,
        orders_per_week,
        initialTheme,
        prefersReducedMotion,
      ),
    );

    const ro = new ResizeObserver(() => {
      chart.resize();
    });
    ro.observe(containerRef.current);

    const unsub = subscribeTheme(() => {
      const nextTheme = getCurrentChartTheme();
      chart.setOption(
        buildOrdersPerWeekOption(
          weeklyData,
          orders_per_week,
          nextTheme,
          prefersReducedMotion,
        ),
      );
    });

    return () => {
      ro.disconnect();
      unsub();
      chart.dispose();
      chartInstanceRef.current = null;
    };
  }, [isEmpty, isLoading, error, weeklyData, orders_per_week]);

  return (
    <ChartCard
      title={title ?? "Weekly ordering rhythm"}
      subtitle={subtitle ?? "Weekly order volume and 4-week moving average"}
      caption={takeawayCaption ?? undefined}
      infoPopover={
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="About weekly ordering rhythm"
              className="inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring p-1 transition-colors"
            >
              <Info className="h-4 w-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            side="bottom"
            className="p-0 border-none bg-transparent shadow-none"
          >
            <OrdersPerWeekInfoContent />
          </PopoverContent>
        </Popover>
      }
      isLoading={isLoading}
      isEmpty={isEmpty}
      emptyReason={emptyReason}
      error={error}
      onRetry={onRetry}
      tableHeaders={tableHeaders}
      tableRows={tableRows}
      tableData={tableData}
      showTable={showTable}
      onShowTableChange={onShowTableChange}
      fullscreen={fullscreen}
      onFullscreenChange={onFullscreenChange}
      className={className}
    >
      <div
        ref={containerRef}
        className="h-72 w-full"
        role="img"
        aria-label="Weekly ordering rhythm line chart with 4-week moving average"
      />
    </ChartCard>
  );
}
