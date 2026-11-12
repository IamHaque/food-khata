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
import { useNavigate, useLocation } from "react-router-dom";
import { QueryClientContext } from "@tanstack/react-query";

import { ChartCard } from "@/components/dashboard/ChartCard";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  getCurrentChartTheme,
  buildBaseChartOption,
  resolveChartTheme,
  type ChartTheme,
} from "@/lib/chart-theme";
import {
  computeOrderValueDistributionTakeaway,
  formatRupees,
} from "@/lib/captions";
import { subscribeTheme } from "@/app/theme";
import { useFilters } from "@/app/FilterContext";
import { useSlim } from "@/hooks/api";

let echartsRegistered = false;
function registerOrderValueDistributionModules() {
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
registerOrderValueDistributionModules();

export interface OrderValueBinDef {
  min: number;
  max: number | null;
  label: string;
}

export const DEFAULT_ORDER_VALUE_BINS: readonly OrderValueBinDef[] = [
  { min: 0, max: 100, label: "₹0–₹100" },
  { min: 100, max: 250, label: "₹100–₹250" },
  { min: 250, max: 500, label: "₹250–₹500" },
  { min: 500, max: 750, label: "₹500–₹750" },
  { min: 750, max: 1000, label: "₹750–₹1,000" },
  { min: 1000, max: 1500, label: "₹1,000–₹1,500" },
  { min: 1500, max: 2000, label: "₹1,500–₹2,000" },
  { min: 2000, max: null, label: "₹2,000+" },
];

export interface OrderValueBucket {
  key: string;
  label: string;
  min: number;
  max: number | null;
  orders: number;
  spend: number;
  sharePercent: number;
  spendSharePercent: number;
}

export interface OrderValueStats {
  count: number;
  total: number;
  mean: number;
  median: number;
}

export interface RawOrderValueItem {
  final_amount_paid?: number | null;
  amount?: number | null;
  spend?: number | null;
  [key: string]: any;
}

export type OrderValueInputItem = number | RawOrderValueItem | null | undefined;

export function computeOrderValueStats(
  values?: readonly OrderValueInputItem[] | null,
): OrderValueStats | null {
  if (!values || values.length === 0) return null;
  const numbers: number[] = [];
  let total = 0;

  for (const item of values) {
    if (item === null || item === undefined) continue;
    const val =
      typeof item === "number"
        ? item
        : (item.final_amount_paid ?? item.amount ?? item.spend);
    if (typeof val === "number" && Number.isFinite(val) && val > 0) {
      numbers.push(val);
      total += val;
    }
  }

  if (numbers.length === 0) return null;

  numbers.sort((a, b) => a - b);
  const count = numbers.length;
  const mean = total / count;
  const median =
    count % 2 === 1
      ? numbers[Math.floor(count / 2)]
      : (numbers[count / 2 - 1] + numbers[count / 2]) / 2;

  return {
    count,
    total,
    mean,
    median,
  };
}

export function bucketOrderValues(
  values?: readonly OrderValueInputItem[] | null,
  binsOrBinSize?: readonly OrderValueBinDef[] | readonly number[] | number | null,
): OrderValueBucket[] {
  let binDefs: OrderValueBinDef[];

  if (typeof binsOrBinSize === "number" && binsOrBinSize > 0) {
    const step = binsOrBinSize;
    let maxVal = 0;
    if (values) {
      for (const item of values) {
        const val =
          typeof item === "number"
            ? item
            : (item?.final_amount_paid ?? item?.amount ?? item?.spend);
        if (typeof val === "number" && Number.isFinite(val) && val > maxVal) {
          maxVal = val;
        }
      }
    }
    const maxBound = Math.max(step * 4, Math.ceil(maxVal / step) * step);
    binDefs = [];
    for (let current = 0; current < maxBound; current += step) {
      const next = current + step;
      binDefs.push({
        min: current,
        max: next,
        label: `₹${current}–₹${next}`,
      });
    }
    binDefs.push({
      min: maxBound,
      max: null,
      label: `₹${maxBound}+`,
    });
  } else if (Array.isArray(binsOrBinSize) && binsOrBinSize.length > 0) {
    if (typeof binsOrBinSize[0] === "number") {
      const nums = (binsOrBinSize as number[])
        .filter(Number.isFinite)
        .sort((a, b) => a - b);
      binDefs = [];
      for (let i = 0; i < nums.length - 1; i++) {
        binDefs.push({
          min: nums[i],
          max: nums[i + 1],
          label: `₹${nums[i]}–₹${nums[i + 1]}`,
        });
      }
      binDefs.push({
        min: nums[nums.length - 1],
        max: null,
        label: `₹${nums[nums.length - 1]}+`,
      });
    } else {
      binDefs = binsOrBinSize as OrderValueBinDef[];
    }
  } else {
    binDefs = DEFAULT_ORDER_VALUE_BINS as OrderValueBinDef[];
  }

  const buckets: OrderValueBucket[] = binDefs.map((b) => ({
    key: `${b.min}-${b.max ?? "max"}`,
    label: b.label,
    min: b.min,
    max: b.max,
    orders: 0,
    spend: 0,
    sharePercent: 0,
    spendSharePercent: 0,
  }));

  if (!values || values.length === 0) {
    return buckets;
  }

  let totalOrders = 0;
  let totalSpend = 0;

  for (const item of values) {
    if (item === null || item === undefined) continue;
    const val =
      typeof item === "number"
        ? item
        : (item.final_amount_paid ?? item.amount ?? item.spend);
    if (typeof val !== "number" || !Number.isFinite(val) || val <= 0) continue;

    let placed = false;
    for (const b of buckets) {
      if (b.max === null) {
        if (val >= b.min) {
          b.orders++;
          b.spend += val;
          totalOrders++;
          totalSpend += val;
          placed = true;
          break;
        }
      } else {
        if (val >= b.min && val < b.max) {
          b.orders++;
          b.spend += val;
          totalOrders++;
          totalSpend += val;
          placed = true;
          break;
        }
      }
    }
    if (!placed && buckets.length > 0) {
      const last = buckets[buckets.length - 1];
      last.orders++;
      last.spend += val;
      totalOrders++;
      totalSpend += val;
    }
  }

  for (const b of buckets) {
    b.sharePercent =
      totalOrders > 0
        ? Math.round((b.orders / totalOrders) * 1000) / 10
        : 0;
    b.spendSharePercent =
      totalSpend > 0
        ? Math.round((b.spend / totalSpend) * 1000) / 10
        : 0;
  }

  return buckets;
}

export function findBucketForValue(
  value: number,
  buckets: readonly OrderValueBucket[],
): OrderValueBucket | null {
  if (!buckets || buckets.length === 0) return null;
  for (const b of buckets) {
    if (b.max === null) {
      if (value >= b.min) return b;
    } else {
      if (value >= b.min && value < b.max) return b;
    }
  }
  return buckets[buckets.length - 1] ?? null;
}

export function formatOrderValueDistributionTooltip(
  params: unknown,
  buckets: readonly OrderValueBucket[],
  stats: OrderValueStats | null,
  theme: ChartTheme,
): string {
  if (!params) return "";
  const first = Array.isArray(params) ? params[0] : (params as any);
  if (!first) return "";

  const bucketLabel = String(first.axisValueLabel ?? first.name ?? "").trim();
  const dataIndex = typeof first.dataIndex === "number" ? first.dataIndex : -1;
  const bucket =
    dataIndex >= 0 && dataIndex < buckets.length
      ? buckets[dataIndex]
      : buckets.find((b) => b.label === bucketLabel) ?? null;

  if (!bucket) return "";

  const meanBucket = stats ? findBucketForValue(stats.mean, buckets) : null;
  const medianBucket = stats ? findBucketForValue(stats.median, buckets) : null;

  const containsMean = meanBucket && meanBucket.label === bucket.label;
  const containsMedian = medianBucket && medianBucket.label === bucket.label;

  const annotations: string[] = [];
  if (containsMean && stats) {
    annotations.push(`🎯 Mean: ${formatRupees(Math.round(stats.mean))}`);
  }
  if (containsMedian && stats) {
    annotations.push(`📍 Median: ${formatRupees(Math.round(stats.median))}`);
  }

  const annotationSection =
    annotations.length > 0
      ? `<div style="margin-top: 6px; padding-top: 5px; border-top: 1px dashed ${theme.border}; font-weight: 600; color: ${theme.primary}; font-size: 11px;">
          ${annotations.join(" &nbsp;|&nbsp; ")}
        </div>`
      : "";

  const avgOrderValue =
    bucket.orders > 0 ? Math.round(bucket.spend / bucket.orders) : 0;

  return `
    <div style="font-family: inherit; font-size: 12px; line-height: 1.5; min-width: 190px;">
      <div style="font-weight: 600; margin-bottom: 6px; color: ${theme.textColor}; border-bottom: 1px solid ${theme.border}; padding-bottom: 4px;">
        ${bucket.label}
      </div>
      <div style="display: flex; justify-content: space-between; gap: 14px; margin-bottom: 4px;">
        <span style="color: ${theme.mutedColor};">Orders:</span>
        <strong style="color: ${theme.textColor}; font-family: monospace;">${bucket.orders} (${bucket.sharePercent}%)</strong>
      </div>
      <div style="display: flex; justify-content: space-between; gap: 14px; margin-bottom: 4px;">
        <span style="color: ${theme.mutedColor};">Spend:</span>
        <strong style="color: ${theme.textColor}; font-family: monospace;">${formatRupees(bucket.spend)} (${bucket.spendSharePercent}%)</strong>
      </div>
      ${
        bucket.orders > 0
          ? `<div style="display: flex; justify-content: space-between; gap: 14px; margin-bottom: 4px;">
              <span style="color: ${theme.mutedColor};">Avg ticket:</span>
              <strong style="color: ${theme.textColor}; font-family: monospace;">${formatRupees(avgOrderValue)}</strong>
            </div>`
          : ""
      }
      ${annotationSection}
      <div style="margin-top: 6px; font-size: 10px; color: ${theme.mutedColor}; font-style: italic;">
        Click bar to filter orders by this range
      </div>
    </div>
  `.trim();
}

export interface BuildOrderValueDistributionOptionParams {
  orders?: readonly OrderValueInputItem[] | null;
  buckets?: readonly OrderValueBucket[];
  stats?: OrderValueStats | null;
  bins?: readonly OrderValueBinDef[] | readonly number[] | number | null;
  theme?: ChartTheme;
  prefersReducedMotion?: boolean;
}

export function buildOrderValueDistributionOption({
  orders,
  buckets: bucketsProp,
  stats: statsProp,
  bins,
  theme,
  prefersReducedMotion = false,
}: BuildOrderValueDistributionOptionParams): EChartsCoreOption {
  const currentTheme =
    theme ??
    (typeof document === "undefined"
      ? resolveChartTheme("light", "emerald")
      : getCurrentChartTheme());

  const buckets = bucketsProp ?? bucketOrderValues(orders, bins);
  const stats = statsProp !== undefined ? statsProp : computeOrderValueStats(orders);

  const labels = buckets.map((b) => b.label);
  const counts = buckets.map((b) => b.orders);

  const markLineData: any[] = [];
  if (stats && stats.count > 0) {
    const meanBucket = findBucketForValue(stats.mean, buckets);
    const medianBucket = findBucketForValue(stats.median, buckets);

    if (meanBucket) {
      markLineData.push({
        name: "Mean",
        xAxis: meanBucket.label,
        label: {
          show: true,
          formatter: `Mean: ${formatRupees(Math.round(stats.mean))}`,
          position: "insideEndTop",
          color: currentTheme.textColor,
          fontSize: 11,
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

    if (medianBucket) {
      markLineData.push({
        name: "Median",
        xAxis: medianBucket.label,
        label: {
          show: true,
          formatter: `Median: ${formatRupees(Math.round(stats.median))}`,
          position: "insideEndBottom",
          color: currentTheme.textColor,
          fontSize: 11,
          fontWeight: 600,
          backgroundColor: currentTheme.tooltipBg,
          borderColor: currentTheme.colors[2] ?? currentTheme.colors[0],
          borderWidth: 1,
          borderRadius: 4,
          padding: [3, 6],
        },
        lineStyle: {
          type: "dotted",
          color: currentTheme.colors[2] ?? currentTheme.colors[0],
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
        formatOrderValueDistributionTooltip(params, buckets, stats, currentTheme),
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
        fontSize: 11,
        color: currentTheme.mutedColor,
        interval: 0,
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
        name: "Orders",
        type: "bar",
        data: counts,
        barMaxWidth: 44,
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

export interface OrderValueDistributionChartProps {
  orders?: readonly OrderValueInputItem[] | null;
  data?: readonly OrderValueInputItem[] | null;
  aov_histogram?: readonly { key: string; orders: number }[] | null;
  bins?: readonly OrderValueBinDef[] | readonly number[] | number | null;
  binSize?: number;
  isLoading?: boolean;
  isEmpty?: boolean;
  emptyReason?: string;
  error?: Error | string | null;
  onRetry?: () => void;
  className?: string;
  title?: string;
  subtitle?: string;
  caption?: string;
  onBucketClick?: (bucket: OrderValueBucket) => void;
  showTable?: boolean;
  onShowTableChange?: (value: boolean) => void;
  fullscreen?: boolean;
  onFullscreenChange?: (value: boolean) => void;
}

function useOptionalNavigate() {
  try {
    return useNavigate();
  } catch {
    return null;
  }
}

function useOptionalLocation() {
  try {
    return useLocation();
  } catch {
    return null;
  }
}

function useOptionalFilters() {
  try {
    return useFilters();
  } catch {
    return null;
  }
}

function SlimOrdersFetcher({
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

function OrderValueDistributionChartInner({
  orders,
  data,
  aov_histogram,
  bins,
  binSize,
  isLoading,
  isEmpty: isEmptyProp,
  emptyReason = "No order value distribution data available for the current selection.",
  error,
  onRetry,
  className,
  title = "Order value distribution",
  subtitle = "Histogram of order sizes with mean and median reference lines",
  caption,
  onBucketClick,
  showTable,
  onShowTableChange,
  fullscreen,
  onFullscreenChange,
}: OrderValueDistributionChartProps) {
  const navigate = useOptionalNavigate();
  const location = useOptionalLocation();
  const filterContext = useOptionalFilters();

  const containerRef = React.useRef<HTMLDivElement>(null);
  const chartRef = React.useRef<echarts.ECharts | null>(null);

  const rawValues = orders ?? data;
  const effectiveBins = binSize ?? bins;

  const buckets = React.useMemo(() => {
    if (rawValues && rawValues.length > 0) {
      return bucketOrderValues(rawValues, effectiveBins);
    }
    if (aov_histogram && aov_histogram.length > 0) {
      // The API sends each bin's lower bound as its key; a bin ends where the next one starts.
      return aov_histogram.map((item, i) => {
        const min = Number(item.key) || 0;
        const next = aov_histogram[i + 1];
        const max = next ? Number(next.key) || null : null;
        const label =
          max !== null ? `₹${min}–₹${max}` : `₹${min}+`;
        return {
          key: item.key,
          label,
          min,
          max,
          orders: item.orders,
          spend: 0,
          sharePercent: 0,
          spendSharePercent: 0,
        };
      });
    }
    return bucketOrderValues([], effectiveBins);
  }, [rawValues, aov_histogram, effectiveBins]);

  const stats = React.useMemo(
    () => computeOrderValueStats(rawValues),
    [rawValues],
  );

  const totalOrders = React.useMemo(
    () => buckets.reduce((sum, b) => sum + b.orders, 0),
    [buckets],
  );

  const isEmpty =
    isEmptyProp ||
    (!isLoading && !error && totalOrders === 0);

  const autoCaption = React.useMemo(
    () => computeOrderValueDistributionTakeaway(rawValues),
    [rawValues],
  );
  const effectiveCaption =
    caption !== undefined ? caption : autoCaption ?? undefined;

  const handleBucketClick = React.useCallback(
    (bucket: OrderValueBucket) => {
      if (onBucketClick) {
        onBucketClick(bucket);
        return;
      }

      if (filterContext?.update) {
        filterContext.update({
          amount_min: bucket.min,
          amount_max: bucket.max !== null ? bucket.max : null,
        });
      } else if (navigate) {
        const search = location?.search ?? "";
        const params = new URLSearchParams(search);
        params.set("amount_min", String(bucket.min));
        if (bucket.max !== null) {
          params.set("amount_max", String(bucket.max));
        } else {
          params.delete("amount_max");
        }
        const searchStr = params.toString();
        navigate({
          pathname: "/orders",
          search: searchStr ? `?${searchStr}` : "",
        });
      }
    },
    [onBucketClick, filterContext, navigate, location],
  );

  const tableData = React.useMemo(() => {
    if (isEmpty || buckets.length === 0) return undefined;
    return buckets.map((b) => ({
      Bucket: b.label,
      Orders: b.orders,
      "Share (%)": b.sharePercent,
      Spend: formatRupees(b.spend),
    }));
  }, [isEmpty, buckets]);

  React.useEffect(() => {
    const node = containerRef.current;
    if (!node || isEmpty || isLoading || error) return;

    registerOrderValueDistributionModules();

    if (!chartRef.current) {
      chartRef.current = echarts.init(node);
    }
    const chart = chartRef.current;

    const handleClick = (params: any) => {
      const bucketLabel = params?.name ?? params?.axisValueLabel ?? params?.axisValue;
      const dataIndex =
        typeof params?.dataIndex === "number" ? params.dataIndex : -1;
      const bucket =
        dataIndex >= 0 && dataIndex < buckets.length
          ? buckets[dataIndex]
          : buckets.find((b) => b.label === String(bucketLabel)) ?? null;

      if (bucket) {
        handleBucketClick(bucket);
      }
    };

    chart.on("click", handleClick);

    const resizeObserver = new ResizeObserver(() => {
      if (chart && !chart.isDisposed()) {
        chart.resize();
      }
    });
    resizeObserver.observe(node);

    return () => {
      chart.off("click", handleClick);
      resizeObserver.disconnect();
      if (chartRef.current) {
        chartRef.current.dispose();
        chartRef.current = null;
      }
    };
  }, [isEmpty, isLoading, error, buckets, handleBucketClick]);

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

      const opt = buildOrderValueDistributionOption({
        buckets,
        stats,
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
  }, [buckets, stats, isEmpty]);

  const infoPopover = (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Order value distribution information"
          className="text-muted-foreground hover:text-foreground inline-flex items-center justify-center p-0.5 rounded cursor-pointer transition-colors"
        >
          <Info className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 text-xs space-y-2.5 p-3.5 bg-popover text-popover-foreground shadow-md rounded-md border border-border"
        align="start"
      >
        <div>
          <p className="font-semibold text-foreground text-sm">
            Order Value Distribution
          </p>
          <p className="text-muted-foreground mt-0.5 leading-relaxed">
            Histogram of order ticket sizes grouped into discrete value brackets.
          </p>
        </div>
        <div className="space-y-1.5 text-muted-foreground leading-relaxed">
          <p>
            <strong className="text-foreground">Bucketing:</strong> Orders are
            categorized by final amount paid into discrete ranges (e.g. ₹0–₹100,
            ₹100–₹250, up to ₹2,000+).
          </p>
          <p>
            <strong className="text-foreground">Mean &amp; Median:</strong>{" "}
            Vertical dashed reference lines highlight the average (Mean) and 50th
            percentile (Median) order amounts with clear callouts.
          </p>
          <p>
            <strong className="text-foreground">Click to Filter:</strong>{" "}
            Clicking any histogram bar sets the active filter range (amount_min
            and amount_max) to that bucket&apos;s lower and upper bounds.
          </p>
        </div>
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
      tableData={tableData}
      showTable={showTable}
      onShowTableChange={onShowTableChange}
      fullscreen={fullscreen}
      onFullscreenChange={onFullscreenChange}
    >
      <div className="space-y-2">
        <div className="sr-only" aria-live="polite">
          {effectiveCaption ||
            "Order value distribution histogram with mean and median reference lines."}
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

export function OrderValueDistributionChart(
  props: OrderValueDistributionChartProps,
) {
  const { orders, data, aov_histogram } = props;
  const hasPropData =
    orders !== undefined || data !== undefined || aov_histogram !== undefined;
  const filterContext = useOptionalFilters();
  const queryClient = React.useContext(QueryClientContext);

  if (!hasPropData && queryClient) {
    return (
      <SlimOrdersFetcher filters={filterContext?.filters}>
        {({ orders: fetchedOrders, isLoading, error }) => (
          <OrderValueDistributionChartInner
            {...props}
            orders={fetchedOrders}
            isLoading={props.isLoading ?? isLoading}
            error={props.error ?? error}
          />
        )}
      </SlimOrdersFetcher>
    );
  }

  return <OrderValueDistributionChartInner {...props} />;
}

export default OrderValueDistributionChart;
