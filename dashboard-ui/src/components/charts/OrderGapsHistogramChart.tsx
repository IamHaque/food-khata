import * as React from "react";
import * as echarts from "echarts/core";
import { BarChart } from "echarts/charts";
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
import { QueryClientContext } from "@tanstack/react-query";

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
  computeOrderGapsTakeaway,
  computeWeightedMedianGap,
} from "@/lib/captions";
import { subscribeTheme } from "@/app/theme";
import { useFilters } from "@/app/FilterContext";
import { useSlim } from "@/hooks/api";

let echartsRegistered = false;
function registerOrderGapsHistogramModules() {
  if (echartsRegistered) return;
  echarts.use([
    BarChart,
    GridComponent,
    TooltipComponent,
    LegendComponent,
    AriaComponent,
    MarkLineComponent,
    CanvasRenderer,
  ]);
  echartsRegistered = true;
}
registerOrderGapsHistogramModules();

export interface OrderGapBinDef {
  min: number;
  max: number | null;
  label: string;
  key: string;
}

export const DEFAULT_ORDER_GAP_BINS: readonly OrderGapBinDef[] = [
  { min: 0, max: 0, label: "0 days (same day)", key: "0" },
  { min: 1, max: 1, label: "1 day", key: "1" },
  { min: 2, max: 2, label: "2 days", key: "2" },
  { min: 3, max: 3, label: "3 days", key: "3" },
  { min: 4, max: 5, label: "4–5 days", key: "4-5" },
  { min: 6, max: 7, label: "6–7 days", key: "6-7" },
  { min: 8, max: 14, label: "8–14 days", key: "8-14" },
  { min: 15, max: null, label: "15+ days", key: "15+" },
];

export interface OrderGapBucket {
  key: string;
  label: string;
  min: number;
  max: number | null;
  orders: number;
  sharePercent: number;
}

export interface RawGapItem {
  days?: number | null;
  orders?: number | null;
  count?: number | null;
}

/**
 * Pure bucketing function creating standard histogram bins covering all gap counts.
 */
export function bucketOrderGaps(
  gaps?: readonly RawGapItem[] | null,
  bins: readonly OrderGapBinDef[] = DEFAULT_ORDER_GAP_BINS,
): OrderGapBucket[] {
  const buckets: OrderGapBucket[] = bins.map((b) => ({
    key: b.key,
    label: b.label,
    min: b.min,
    max: b.max,
    orders: 0,
    sharePercent: 0,
  }));

  if (!gaps || gaps.length === 0) {
    return buckets;
  }

  let totalOrders = 0;

  for (const item of gaps) {
    if (!item) continue;
    const days = item.days;
    const count = item.orders ?? item.count;
    if (typeof days !== "number" || !Number.isFinite(days) || days < 0) continue;
    if (typeof count !== "number" || !Number.isFinite(count) || count <= 0) continue;

    const roundedDays = Math.round(days);
    let placed = false;

    for (const b of buckets) {
      if (b.max === null) {
        if (roundedDays >= b.min) {
          b.orders += count;
          totalOrders += count;
          placed = true;
          break;
        }
      } else {
        if (roundedDays >= b.min && roundedDays <= b.max) {
          b.orders += count;
          totalOrders += count;
          placed = true;
          break;
        }
      }
    }

    if (!placed && buckets.length > 0) {
      const last = buckets[buckets.length - 1];
      last.orders += count;
      totalOrders += count;
    }
  }

  for (const b of buckets) {
    b.sharePercent =
      totalOrders > 0
        ? Math.round((b.orders / totalOrders) * 1000) / 10
        : 0;
  }

  return buckets;
}

export function findBucketForGap(
  days: number,
  buckets: readonly OrderGapBucket[],
): OrderGapBucket | null {
  if (!buckets || buckets.length === 0) return null;
  for (const b of buckets) {
    if (b.max === null) {
      if (days >= b.min) return b;
    } else {
      if (days >= b.min && days <= b.max) return b;
    }
  }
  return buckets[buckets.length - 1] ?? null;
}

