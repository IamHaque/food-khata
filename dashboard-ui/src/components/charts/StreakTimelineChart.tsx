import * as React from "react";
import * as echarts from "echarts/core";
import { BarChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  AriaComponent,
  MarkAreaComponent,
  MarkPointComponent,
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
  computeStreakTimelineTakeaway,
  findLongestStreakRange,
  parseISODateToUtcDays,
  formatRupees,
  type CalendarStreakItemLike,
  type StreakRange,
} from "@/lib/captions";
import { subscribeTheme } from "@/app/theme";
import { useFilters } from "@/app/FilterContext";

export { findLongestStreakRange, parseISODateToUtcDays, type StreakRange, type CalendarStreakItemLike };

let echartsRegistered = false;
function registerStreakTimelineModules() {
  if (echartsRegistered) return;
  echarts.use([
    BarChart,
    GridComponent,
    TooltipComponent,
    LegendComponent,
    AriaComponent,
    MarkAreaComponent,
    MarkPointComponent,
    CanvasRenderer,
  ]);
  echartsRegistered = true;
}
registerStreakTimelineModules();

/**
 * Cleanly formats a YYYY-MM-DD date string for category timeline axis (MMM d, yyyy).
 * Example: 2025-03-10 -> Mar 10, 2025
 */
export function formatTimelineDate(dateStr: string): string {
  if (!dateStr) return "";
  const parts = dateStr.slice(0, 10).split("-");
  if (parts.length < 3) return dateStr;
  const y = parts[0];
  const mIndex = Number(parts[1]) - 1;
  const d = Number(parts[2]);
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const mStr = months[mIndex];
  if (!mStr || isNaN(d)) return dateStr;
  return `${mStr} ${d}, ${y}`;
}

/**
 * Cleanly formats a YYYY-MM-DD date string for tooltips (dd MMM yyyy).
 * Example: 2025-03-10 -> 10 Mar 2025
 */
export function formatTooltipDate(dateStr: string): string {
  if (!dateStr) return "";
  const parts = dateStr.slice(0, 10).split("-");
  if (parts.length < 3) return dateStr;
  const y = parts[0];
  const mIndex = Number(parts[1]) - 1;
  const d = Number(parts[2]);
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const mStr = months[mIndex];
  if (!mStr || isNaN(d)) return dateStr;
  const dayPadded = String(d).padStart(2, "0");
  return `${dayPadded} ${mStr} ${y}`;
}

/**
 * Formats rich tooltip showing Date (dd MMM yyyy), Order count, Spend in INR,
 * and streak indicator if inside the longest streak.
 */
export function formatStreakTimelineTooltip(
  params: unknown,
  calendarMap: Map<string, { orders: number; spend: number }>,
  range: StreakRange | null,
  theme: ChartTheme,
): string {
  const p = (Array.isArray(params) ? params[0] : params) as {
    name?: string;
    axisValueLabel?: string;
    axisValue?: string;
    value?: unknown;
  } | undefined;

  const dateStr = String(p?.axisValueLabel ?? p?.axisValue ?? p?.name ?? "").trim();
  if (!dateStr) return "";

  const data = calendarMap.get(dateStr) ?? { orders: 0, spend: 0 };
  const formattedDate = formatTooltipDate(dateStr);
  const formattedSpend = formatRupees(data.spend);
  const formattedOrders = `${data.orders} ${data.orders === 1 ? "order" : "orders"}`;

  const isInside = Boolean(range && dateStr >= range.startDate && dateStr <= range.endDate);
  let streakBadge = "";
  if (isInside && range) {
    const dayIndex = parseISODateToUtcDays(dateStr) - parseISODateToUtcDays(range.startDate) + 1;
    streakBadge = `
      <div style="margin-top: 6px; padding-top: 5px; border-top: 1px dashed ${theme.border}; color: ${theme.colors[1] || theme.primary}; font-weight: 600; font-size: 11px;">
        ★ Part of longest streak (Day ${dayIndex} of ${range.length})
      </div>`;
  }

  return `
    <div style="font-family: inherit; font-size: 12px; color: ${theme.text}; min-width: 160px;">
      <div style="font-weight: 700; margin-bottom: 4px;">${formattedDate}</div>
      <div style="display: flex; justify-content: space-between; gap: 12px; margin-bottom: 2px;">
        <span style="color: ${theme.mutedText};">Orders:</span>
        <span style="font-weight: 600;">${formattedOrders}</span>
      </div>
      <div style="display: flex; justify-content: space-between; gap: 12px;">
        <span style="color: ${theme.mutedText};">Spend:</span>
        <span style="font-weight: 600;">${formattedSpend}</span>
      </div>
      ${streakBadge}
    </div>
  `.trim();
}

