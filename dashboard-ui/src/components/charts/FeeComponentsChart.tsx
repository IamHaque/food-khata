import * as React from "react";
import * as echarts from "echarts/core";
import { LineChart, type LineSeriesOption } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  AriaComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsCoreOption } from "echarts/core";
import { Info } from "lucide-react";

import { ChartCard } from "../dashboard/ChartCard";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import {
  getCurrentChartTheme,
  buildBaseChartOption,
  resolveChartTheme,
  type ChartTheme,
} from "../../lib/chart-theme";
import {
  computeFeeComponentsTakeaway,
  formatRupees,
  type FeeComponentItemLike,
} from "../../lib/captions";
import { subscribeTheme } from "../../app/theme";
import { useFilters } from "../../app/FilterContext";
import {
  registerChart,
  emitHighlight,
  emitClear,
  isDimensionMatch,
} from "../../lib/highlight-bus";

export interface FeeComponentsDatum extends FeeComponentItemLike {
  month?: string | null;
  order_count?: number;
  net_delivery?: number;
  packaging?: number;
  platform?: number;
  tax?: number;
  total_fees?: number;
  rounding_adjustment?: number;
}

export interface BuildFeeComponentsOptionParams {
  data?: readonly FeeComponentsDatum[] | null;
  theme?: ChartTheme;
  prefersReducedMotion?: boolean;
  selectedSeries?: string[] | Record<string, boolean>;
}

export interface FeeComponentsChartProps {
  data?: readonly FeeComponentsDatum[] | null;
  isLoading?: boolean;
  isEmpty?: boolean;
  emptyReason?: string;
  error?: Error | string | null;
  onRetry?: () => void;
  className?: string;
  title?: string;
  subtitle?: string;
  caption?: string;
  onMonthClick?: (month: string) => void;
  selectedSeries?: string[] | Record<string, boolean>;
  showTable?: boolean;
  onShowTableChange?: (value: boolean) => void;
  fullscreen?: boolean;
  onFullscreenChange?: (value: boolean) => void;
}

export const FEE_COMPONENTS_SERIES_CONFIG = [
  { key: "net_delivery", name: "Net delivery", symbol: "circle" },
  { key: "packaging", name: "Packaging", symbol: "rect" },
  { key: "platform", name: "Platform", symbol: "triangle" },
  { key: "tax", name: "Tax", symbol: "diamond" },
] as const;

let echartsRegistered = false;
function registerFeeComponentsModules() {
  if (echartsRegistered) return;
  echarts.use([
    LineChart,
    GridComponent,
    TooltipComponent,
    LegendComponent,
    AriaComponent,
    CanvasRenderer,
  ]);
  echartsRegistered = true;
}
registerFeeComponentsModules();

function useOptionalFilters() {
  try {
    return useFilters();
  } catch {
    return null;
  }
}

function isSeriesSelected(
  seriesName: string,
  selectedSeries?: string[] | Record<string, boolean>
): boolean {
  if (!selectedSeries) return true;
  if (Array.isArray(selectedSeries)) {
    return selectedSeries.some((s) => {
      const a = s.trim().toLowerCase();
      const b = seriesName.trim().toLowerCase();
      return (
        a === b ||
        (b === "platform" && (a === "platform fee" || a === "platform fees")) ||
        (b === "net delivery" && (a === "delivery" || a === "delivery fee"))
      );
    });
  }
  const match = Object.entries(selectedSeries).find(([key]) => {
    const a = key.trim().toLowerCase();
    const b = seriesName.trim().toLowerCase();
    return (
      a === b ||
      (b === "platform" && (a === "platform fee" || a === "platform fees")) ||
      (b === "net delivery" && (a === "delivery" || a === "delivery fee"))
    );
  });
  if (match) {
    return Boolean(match[1]);
  }
  return false;
}