export function buildOrderGapsTableRows(buckets: readonly OrderGapBucket[]): {
  tableHeaders: string[];
  tableRows: Array<[string, number, string]>;
  tableData: Array<{
    "Gap bucket": string;
    Intervals: number;
    Share: string;
  }>;
} {
  const tableHeaders = ["Gap bucket", "Intervals", "Share"];
  const tableRows: Array<[string, number, string]> = buckets.map((b) => [
    b.label,
    b.orders,
    `${b.sharePercent}%`,
  ]);
  const tableData = buckets.map((b) => ({
    "Gap bucket": b.label,
    Intervals: b.orders,
    Share: `${b.sharePercent}%`,
  }));

  return { tableHeaders, tableRows, tableData };
}

export function formatOrderGapsTooltip(
  params: unknown,
  buckets: readonly OrderGapBucket[],
  median: number | null,
  theme: ChartTheme,
): string {
  if (!params) return "";
  const first = Array.isArray(params) ? params[0] : (params as { axisValueLabel?: string; name?: string; dataIndex?: number });
  if (!first) return "";

  const bucketLabel = String(first.axisValueLabel ?? first.name ?? "").trim();
  const dataIndex = typeof first.dataIndex === "number" ? first.dataIndex : -1;
  const bucket =
    dataIndex >= 0 && dataIndex < buckets.length
      ? buckets[dataIndex]
      : buckets.find((b) => b.label === bucketLabel) ?? null;

  if (!bucket) return "";

  const isMedianBucket =
    median !== null &&
    (bucket.max === null
      ? median >= bucket.min
      : median >= bucket.min && median <= bucket.max);

  const medianBadge = isMedianBucket
    ? `<div style="margin-top: 6px; padding-top: 5px; border-top: 1px dashed ${theme.border}; font-weight: 600; color: ${theme.colors[1] ?? theme.primary}; font-size: 11px;">
        📍 Median gap: ${median === 1 ? "1 day" : `${median} days`}
      </div>`
    : "";

  const intervalLabel = bucket.orders === 1 ? "interval" : "intervals";

  return `
    <div style="font-family: inherit; font-size: 12px; line-height: 1.5; min-width: 170px;">
      <div style="font-weight: 600; margin-bottom: 6px; color: ${theme.textColor}; border-bottom: 1px solid ${theme.border}; padding-bottom: 4px;">
        ${bucket.label}
      </div>
      <div style="display: flex; justify-content: space-between; gap: 14px; margin-bottom: 2px;">
        <span style="color: ${theme.mutedColor};">Order intervals:</span>
        <strong style="color: ${theme.textColor}; font-family: monospace;">${bucket.orders} (${bucket.sharePercent}%)</strong>
      </div>
      <div style="font-size: 11px; color: ${theme.mutedColor}; margin-top: 4px;">
        ${bucket.label}: ${bucket.orders} ${intervalLabel} (${bucket.sharePercent}%)
      </div>
      ${medianBadge}
    </div>
  `.trim();
}

/**
 * Derives gap counts from raw order dates if only orders are provided.
 */
export function deriveGapsFromOrders(orders?: readonly any[] | null): {
  days: number;
  orders: number;
}[] {
  if (!orders || orders.length < 2) return [];

  const timestamps: number[] = [];
  for (const o of orders) {
    if (!o) continue;
    const rawDate = o.order_date ?? o.ordered_at ?? o.date ?? o.created_at;
    if (!rawDate) continue;
    const d = new Date(rawDate);
    if (!isNaN(d.getTime())) {
      const dayStamp = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
      timestamps.push(dayStamp);
    }
  }

  if (timestamps.length < 2) return [];
  timestamps.sort((a, b) => a - b);

  const MS_PER_DAY = 86400000;
  const gapCounts = new Map<number, number>();

  for (let i = 0; i < timestamps.length - 1; i++) {
    const diffDays = Math.round((timestamps[i + 1] - timestamps[i]) / MS_PER_DAY);
    if (diffDays >= 0) {
      gapCounts.set(diffDays, (gapCounts.get(diffDays) ?? 0) + 1);
    }
  }

  const result: { days: number; orders: number }[] = [];
  for (const [days, count] of gapCounts.entries()) {
    result.push({ days, orders: count });
  }
  result.sort((a, b) => a.days - b.days);
  return result;
}