/**
 * Pure ECharts option builder for the streak timeline chart.
 */
export function buildStreakTimelineOption(
  calendar?: readonly CalendarStreakItemLike[] | null,
  longestStreak?: number | null,
  theme?: ChartTheme,
  prefersReducedMotion = false,
): EChartsCoreOption {
  const currentTheme =
    theme ??
    (typeof document === "undefined"
      ? resolveChartTheme("light", "emerald")
      : getCurrentChartTheme());

  const dayMap = new Map<string, { orders: number; spend: number }>();
  for (const item of calendar ?? []) {
    if (!item || !item.date) continue;
    const rawDate = String(item.date).trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) continue;
    const orders = Number(item.orders ?? 0);
    const spend = Number(item.spend ?? 0);
    if (!Number.isFinite(orders) || orders <= 0) continue;

    const existing = dayMap.get(rawDate) ?? { orders: 0, spend: 0 };
    dayMap.set(rawDate, {
      orders: existing.orders + Math.round(orders),
      spend: existing.spend + (Number.isFinite(spend) && spend > 0 ? spend : 0),
    });
  }

  const dates = Array.from(dayMap.keys()).sort();
  const range = findLongestStreakRange(calendar, longestStreak);
  const primaryColor = currentTheme.colors[0] || currentTheme["chart-1"] || currentTheme.primary;
  const streakColor = currentTheme.colors[1] || currentTheme["chart-2"] || currentTheme.colors[0];

  const streakDaysLabel = range
    ? `Longest streak: ${range.length} ${range.length === 1 ? "day" : "days"}`
    : "";

  const markAreaData = range
    ? [
        [
          {
            name: streakDaysLabel,
            xAxis: range.startDate,
            itemStyle: {
              color: streakColor,
              opacity: 0.18,
            },
            label: {
              show: true,
              position: "top",
              color: currentTheme.text,
              fontSize: 11,
              fontWeight: 600,
              formatter: streakDaysLabel,
            },
          },
          {
            xAxis: range.endDate,
          },
        ],
      ]
    : [];

  const seriesData = dates.map((d) => {
    const item = dayMap.get(d)!;
    const isInsideStreak = Boolean(range && d >= range.startDate && d <= range.endDate);
    return {
      name: d,
      value: item.orders,
      itemStyle: {
        color: isInsideStreak ? streakColor : primaryColor,
        borderRadius: [4, 4, 0, 0],
      },
    };
  });

  const base = buildBaseChartOption(currentTheme, prefersReducedMotion);

  const option: EChartsCoreOption = {
    ...base,
    animation: !prefersReducedMotion,
    animationDuration: prefersReducedMotion ? 0 : 600,
    animationEasing: "cubicOut",
    tooltip: {
      ...(base.tooltip as object),
      trigger: "axis",
      axisPointer: {
        type: "shadow",
      },
      formatter: (params: unknown) =>
        formatStreakTimelineTooltip(params, dayMap, range, currentTheme),
    },
    grid: {
      left: 45,
      right: 25,
      top: 45,
      bottom: 45,
      containLabel: true,
    },
    xAxis: {
      type: "category",
      data: dates,
      axisLabel: {
        fontSize: 11,
        color: currentTheme.mutedColor,
        formatter: (val: string) => formatTimelineDate(val),
        rotate: 0,
        hideOverlap: true,
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
        fontSize: 11,
        color: currentTheme.mutedColor,
      },
      minInterval: 1,
      axisLabel: {
        fontSize: 11,
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
        name: "Daily orders",
        type: "bar",
        data: seriesData,
        barMaxWidth: 32,
        markArea:
          markAreaData.length > 0
            ? {
                silent: true,
                data: markAreaData,
              }
            : undefined,
        animation: !prefersReducedMotion,
        animationDuration: prefersReducedMotion ? 0 : 600,
        animationEasing: "cubicOut",
      },
    ],
  };

  return option;
}

