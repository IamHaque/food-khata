import { getPatterns } from "../../app/theme";
import * as React from "react";
import { compactInr, swatchBg } from "../../lib/chart-kit";
import * as echarts from "echarts/core";
import { BarChart, type BarSeriesOption } from "echarts/charts";
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
  computeDiscountBreakdownTakeaway,
  formatRupees,
  type DiscountItemLike,
} from "../../lib/captions";
import { subscribeTheme } from "../../app/theme";

export interface DiscountBreakdownItem {
  label: string;
  amount: number;
  month?: string;
}

export interface BuildDiscountBreakdownOptionParams {
  data?: readonly DiscountBreakdownItem[] | null;
  theme?: ChartTheme;
  prefersReducedMotion?: boolean;
  selectedTypes?: string[];
}

export interface DiscountBreakdownChartProps {
  data?: readonly DiscountBreakdownItem[] | null;
  isLoading?: boolean;
  isEmpty?: boolean;
  emptyReason?: string;
  error?: Error | string | null;
  onRetry?: () => void;
  className?: string;
  title?: string;
  subtitle?: string;
  caption?: string;
  onBarClick?: (item: DiscountBreakdownItem) => void;
  showTable?: boolean;
  onShowTableChange?: (value: boolean) => void;
  fullscreen?: boolean;
  onFullscreenChange?: (value: boolean) => void;
}

let echartsRegistered = false;
function registerDiscountModules() {
  if (echartsRegistered) return;
  echarts.use([
    BarChart,
    GridComponent,
    TooltipComponent,
    LegendComponent,
    AriaComponent,
    CanvasRenderer,
  ]);
  echartsRegistered = true;
}
registerDiscountModules();

export function formatDiscountTooltip(
  params: unknown,
  theme: ChartTheme,
): string {
  if (!Array.isArray(params) || params.length === 0) return "";

  // Filter out series that have no value or are non-positive
  const validItems = (params as any[]).filter(
    (p) => p && typeof p.value === "number" && !isNaN(p.value) && p.value > 0
  );

  if (validItems.length === 0) {
    const first = params[0] as any;
    const header = first?.axisValueLabel ?? first?.name ?? "Discounts";
    return `
      <div style="font-family: inherit; font-size: 12px; line-height: 1.5; min-width: 160px;">
        <div style="font-weight: 600; margin-bottom: 4px; color: ${theme.textColor};">
          ${header}
        </div>
        <div style="color: ${theme.mutedColor}; font-size: 11px;">No active discounts</div>
      </div>
    `.trim();
  }

  const first = validItems[0];
  const header = first?.axisValueLabel ?? first?.name ?? "Discounts";
  const total = validItems.reduce((sum, p) => sum + (p.value || 0), 0);

  const lines = validItems.map((p) => {
    const color = p.color || theme.colors[0];
    const val = p.value || 0;
    const share = total > 0 ? `${((val / total) * 100).toFixed(1)}%` : "0%";
    return `
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 4px;">
        <div style="display: flex; align-items: center; gap: 6px;">
          <span style="display: inline-block; width: 8px; height: 8px; border-radius: 2px; ${swatchBg(color)}"></span>
          <span style="color: ${theme.textColor}; font-weight: 500;">${p.seriesName}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="color: ${theme.mutedColor}; font-size: 11px;">(${share})</span>
          <span style="font-weight: 600; color: ${theme.textColor};">${formatRupees(val)}</span>
        </div>
      </div>
    `.trim();
  });

  return `
    <div style="font-family: inherit; font-size: 12px; line-height: 1.5; min-width: 180px;">
      <div style="font-weight: 600; margin-bottom: 8px; color: ${theme.textColor}; border-bottom: 1px solid ${theme.border}; padding-bottom: 4px;">
        ${header}
      </div>
      <div style="margin-bottom: 8px;">
        ${lines.join("")}
      </div>
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 16px; border-top: 1px solid ${theme.border}; padding-top: 6px; font-weight: 600;">
        <span style="color: ${theme.textColor};">Total</span>
        <span style="color: ${theme.textColor};">${formatRupees(total)}</span>
      </div>
    </div>
  `.trim();
}