export interface BuildOrderGapsHistogramOptionParams {
  data?: readonly RawGapItem[] | null;
  gaps?: readonly RawGapItem[] | null;
  buckets?: readonly OrderGapBucket[];
  longest_gap?: number | null;
  longestGap?: number | null;
  theme?: ChartTheme;
  prefersReducedMotion?: boolean;
}

export function buildOrderGapsHistogramOption(
  dataOrParams?:
    | readonly RawGapItem[]
    | null
    | BuildOrderGapsHistogramOptionParams,
  longestGapArg?: number | null,
  themeArg?: ChartTheme,
  prefersReducedMotionArg = false,
): EChartsCoreOption {
  let gapsData: readonly RawGapItem[] | null | undefined;
  let bucketsProp: readonly OrderGapBucket[] | undefined;
  let theme: ChartTheme | undefined;
  let prefersReducedMotion = false;

  if (
    dataOrParams &&
    ("theme" in dataOrParams ||
      "gaps" in dataOrParams ||
      "buckets" in dataOrParams ||
      "longest_gap" in dataOrParams ||
      "longestGap" in dataOrParams ||
      "prefersReducedMotion" in dataOrParams)
  ) {
    const p = dataOrParams as BuildOrderGapsHistogramOptionParams;
    gapsData = p.gaps ?? p.data;
    bucketsProp = p.buckets;
    theme = p.theme;
    prefersReducedMotion = Boolean(p.prefersReducedMotion);
  } else {
    gapsData = dataOrParams as readonly RawGapItem[] | null | undefined;
    theme = themeArg;
    prefersReducedMotion = Boolean(prefersReducedMotionArg);
  }

  const currentTheme =
    theme ??
    (typeof document === "undefined"
      ? resolveChartTheme("light", "emerald")
      : getCurrentChartTheme());

  const buckets = bucketsProp ?? bucketOrderGaps(gapsData);
  const median = computeWeightedMedianGap(gapsData);

  const labels = buckets.map((b) => b.label);
  const counts = buckets.map((b) => b.orders);

  const markLineData: any[] = [];
  if (median !== null) {
    const medianBucket = findBucketForGap(median, buckets);
    if (medianBucket) {
      const medianText = median === 1 ? "1 day" : `${median} days`;
      markLineData.push({
        name: "Median",
        xAxis: medianBucket.label,
        label: {
          show: true,
          formatter: `Median: ${medianText}`,
          position: "insideEndTop",
          color: currentTheme.textColor,
          fontSize: 10,
          fontWeight: 600,
          backgroundColor: currentTheme.tooltipBg,
          borderColor: currentTheme.colors[1] ?? currentTheme.primary,
          borderWidth: 1,
          borderRadius: 4,
          padding: [3, 6],
        },
        lineStyle: {
          type: "dashed",
          color: currentTheme.colors[1] ?? currentTheme.primary,
          width: 2,
        },
      });
    }
  }

  const base = buildBaseChartOption(currentTheme, prefersReducedMotion);

  const option: EChartsCoreOption = {
    ...base,
    tooltip: {
      ...(base.tooltip as object),
      trigger: "axis",
      axisPointer: {
        type: "shadow",
      },
      formatter: (params: unknown) =>
        formatOrderGapsTooltip(params, buckets, median, currentTheme),
    },
    grid: {
      left: 55,
      right: 32,
      top: 40,
      bottom: 42,
      containLabel: true,
    },
    xAxis: {
      type: "category",
      data: labels,
      axisLabel: {
        fontSize: 10,
        color: currentTheme.mutedColor,
        interval: 0,
        rotate: labels.length > 6 ? 20 : 0,
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
      name: "Intervals",
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
        name: "Intervals",
        type: "bar",
        data: counts,
        barWidth: "70%",
        barMaxWidth: 48,
        itemStyle: {
          color: currentTheme.colors[0],
          borderRadius: [4, 4, 0, 0],
        },
        markLine: {
          silent: false,
          symbol: ["none", "none"],
          data: markLineData,
        },
        animation: !prefersReducedMotion,
        animationDuration: prefersReducedMotion ? 0 : 600,
        animationEasing: "cubicOut",
      },
    ],
  };

  return option;
}