/**
 * Builds table alternative rows and data for screen readers and CSV exports.
 */
export function buildStreakTimelineTableRows(
  calendar?: readonly CalendarStreakItemLike[] | null,
  longestStreak?: number | null,
): {
  tableHeaders: string[];
  tableRows: Array<Array<string | number>>;
  tableData: Array<Record<string, any>>;
} {
  const tableHeaders = ["Date", "Orders", "Spend", "Streak"];
  if (!calendar || calendar.length === 0) {
    return { tableHeaders, tableRows: [], tableData: [] };
  }

  const dayMap = new Map<string, { orders: number; spend: number }>();
  for (const item of calendar) {
    if (!item || !item.date) continue;
    const rawDate = String(item.date).trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) continue;
    const orders = Number(item.orders ?? 0);
    const spend = Number(item.spend ?? 0);
    if (!Number.isFinite(orders) || orders <= 0) continue;

    const existing = dayMap.get(rawDate) ?? { orders: 0, spend: 0 };
    dayMap.set(rawDate, {
      orders: existing.orders + Math.round(orders),
      spend: existing.spend + (Number.isFinite(spend) && spend > 0 ? spend : 0),
    });
  }

  const sortedDates = Array.from(dayMap.keys()).sort();
  const range = findLongestStreakRange(calendar, longestStreak);

  const tableRows: Array<Array<string | number>> = [];
  const tableData: Array<Record<string, any>> = [];

  for (const d of sortedDates) {
    const item = dayMap.get(d)!;
    const isInside = Boolean(range && d >= range.startDate && d <= range.endDate);
    let streakText = "-";
    if (isInside && range) {
      const dayIndex = parseISODateToUtcDays(d) - parseISODateToUtcDays(range.startDate) + 1;
      streakText = `Part of longest streak (Day ${dayIndex} of ${range.length})`;
    }

    tableRows.push([d, item.orders, formatRupees(item.spend), streakText]);
    tableData.push({
      Date: d,
      Orders: item.orders,
      Spend: item.spend,
      Streak: streakText,
    });
  }

  return { tableHeaders, tableRows, tableData };
}

export function StreakTimelineInfoContent() {
  return (
    <div className="w-80 text-xs space-y-2.5 p-3.5 bg-popover text-popover-foreground shadow-md rounded-md border border-border">
      <div>
        <p className="font-semibold text-foreground text-sm">
          Ordering Streak Timeline
        </p>
        <p className="text-muted-foreground mt-0.5 leading-relaxed">
          Order days across time with the longest consecutive ordering streak highlighted.
        </p>
      </div>
      <div className="space-y-1.5 text-muted-foreground leading-relaxed">
        <p>
          <strong className="text-foreground">Consecutive Days:</strong> Placing at least
          one order on consecutive calendar days builds an active ordering streak.
        </p>
        <p>
          <strong className="text-foreground">Longest Streak:</strong> Tracks the maximum
          consecutive calendar days where orders were placed. A day without an order breaks
          the streak.
        </p>
        <p>
          <strong className="text-foreground">Timeline Highlighting:</strong> The shaded
          accent region and highlighted bars mark the span of the longest streak, labelled
          with its total duration in days.
        </p>
      </div>
    </div>
  );
}