export function formatFeeComponentsTooltip(
  params: unknown,
  theme: ChartTheme,
): string {
  if (!Array.isArray(params) || params.length === 0) return "";

  const validItems = (params as any[]).filter(
    (p) => p && typeof p.value === "number" && !isNaN(p.value) && p.value >= 0
  );

  if (validItems.length === 0) {
    const first = params[0] as any;
    const header = first?.axisValueLabel ?? first?.name ?? "Fee components";
    return `
      <div style="font-family: inherit; font-size: 12px; line-height: 1.5; min-width: 160px;">
        <div style="font-weight: 600; margin-bottom: 4px; color: ${theme.textColor};">
          ${header}
        </div>
        <div style="color: ${theme.mutedColor}; font-size: 11px;">No active fee components</div>
      </div>
    `.trim();
  }

  const first = validItems[0];
  const header = first?.axisValueLabel ?? first?.name ?? "Fee components";
  const total = validItems.reduce((sum, p) => sum + (p.value || 0), 0);

  const lines = validItems.map((p) => {
    const color = p.color || theme.colors[0];
    const val = p.value || 0;
    const sharePct = total > 0 ? Math.round((val / total) * 100) : 0;
    return `
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 4px;">
        <div style="display: flex; align-items: center; gap: 6px;">
          <span style="display: inline-block; width: 8px; height: 8px; border-radius: 2px; background-color: ${color};"></span>
          <span style="color: ${theme.textColor}; font-weight: 500;">${p.seriesName}:</span>
        </div>
        <div style="display: flex; align-items: center; gap: 6px;">
          <span style="font-weight: 600; color: ${theme.textColor};">${formatRupees(val)}</span>
          <span style="color: ${theme.mutedColor}; font-size: 11px;">(${sharePct}% of total fees)</span>
        </div>
      </div>
    `.trim();
  });

  return `
    <div style="font-family: inherit; font-size: 12px; line-height: 1.5; min-width: 220px;">
      <div style="font-weight: 600; margin-bottom: 8px; color: ${theme.textColor}; border-bottom: 1px solid ${theme.border}; padding-bottom: 4px;">
        ${header}
      </div>
      <div style="margin-bottom: 8px;">
        ${lines.join("")}
      </div>
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 16px; border-top: 1px solid ${theme.border}; padding-top: 6px; font-weight: 700;">
        <span style="color: ${theme.textColor};">Total fees + tax:</span>
        <span style="color: ${theme.textColor};">${formatRupees(total)}</span>
      </div>
    </div>
  `.trim();
}

/**
 * Pure option builder (CC-11):
 * Data in, ECharts Core Option out.
 */
export function buildFeeComponentsOption({
  data,
  theme,
  prefersReducedMotion = false,
  selectedSeries,
}: BuildFeeComponentsOptionParams): EChartsCoreOption {
  const currentTheme = theme ?? resolveChartTheme("light", "emerald");
  const items = data ?? [];

  const categories = items.map((d) => d.month ?? "Unknown");

  const series: LineSeriesOption[] = FEE_COMPONENTS_SERIES_CONFIG.map((cfg, index) => {
    const color = currentTheme.colors[index % currentTheme.colors.length];
    const seriesData = items.map((d) => {
      const val = d[cfg.key];
      return Number.isFinite(val) && val !== undefined && val !== null ? (val as number) : 0;
    });

    return {
      name: cfg.name,
      type: "line",
      stack: "fees",
      areaStyle: {
        opacity: 0.6,
      },
      symbol: cfg.symbol,
      symbolSize: 6,
      itemStyle: {
        color,
      },
      lineStyle: {
        color,
        width: 2,
      },
      emphasis: {
        focus: "series",
      },
      data: seriesData,
      animationDelay: (idx: number) => (prefersReducedMotion ? 0 : idx * 50 + index * 40),
    };
  });

  const baseOption = buildBaseChartOption(currentTheme, prefersReducedMotion);

  return {
    ...baseOption,
    aria: {
      enabled: true,
      decal: { show: true },
    },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "line" },
      backgroundColor: currentTheme.tooltipBg,
      borderColor: currentTheme.tooltipBorder,
      textStyle: {
        color: currentTheme.tooltipText,
        fontSize: 12,
        fontFamily: '"Inter Variable", sans-serif',
      },
      formatter: (params: unknown) => formatFeeComponentsTooltip(params, currentTheme),
    },
    legend: {
      show: true,
      top: 8,
      left: "center",
      textStyle: {
        color: currentTheme.mutedColor,
        fontSize: 11,
        fontFamily: '"Inter Variable", sans-serif',
      },
      icon: "roundRect",
      data: FEE_COMPONENTS_SERIES_CONFIG.map((c) => c.name),
      selected: selectedSeries
        ? FEE_COMPONENTS_SERIES_CONFIG.reduce<Record<string, boolean>>((acc, c) => {
            acc[c.name] = isSeriesSelected(c.name, selectedSeries);
            return acc;
          }, {})
        : undefined,
    },
    grid: {
      left: 16,
      right: 16,
      top: 48,
      bottom: 28,
      containLabel: true,
    },
    xAxis: {
      type: "category",
      data: categories,
      boundaryGap: false,
      axisLabel: {
        color: currentTheme.mutedColor,
        fontSize: 11,
        fontFamily: '"Inter Variable", sans-serif',
        interval: 0,
        rotate: categories.length > 6 ? 30 : 0,
      },
      axisLine: {
        lineStyle: {
          color: currentTheme.axisLine,
        },
      },
      axisTick: {
        alignWithLabel: true,
      },
    },
    yAxis: {
      type: "value",
      axisLabel: {
        color: currentTheme.mutedColor,
        fontSize: 10,
        fontFamily: '"Inter Variable", sans-serif',
        formatter: (val: number) => formatRupees(val),
      },
      splitLine: {
        lineStyle: {
          color: currentTheme.splitLine,
        },
      },
    },
    series,
    animation: !prefersReducedMotion,
    animationDuration: prefersReducedMotion ? 0 : 600,
    animationDurationUpdate: prefersReducedMotion ? 0 : 250,
    animationEasing: "cubicOut",
  };
}