export interface OrderGapsHistogramChartProps {
  gaps?: readonly RawGapItem[] | null;
  data?: readonly RawGapItem[] | null;
  orders?: readonly any[] | null;
  longest_gap?: number | null;
  longestGap?: number | null;
  date_unavailable_reason?: string | null;
  dateUnavailableReason?: string | null;
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

function SlimGapsFetcher({
  filters,
  children,
}: {
  filters: any;
  children: (data: {
    orders?: any[];
    isLoading: boolean;
    error: any;
  }) => React.ReactElement | null;
}) {
  const query = useSlim(filters);
  return children({
    orders: query.data?.rows,
    isLoading: query.isLoading,
    error: query.error,
  });
}

export function OrderGapsInfoContent() {
  return (
    <div className="w-80 text-xs space-y-2.5 p-3.5 bg-popover text-popover-foreground shadow-md rounded-md border border-border">
      <div>
        <p className="font-semibold text-foreground text-sm">
          Gap Between Orders
        </p>
        <p className="text-muted-foreground mt-0.5 leading-relaxed">
          Distribution of elapsed calendar days between consecutive dated orders.
        </p>
      </div>
      <div className="space-y-1.5 text-muted-foreground leading-relaxed">
        <p>
          <strong className="text-foreground">Consecutive Gaps:</strong> Orders are
          sorted chronologically by date. For each pair of consecutive orders, the
          number of days elapsed is measured.
        </p>
        <p>
          <strong className="text-foreground">Bucketing:</strong> Intervals are grouped
          into standard bins: 0 days (same day), 1 day, 2 days, 3 days, 4–5 days,
          6–7 days, 8–14 days, and 15+ days.
        </p>
        <p>
          <strong className="text-foreground">Weighted Median:</strong> The 50th
          percentile gap across all consecutive intervals is highlighted by the vertical
          dashed reference line.
        </p>
      </div>
    </div>
  );
}

function OrderGapsHistogramChartInner({
  gaps,
  data,
  orders,
  longest_gap,
  longestGap,
  date_unavailable_reason,
  dateUnavailableReason,
  isLoading,
  isEmpty: isEmptyProp,
  emptyReason,
  error,
  onRetry,
  className,
  title = "Gap between orders",
  subtitle = "Histogram of days elapsed between consecutive orders",
  caption,
  showTable,
  onShowTableChange,
  fullscreen,
  onFullscreenChange,
}: OrderGapsHistogramChartProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const chartRef = React.useRef<echarts.ECharts | null>(null);

  const unavailableReason =
    dateUnavailableReason ?? date_unavailable_reason ?? null;
  const effectiveLongestGap = longestGap ?? longest_gap ?? null;

  const rawGaps = gaps ?? data;
  const effectiveGaps = React.useMemo(() => {
    if (rawGaps && rawGaps.length > 0) return rawGaps;
    if (orders && orders.length > 0) return deriveGapsFromOrders(orders);
    return rawGaps;
  }, [rawGaps, orders]);

  const buckets = React.useMemo(
    () => bucketOrderGaps(effectiveGaps),
    [effectiveGaps],
  );

  const totalIntervals = React.useMemo(
    () => buckets.reduce((sum, b) => sum + b.orders, 0),
    [buckets],
  );

  const isEmpty =
    isEmptyProp ||
    Boolean(unavailableReason) ||
    (!isLoading && !error && (!effectiveGaps || effectiveGaps.length === 0 || totalIntervals === 0));

  const resolvedEmptyReason =
    unavailableReason ||
    emptyReason ||
    "Fewer than two dated orders available to measure gaps between orders";

  const autoCaption = React.useMemo(
    () => computeOrderGapsTakeaway(effectiveGaps, effectiveLongestGap),
    [effectiveGaps, effectiveLongestGap],
  );
  const effectiveCaption =
    caption !== undefined ? caption : autoCaption ?? undefined;

  const { tableHeaders, tableRows, tableData } = React.useMemo(
    () => buildOrderGapsTableRows(buckets),
    [buckets],
  );

  React.useEffect(() => {
    const node = containerRef.current;
    if (!node || isEmpty || isLoading || error) return;

    registerOrderGapsHistogramModules();

    if (!chartRef.current) {
      chartRef.current = echarts.init(node);
    }
    const chart = chartRef.current;

    const resizeObserver = new ResizeObserver(() => {
      if (chart && !chart.isDisposed()) {
        chart.resize();
      }
    });
    resizeObserver.observe(node);

    return () => {
      resizeObserver.disconnect();
      if (chartRef.current) {
        chartRef.current.dispose();
        chartRef.current = null;
      }
    };
  }, [isEmpty, isLoading, error]);

  React.useEffect(() => {
    const chart = chartRef.current;
    if (!chart || chart.isDisposed() || isEmpty) return;

    function applyUpdate() {
      if (!chart || chart.isDisposed()) return;
      const theme = getCurrentChartTheme();
      const prefersReducedMotion =
        typeof window !== "undefined" &&
        window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      const opt = buildOrderGapsHistogramOption({
        gaps: effectiveGaps,
        buckets,
        longest_gap: effectiveLongestGap,
        theme,
        prefersReducedMotion,
      });

      chart.setOption(opt, { notMerge: true, lazyUpdate: true });
    }

    applyUpdate();

    const unsubscribe = subscribeTheme(() => {
      applyUpdate();
    });

    const observer = new MutationObserver(() => {
      applyUpdate();
    });
    if (typeof document !== "undefined" && document.documentElement) {
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class", "data-accent"],
      });
    }

    return () => {
      unsubscribe();
      observer.disconnect();
    };
  }, [buckets, effectiveGaps, effectiveLongestGap, isEmpty]);

  const infoPopover = (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Gap between orders information"
          className="text-muted-foreground hover:text-foreground inline-flex items-center justify-center p-0.5 rounded cursor-pointer transition-colors"
        >
          <Info className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 p-0 border-none shadow-none"
        align="start"
      >
        <OrderGapsInfoContent />
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
      emptyReason={resolvedEmptyReason}
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
            "Histogram of days elapsed between consecutive orders with weighted median reference line."}
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

function useOptionalFilters() {
  try {
    return useFilters();
  } catch {
    return null;
  }
}

export function OrderGapsHistogramChart(props: OrderGapsHistogramChartProps) {
  const { gaps, data, orders } = props;
  const hasPropData =
    gaps !== undefined || data !== undefined || orders !== undefined;
  const filterContext = useOptionalFilters();
  const queryClient = React.useContext(QueryClientContext);

  if (!hasPropData && queryClient) {
    return (
      <SlimGapsFetcher filters={filterContext?.filters}>
        {({ orders: fetchedOrders, isLoading, error }) => (
          <OrderGapsHistogramChartInner
            {...props}
            orders={fetchedOrders}
            isLoading={props.isLoading ?? isLoading}
            error={props.error ?? error}
          />
        )}
      </SlimGapsFetcher>
    );
  }

  return <OrderGapsHistogramChartInner {...props} />;
}

export default OrderGapsHistogramChart;