export interface StreakTimelineChartProps {
  calendar?: readonly CalendarStreakItemLike[] | null;
  data?: readonly CalendarStreakItemLike[] | null;
  longest_streak?: number | null;
  longestStreak?: number | null;
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

function useOptionalFilters() {
  try {
    return useFilters();
  } catch {
    return null;
  }
}

export function StreakTimelineChart({
  calendar,
  data,
  longest_streak,
  longestStreak,
  isLoading,
  isEmpty: isEmptyProp,
  emptyReason = "No order streak data recorded",
  error,
  onRetry,
  className,
  title = "Ordering streak timeline",
  subtitle = "Order days across time with longest streak highlighted and labelled",
  caption,
  showTable,
  onShowTableChange,
  fullscreen,
  onFullscreenChange,
}: StreakTimelineChartProps) {
  const filters = useOptionalFilters();
  const containerRef = React.useRef<HTMLDivElement>(null);
  const chartRef = React.useRef<echarts.ECharts | null>(null);

  const effectiveCalendar = calendar ?? data ?? null;
  const effectiveLongestStreak = longestStreak ?? longest_streak ?? null;

  const totalOrders = React.useMemo(() => {
    if (!effectiveCalendar) return 0;
    return effectiveCalendar.reduce(
      (sum, c) => sum + (Number(c?.orders ?? 0) > 0 ? Number(c?.orders) : 0),
      0,
    );
  }, [effectiveCalendar]);

  const isEmpty =
    isEmptyProp ||
    (!isLoading &&
      !error &&
      (!effectiveCalendar || effectiveCalendar.length === 0 || totalOrders === 0));

  const autoCaption = React.useMemo(
    () => computeStreakTimelineTakeaway(effectiveCalendar, effectiveLongestStreak),
    [effectiveCalendar, effectiveLongestStreak],
  );
  const effectiveCaption =
    caption !== undefined ? caption : autoCaption ?? undefined;

  const { tableHeaders, tableRows, tableData } = React.useMemo(
    () => buildStreakTimelineTableRows(effectiveCalendar, effectiveLongestStreak),
    [effectiveCalendar, effectiveLongestStreak],
  );

  React.useEffect(() => {
    const node = containerRef.current;
    if (!node || isEmpty || isLoading || error) return;

    registerStreakTimelineModules();

    const chart = echarts.init(node);
    chartRef.current = chart;

    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const opt = buildStreakTimelineOption(
      effectiveCalendar,
      effectiveLongestStreak,
      getCurrentChartTheme(),
      prefersReducedMotion,
    );
    chart.setOption(opt);

    chart.on("click", (params: any) => {
      const dateStr = params?.name || params?.data?.name;
      if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        filters?.update?.({ date_from: dateStr, date_to: dateStr });
      }
    });

    const resizeObserver = new ResizeObserver(() => {
      chart.resize();
    });
    resizeObserver.observe(node);

    const applyUpdate = () => {
      const activeTheme = getCurrentChartTheme();
      const updated = buildStreakTimelineOption(
        effectiveCalendar,
        effectiveLongestStreak,
        activeTheme,
        prefersReducedMotion,
      );
      chart.setOption(updated, true);
    };

    const unsubscribe = subscribeTheme(() => {
      applyUpdate();
    });

    const mutationObserver = new MutationObserver(() => {
      applyUpdate();
    });
    mutationObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme", "data-accent"],
    });

    return () => {
      unsubscribe();
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, [effectiveCalendar, effectiveLongestStreak, isEmpty, isLoading, error, filters]);

  const infoPopover = (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Ordering streak timeline information"
          className="text-muted-foreground hover:text-foreground inline-flex items-center justify-center p-0.5 rounded cursor-pointer transition-colors"
        >
          <Info className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 p-0 border-none shadow-none"
        align="start"
      >
        <StreakTimelineInfoContent />
      </PopoverContent>
    </Popover>
  );

  return (
    <ChartCard
      title={title}
      subtitle={subtitle}
      caption={effectiveCaption}
      infoPopover={infoPopover}
      isLoading={isLoading}
      isEmpty={isEmpty}
      emptyReason={emptyReason}
      error={error}
      onRetry={onRetry}
      className={className}
      tableHeaders={tableHeaders}
      tableRows={tableRows}
      tableData={tableData}
      showTable={showTable}
      onShowTableChange={onShowTableChange}
      fullscreen={fullscreen}
      onFullscreenChange={onFullscreenChange}
    >
      <div className="space-y-2">
        <div className="sr-only" aria-live="polite">
          {effectiveCaption ||
            "Timeline of daily orders highlighting the longest consecutive ordering streak."}
        </div>
        <div
          ref={containerRef}
          role="img"
          aria-label={`${title}: ${subtitle}`}
          style={{ height: 320, width: "100%" }}
        />
      </div>
    </ChartCard>
  );
}