/**
 * Pure option builder (CC-11):
 * Data in, ECharts Core Option out.
 */
export function buildDiscountBreakdownOption({
  data,
  theme,
  prefersReducedMotion = false,
  selectedTypes,
}: BuildDiscountBreakdownOptionParams): EChartsCoreOption {
  const currentTheme = theme ?? resolveChartTheme("light", "emerald");
  const items = data ?? [];

  // Determine if monthly data is present
  const months = Array.from(
    new Set(
      items
        .map((d) => d.month?.trim())
        .filter((m): m is string => Boolean(m))
    )
  ).sort();

  const isMonthly = months.length > 0;
  const categories = isMonthly ? months : ["Total discounts"];

  // Unique discount types preserving order of appearance
  const discountTypes = Array.from(
    new Set(
      items
        .map((d) => d.label?.trim())
        .filter((l): l is string => Boolean(l))
    )
  );

  const series: BarSeriesOption[] = discountTypes.map((type, index) => {
    const color = currentTheme.colors[index % currentTheme.colors.length];
    let seriesData: number[];

    if (isMonthly) {
      seriesData = months.map((month) => {
        const match = items.find(
          (d) =>
            d.month?.trim() === month &&
            d.label?.trim().toLowerCase() === type.toLowerCase()
        );
        return match && Number.isFinite(match.amount) ? match.amount : 0;
      });
    } else {
      const totalForType = items
        .filter((d) => d.label?.trim().toLowerCase() === type.toLowerCase())
        .reduce((sum, d) => sum + (Number.isFinite(d.amount) ? d.amount : 0), 0);
      seriesData = [totalForType];
    }

    return {
      name: type,
      type: "bar",
      stack: "discounts",
      barMaxWidth: isMonthly ? 40 : 64,
      itemStyle: {
        color,
        borderRadius: isMonthly ? 2 : 4,
      },
      emphasis: {
        focus: "series",
      },
      data: seriesData,
      animationDelay: (idx: number) => (prefersReducedMotion ? 0 : idx * 60 + index * 40),
    };
  });

  const baseOption = buildBaseChartOption(currentTheme, prefersReducedMotion);

  return {
    ...baseOption,
    aria: {
      enabled: true,
      decal: { show: getPatterns() },
    },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      backgroundColor: currentTheme.tooltipBg,
      borderColor: currentTheme.tooltipBorder,
      textStyle: {
        color: currentTheme.tooltipText,
        fontSize: 12,
        fontFamily: '"Inter Variable", sans-serif',
      },
      formatter: (params: unknown) => formatDiscountTooltip(params, currentTheme),
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
      data: discountTypes,
      selected:
        selectedTypes && selectedTypes.length > 0
          ? discountTypes.reduce<Record<string, boolean>>((acc, t) => {
              acc[t] = selectedTypes.some((s) => s.toLowerCase() === t.toLowerCase());
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
      axisLabel: {
        color: currentTheme.mutedColor,
        fontSize: 11,
        fontFamily: '"Inter Variable", sans-serif',
        interval: 0,
        rotate: 0,
        hideOverlap: true,
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
        fontSize: 11,
        fontFamily: '"Inter Variable", sans-serif',
        formatter: (val: number) => compactInr(val),
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

export function DiscountBreakdownChart({
  data,
  isLoading,
  isEmpty: isEmptyProp,
  emptyReason,
  error,
  onRetry,
  className,
  title = "Discounts breakdown",
  subtitle = "Explicit bill deductions across discount types",
  caption: captionProp,
  onBarClick,
  showTable,
  onShowTableChange,
  fullscreen,
  onFullscreenChange,
}: DiscountBreakdownChartProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const chartRef = React.useRef<echarts.ECharts | null>(null);

  const totalSavings = React.useMemo(() => {
    return (data ?? []).reduce(
      (sum, d) => sum + (Number.isFinite(d.amount) && d.amount > 0 ? d.amount : 0),
      0
    );
  }, [data]);

  const computedCaption = React.useMemo(() => {
    return (
      captionProp ??
      (computeDiscountBreakdownTakeaway(data as readonly DiscountItemLike[]) ?? undefined)
    );
  }, [captionProp, data]);

  const isEmpty = isEmptyProp ?? (!isLoading && (!data || data.length === 0 || totalSavings === 0));
  const resolvedEmptyReason =
    emptyReason ?? "No discount breakdown data available for the selected filters";

  const tableData = React.useMemo(() => {
    if (!data || data.length === 0) return undefined;
    const hasMonths = data.some((d) => Boolean(d.month));
    return data.map((d) => {
      const share =
        totalSavings > 0 ? `${((d.amount / totalSavings) * 100).toFixed(1)}%` : "0%";
      if (hasMonths) {
        return {
          Month: d.month ?? "All",
          "Discount type": d.label,
          Amount: d.amount,
          "Share (%)": share,
        };
      }
      return {
        "Discount type": d.label,
        Amount: d.amount,
        "Share (%)": share,
      };
    });
  }, [data, totalSavings]);

  const ariaDescription = React.useMemo(() => {
    if (!data || data.length === 0 || totalSavings === 0) {
      return "Discounts breakdown chart with no data";
    }
    const summary = data
      .filter((d) => Number.isFinite(d.amount) && d.amount > 0)
      .map((d) => `${d.label}: ${formatRupees(d.amount)}`)
      .join(", ");
    return `Discounts breakdown chart showing explicit deductions total of ${formatRupees(totalSavings)}: ${summary}.`;
  }, [data, totalSavings]);

  React.useEffect(() => {
    const node = containerRef.current;
    if (!node || isEmpty || isLoading || error) return;

    registerDiscountModules();

    if (!chartRef.current) {
      chartRef.current = echarts.init(node);
    }
    const chart = chartRef.current;

    const handleClick = (params: unknown) => {
      const p = params as { seriesName?: string; name?: string; value?: number };
      if (p && onBarClick && data) {
        const found = data.find(
          (d) =>
            d.label.toLowerCase() === (p.seriesName ?? "").toLowerCase() ||
            d.month === p.name
        );
        if (found) {
          onBarClick(found);
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

    return () => {
      chart.off("click", handleClick);
      resizeObserver.disconnect();
      if (chartRef.current) {
        chartRef.current.dispose();
        chartRef.current = null;
      }
    };
  }, [isEmpty, isLoading, error, data, onBarClick]);

  React.useEffect(() => {
    function applyUpdate() {
      const chart = chartRef.current;
      if (!chart || chart.isDisposed()) return;
      const theme = getCurrentChartTheme();
      const prefersReducedMotion =
        typeof window !== "undefined" &&
        window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      const opt = buildDiscountBreakdownOption({
        data,
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
  }, [data]);

  const infoPopover = (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Discounts breakdown information"
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
          <p className="font-semibold text-foreground text-sm">Discounts Breakdown</p>
          <p className="text-muted-foreground mt-0.5 leading-relaxed">
            Displays explicit bill deductions itemized on your delivery invoices across discount types.
          </p>
        </div>
        <div className="space-y-1.5 pt-1 border-t border-border/50">
          <p className="font-medium text-foreground">Explicit Deductions vs Advertised Savings</p>
          <p className="text-muted-foreground leading-relaxed">
            Explicit deductions are actual rupee amounts subtracted from your bill subtotal (coupons, delivery discounts, and unallocated discounts). Advertised savings (menu list price strikethroughs) are excluded as they do not reduce invoiced totals.
          </p>
        </div>
        <div className="space-y-1.5 pt-1 border-t border-border/50">
          <p className="font-medium text-foreground">Interactive Legend</p>
          <p className="text-muted-foreground leading-relaxed">
            Click any discount category in the legend above to toggle that series on or off and dynamically recalculate breakdown totals.
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
        aria-label={ariaDescription}
        tabIndex={0}
        style={{ height: 350, width: "100%", minHeight: 300 }}
        className="cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring rounded-md"
      />
    </ChartCard>
  );
}

export default DiscountBreakdownChart;