export function FeeComponentsChart({
  data,
  isLoading,
  isEmpty: isEmptyProp,
  emptyReason,
  error,
  onRetry,
  className,
  title = "Monthly fee components",
  subtitle = "Breakdown of delivery, packaging, platform, and tax charges",
  caption: captionProp,
  onMonthClick,
  selectedSeries,
  showTable,
  onShowTableChange,
  fullscreen,
  onFullscreenChange,
}: FeeComponentsChartProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const chartRef = React.useRef<echarts.ECharts | null>(null);
  const filterContext = useOptionalFilters();

  const idRef = React.useRef<string | null>(null);
  if (!idRef.current) {
    idRef.current = `fee-components-chart-${Math.random().toString(36).slice(2, 9)}`;
  }
  const chartId = idRef.current;

  const totalFeeSum = React.useMemo(() => {
    return (data ?? []).reduce((sum, d) => {
      const netDelivery = Number.isFinite(d.net_delivery) ? d.net_delivery! : 0;
      const packaging = Number.isFinite(d.packaging) ? d.packaging! : 0;
      const platform = Number.isFinite(d.platform) ? d.platform! : 0;
      const tax = Number.isFinite(d.tax) ? d.tax! : 0;
      return sum + netDelivery + packaging + platform + tax;
    }, 0);
  }, [data]);

  const computedCaption = React.useMemo(() => {
    return (
      captionProp ??
      (computeFeeComponentsTakeaway(data) ?? undefined)
    );
  }, [captionProp, data]);

  const isEmpty =
    isEmptyProp ?? (!isLoading && (!data || data.length === 0 || totalFeeSum === 0));
  const resolvedEmptyReason =
    emptyReason ?? "No fee components data available for the selected filters";

  const tableData = React.useMemo(() => {
    if (!data || data.length === 0) return undefined;
    return data.map((d) => {
      const netDelivery = Number.isFinite(d.net_delivery) ? d.net_delivery! : 0;
      const packaging = Number.isFinite(d.packaging) ? d.packaging! : 0;
      const platform = Number.isFinite(d.platform) ? d.platform! : 0;
      const tax = Number.isFinite(d.tax) ? d.tax! : 0;
      const totalFees =
        d.total_fees !== undefined && Number.isFinite(d.total_fees)
          ? d.total_fees
          : netDelivery + packaging + platform + tax;

      return {
        Month: d.month ?? "Unknown",
        "Net delivery": netDelivery,
        Packaging: packaging,
        Platform: platform,
        Tax: tax,
        "Total fees": totalFees,
      };
    });
  }, [data]);

  const ariaDescription = React.useMemo(() => {
    if (!data || data.length === 0 || totalFeeSum === 0) {
      return "Monthly fee components chart with no data";
    }
    return `Monthly fee components stacked area chart showing breakdown of delivery, packaging, platform, and tax charges across ${data.length} months with total fees of ${formatRupees(totalFeeSum)}.`;
  }, [data, totalFeeSum]);

  const callbacksRef = React.useRef({ onMonthClick, filterContext, data });
  callbacksRef.current = { onMonthClick, filterContext, data };

  const dataRef = React.useRef({ data, selectedSeries });
  dataRef.current = { data, selectedSeries };

  const applyUpdate = React.useCallback(() => {
    const node = containerRef.current;
    if (!node) return;
    if (!chartRef.current || chartRef.current.isDisposed()) {
      chartRef.current = echarts.init(node);
    }
    const chart = chartRef.current;
    const theme = getCurrentChartTheme();
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const opt = buildFeeComponentsOption({
      data: dataRef.current.data,
      theme,
      prefersReducedMotion,
      selectedSeries: dataRef.current.selectedSeries,
    });

    chart.setOption(opt, { notMerge: true, lazyUpdate: true });
  }, []);

  React.useEffect(() => {
    const node = containerRef.current;
    if (!node || isEmpty || isLoading || error) return;

    registerFeeComponentsModules();

    if (!chartRef.current || chartRef.current.isDisposed()) {
      chartRef.current = echarts.init(node);
    }
    const chart = chartRef.current;

    const unregister = registerChart(chartId, chart, {
      dimension: "month",
      matcher: (dim, val) => {
        if (dim !== "month") return false;
        const currentData = callbacksRef.current.data ?? [];
        const months = currentData.map((d) => d.month ?? "Unknown");
        const matchIdx = months.findIndex((m) => isDimensionMatch("month", m, val));
        if (matchIdx >= 0) {
          return { type: "highlight", dataIndex: matchIdx };
        }
        return undefined;
      },
    });

    const handleOver = (params: any) => {
      const currentData = callbacksRef.current.data ?? [];
      const months = currentData.map((d) => d.month ?? "Unknown");
      let month = params?.name ?? params?.axisValueLabel ?? params?.axisValue;
      if (!month && typeof params?.dataIndex === "number" && months[params.dataIndex]) {
        month = months[params.dataIndex];
      }
      if (month) {
        emitHighlight(chartId, "month", String(month));
      }
    };
    const handleOut = () => emitClear(chartId);

    chart.on("mouseover", handleOver);
    chart.on("mouseout", handleOut);

    const handleMouseLeave = () => emitClear(chartId);
    node.addEventListener("mouseleave", handleMouseLeave);

    const handleClick = (params: any) => {
      const currentData = callbacksRef.current.data ?? [];
      const months = currentData.map((d) => d.month ?? "Unknown");
      let month = params?.name ?? params?.axisValueLabel ?? params?.axisValue;
      if (!month && typeof params?.dataIndex === "number" && months[params.dataIndex]) {
        month = months[params.dataIndex];
      }
      if (month) {
        if (callbacksRef.current.onMonthClick) {
          callbacksRef.current.onMonthClick(String(month));
        } else if (callbacksRef.current.filterContext?.applyCrossFilter) {
          callbacksRef.current.filterContext.applyCrossFilter("month", String(month));
        }
      }
    };
    chart.on("click", handleClick);

    const resizeObserver = new ResizeObserver(() => {
      if (chart && !chart.isDisposed()) {
        chart.resize();
      }
    });
    resizeObserver.observe(node);

    applyUpdate();

    return () => {
      chart.off("click", handleClick);
      chart.off("mouseover", handleOver);
      chart.off("mouseout", handleOut);
      node.removeEventListener("mouseleave", handleMouseLeave);
      unregister();
      resizeObserver.disconnect();
      if (chartRef.current) {
        chartRef.current.dispose();
        chartRef.current = null;
      }
    };
  }, [isEmpty, isLoading, error, chartId, applyUpdate]);

  React.useEffect(() => {
    if (isEmpty || isLoading || error) return;
    applyUpdate();

    const unsubscribe = subscribeTheme(() => {
      applyUpdate();
    });

    return () => {
      unsubscribe();
    };
  }, [isEmpty, isLoading, error, data, selectedSeries, applyUpdate]);

  const infoPopover = (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Fee components information"
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
          <p className="font-semibold text-foreground text-sm">Monthly Fee Components</p>
          <p className="text-muted-foreground mt-0.5 leading-relaxed">
            Consolidated breakdown of net delivery, packaging, platform fees, and government taxes across months for complete billing transparency.
          </p>
        </div>
        <div className="space-y-1.5 pt-1 border-t border-border/50">
          <p className="font-medium text-foreground">Stacked Area View</p>
          <p className="text-muted-foreground leading-relaxed">
            Area series stack to display cumulative monthly fee overhead, showing how each charge layer contributes to total order overhead.
          </p>
        </div>
        <div className="space-y-1.5 pt-1 border-t border-border/50">
          <p className="font-medium text-foreground">Component Share & Taxes</p>
          <p className="text-muted-foreground leading-relaxed">
            Hover any month to inspect each component's exact rupee amount and percentage share of total monthly fees, with computed total fees and taxes.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );

  return (
    <ChartCard
      title={title}
      subtitle={subtitle}
      caption={computedCaption}
      infoPopover={infoPopover}
      isLoading={isLoading}
      isEmpty={isEmpty}
      emptyReason={resolvedEmptyReason}
      error={error}
      onRetry={onRetry}
      tableData={tableData}
      showTable={showTable}
      onShowTableChange={onShowTableChange}
      fullscreen={fullscreen}
      onFullscreenChange={onFullscreenChange}
      className={className}
    >
      <div
        ref={containerRef}
        role="img"
        aria-label={title}
        aria-description={ariaDescription}
        style={{ height: 320, width: "100%" }}
      />
    </ChartCard>
  );
}

export default FeeComponentsChart;
