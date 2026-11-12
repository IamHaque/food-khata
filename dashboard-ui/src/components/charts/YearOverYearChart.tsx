import { getPatterns } from "../../app/theme";
import { compactInr } from "../../lib/chart-kit";
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
  computeYearOverYearTakeaway,
  formatRupees,
} from "../../lib/captions";
import { subscribeTheme } from "../../app/theme";
import {
  registerChart,
  emitHighlight,
  emitClear,
  isDimensionMatch,
} from "../../lib/highlight-bus";

export interface YearSpendItem {
  year: number;
  month: number;
  spend: number;
}

export const MONTH_NAMES = [
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
] as const;

export const FULL_MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export const LINE_SYMBOLS = [
  "circle",
  "rect",
  "triangle",
  "diamond",
  "pin",
  "roundRect",
] as const;

export interface BuildYearOverYearOptionParams {
  data?: readonly YearSpendItem[] | null;
  theme?: ChartTheme;
  prefersReducedMotion?: boolean;
  selectedYears?: string[];
}

export interface YearOverYearChartProps {
  data?: readonly YearSpendItem[] | null;
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

let echartsRegistered = false;
function registerYoYModules() {
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
registerYoYModules();

export function formatYearOverYearTooltip(
  params: unknown,
  theme: ChartTheme,
): string {
  if (!Array.isArray(params) || params.length === 0) return "";

  const first = params[0] as any;
  const dataIdx = typeof first?.dataIndex === "number" ? first.dataIndex : -1;
  const monthName =
    dataIdx >= 0 && dataIdx < FULL_MONTH_NAMES.length
      ? FULL_MONTH_NAMES[dataIdx]
      : first?.axisValueLabel ?? first?.name ?? "Month";

  const validItems = (params as any[]).filter(
    (p) => p && typeof p.value === "number" && !isNaN(p.value)
  );

  if (validItems.length === 0) {
    return `
      <div style="font-family: inherit; font-size: 12px; line-height: 1.5; min-width: 160px;">
        <div style="font-weight: 600; margin-bottom: 4px; color: ${theme.textColor};">
          ${monthName}
        </div>
        <div style="color: ${theme.mutedColor}; font-size: 11px;">No spending data</div>
      </div>
    `.trim();
  }

  const lines = (params as any[]).map((p) => {
    const color = p.color || theme.colors[0];
    const hasValue = typeof p.value === "number" && !isNaN(p.value);
    const valFormatted = hasValue ? formatRupees(p.value) : "No data";
    return `
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 4px;">
        <div style="display: flex; align-items: center; gap: 6px;">
          <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background-color: ${color};"></span>
          <span style="color: ${theme.textColor}; font-weight: 500;">${p.seriesName}</span>
        </div>
        <span style="font-weight: 600; color: ${hasValue ? theme.textColor : theme.mutedColor};">${valFormatted}</span>
      </div>
    `.trim();
  });

  // Calculate gap / difference between latest two years with data for this month
  let gapSection = "";
  const sorted = [...validItems].sort(
    (a, b) => (parseInt(a.seriesName, 10) || 0) - (parseInt(b.seriesName, 10) || 0)
  );

  if (sorted.length >= 2) {
    const latest = sorted[sorted.length - 1];
    const prev = sorted[sorted.length - 2];
    const diff = latest.value - prev.value;
    const pct = prev.value > 0 ? ((diff / prev.value) * 100).toFixed(1) : null;
    const sign = diff > 0 ? "+" : diff < 0 ? "-" : "";
    const diffFormatted = diff === 0 ? "₹0" : `${sign}${formatRupees(Math.abs(diff))}`;
    const pctFormatted = pct !== null ? ` (${diff > 0 ? "+" : ""}${pct}%)` : "";
    const label =
      (params as any[]).length === 2
        ? "Difference"
        : `Gap (${latest.seriesName} vs ${prev.seriesName})`;

    gapSection = `
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 16px; border-top: 1px solid ${theme.border}; padding-top: 6px; font-weight: 600; font-size: 11px;">
        <span style="color: ${theme.textColor};">${label}</span>
        <span style="color: ${theme.textColor};">${diffFormatted}${pctFormatted}</span>
      </div>
    `.trim();
  }

  return `
    <div style="font-family: inherit; font-size: 12px; line-height: 1.5; min-width: 190px;">
      <div style="font-weight: 600; margin-bottom: 8px; color: ${theme.textColor}; border-bottom: 1px solid ${theme.border}; padding-bottom: 4px;">
        ${monthName}
      </div>
      <div style="margin-bottom: 8px;">
        ${lines.join("")}
      </div>
      ${gapSection}
    </div>
  `.trim();
}

/**
 * Pure option builder (CC-11):
 * Data in, ECharts Core Option out.
 */
export function buildYearOverYearOption({
  data,
  theme,
  prefersReducedMotion = false,
  selectedYears,
}: BuildYearOverYearOptionParams): EChartsCoreOption {
  const currentTheme = theme ?? resolveChartTheme("light", "emerald");
  const items = data ?? [];

  const distinctYears = Array.from(
    new Set(
      items
        .map((d) => d.year)
        .filter((y): y is number => typeof y === "number" && !isNaN(y))
    )
  ).sort((a, b) => a - b);

  const series: LineSeriesOption[] = distinctYears.map((y, idx) => {
    const color = currentTheme.colors[idx % currentTheme.colors.length];
    const symbol = LINE_SYMBOLS[idx % LINE_SYMBOLS.length];

    const seriesData: Array<number | null> = Array.from({ length: 12 }, (_, monthIdx) => {
      const match = items.find((d) => d.year === y && d.month === monthIdx + 1);
      return match && Number.isFinite(match.spend) ? match.spend : null;
    });

    return {
      name: String(y),
      type: "line",
      smooth: false,
      symbol,
      symbolSize: 7,
      connectNulls: false,
      itemStyle: {
        color,
      },
      lineStyle: {
        width: 2.5,
        color,
      },
      emphasis: {
        focus: "series",
        lineStyle: {
          width: 3.5,
        },
      },
      data: seriesData,
      animationDelay: (i: number) => (prefersReducedMotion ? 0 : i * 40 + idx * 60),
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
      axisPointer: {
        type: "line",
        lineStyle: {
          color: currentTheme.axisLine,
          type: "dashed",
        },
      },
      backgroundColor: currentTheme.tooltipBg,
      borderColor: currentTheme.tooltipBorder,
      textStyle: {
        color: currentTheme.tooltipText,
        fontSize: 12,
        fontFamily: '"Inter Variable", sans-serif',
      },
      formatter: (params: unknown) => formatYearOverYearTooltip(params, currentTheme),
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
      data: distinctYears.map(String),
      // Last three years on by default; click a year in the legend to show or hide it.
      selected: distinctYears.reduce<Record<string, boolean>>((acc, y, i) => {
        const s = String(y);
        acc[s] = selectedYears && selectedYears.length > 0 ? selectedYears.includes(s) : i >= distinctYears.length - 3;
        return acc;
      }, {}),
    },
    grid: {
      left: 16,
      right: 20,
      top: 40,
      bottom: 8,
      containLabel: true,
    },
    xAxis: {
      type: "category",
      data: [...MONTH_NAMES],
      axisLabel: {
        color: currentTheme.mutedColor,
        fontSize: 11,
        fontFamily: '"Inter Variable", sans-serif',
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
      name: "Spend",
      nameTextStyle: {
        color: currentTheme.mutedColor,
        fontSize: 11,
        fontFamily: '"Inter Variable", sans-serif',
      },
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

export function YearOverYearChart({
  data,
  isLoading,
  isEmpty: isEmptyProp,
  emptyReason,
  error,
  onRetry,
  className,
  title = "Year-over-year spend",
  subtitle = "Monthly spend for the last three years. Click a year in the legend to show or hide it.",
  caption: captionProp,
  showTable,
  onShowTableChange,
  fullscreen,
  onFullscreenChange,
}: YearOverYearChartProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const chartRef = React.useRef<echarts.ECharts | null>(null);
  const idRef = React.useRef(`yoy-${Math.random().toString(36).slice(2, 9)}`);
  const chartId = idRef.current;

  const distinctYears = React.useMemo(() => {
    return Array.from(
      new Set(
        (data ?? [])
          .map((d) => d.year)
          .filter((y): y is number => typeof y === "number" && !isNaN(y))
      )
    ).sort((a, b) => a - b);
  }, [data]);

  const totalSpendAllYears = React.useMemo(() => {
    return (data ?? []).reduce(
      (sum, d) => sum + (Number.isFinite(d.spend) && d.spend > 0 ? d.spend : 0),
      0
    );
  }, [data]);

  const computedCaption = React.useMemo(() => {
    return captionProp ?? (computeYearOverYearTakeaway(data) ?? undefined);
  }, [captionProp, data]);

  const isEmpty =
    isEmptyProp ??
    (!isLoading && (!data || data.length === 0 || totalSpendAllYears === 0));
  const resolvedEmptyReason =
    emptyReason ?? "No year-over-year spending data available for the selected filters";

  const tableData = React.useMemo(() => {
    if (!data || data.length === 0 || distinctYears.length === 0) return undefined;

    const hasTwoYears = distinctYears.length >= 2;
    const latestYear = hasTwoYears ? distinctYears[distinctYears.length - 1] : null;
    const priorYear = hasTwoYears ? distinctYears[distinctYears.length - 2] : null;

    return MONTH_NAMES.map((m, monthIdx) => {
      const row: Record<string, string | number | null> = {
        Month: m,
      };

      let latestSpend: number | null = null;
      let priorSpend: number | null = null;

      for (const y of distinctYears) {
        const match = data.find((d) => d.year === y && d.month === monthIdx + 1);
        const val = match && Number.isFinite(match.spend) ? match.spend : null;
        row[String(y)] = val;
        if (y === latestYear) latestSpend = val;
        if (y === priorYear) priorSpend = val;
      }

      if (hasTwoYears) {
        row["Difference"] =
          latestSpend !== null && priorSpend !== null ? latestSpend - priorSpend : null;
      }

      return row;
    });
  }, [data, distinctYears]);

  const ariaDescription = React.useMemo(() => {
    if (!data || data.length === 0 || distinctYears.length === 0) {
      return "Year-over-year spend comparison chart with no data";
    }
    const yearSummaries = distinctYears.map((y) => {
      const total = data
        .filter((d) => d.year === y && Number.isFinite(d.spend))
        .reduce((sum, d) => sum + d.spend, 0);
      return `${y}: ${formatRupees(total)}`;
    });
    return `Year-over-year spend comparison chart covering ${distinctYears.join(", ")}. Total annual spend: ${yearSummaries.join("; ")}.`;
  }, [data, distinctYears]);

  React.useEffect(() => {
    const node = containerRef.current;
    if (!node || isEmpty || isLoading || error) return;

    registerYoYModules();

    if (!chartRef.current) {
      chartRef.current = echarts.init(node);
    }
    const chart = chartRef.current;

    const unregister = registerChart(chartId, chart, {
      dimension: "month",
      matcher: (dim, val) => {
        if (dim !== "month") return false;
        const matchIdx = MONTH_NAMES.findIndex((m) => isDimensionMatch("month", m, val));
        if (matchIdx >= 0) {
          return { type: "highlight", dataIndex: matchIdx };
        }
        return undefined;
      },
    });

    const handleOver = (params: any) => {
      let month = params?.name ?? params?.axisValueLabel ?? params?.axisValue;
      if (!month && typeof params?.dataIndex === "number") {
        month = MONTH_NAMES[params.dataIndex];
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

    const resizeObserver = new ResizeObserver(() => {
      if (chart && !chart.isDisposed()) {
        chart.resize();
      }
    });
    resizeObserver.observe(node);

    return () => {
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
  }, [isEmpty, isLoading, error, chartId]);

  React.useEffect(() => {
    function applyUpdate() {
      const chart = chartRef.current;
      if (!chart || chart.isDisposed()) return;
      const theme = getCurrentChartTheme();
      const prefersReducedMotion =
        typeof window !== "undefined" &&
        window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      const opt = buildYearOverYearOption({
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
          aria-label="Year-over-year spend information"
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
          <p className="font-semibold text-foreground text-sm">Year-over-Year Trajectories</p>
          <p className="text-muted-foreground mt-0.5 leading-relaxed">
            Overlays monthly food expenditure across calendar years aligned on a normalized January to December timeline.
          </p>
        </div>
        <div className="space-y-1.5 pt-1 border-t border-border/50">
          <p className="font-medium text-foreground">Gaps for Incomplete Months</p>
          <p className="text-muted-foreground leading-relaxed">
            Months without order activity are rendered as unjoined breaks (null gaps) without curve interpolation, preventing artificial smoothing.
          </p>
        </div>
        <div className="space-y-1.5 pt-1 border-t border-border/50">
          <p className="font-medium text-foreground">Gap & Difference Metrics</p>
          <p className="text-muted-foreground leading-relaxed">
            Hovering any calendar month compares spend between consecutive years, revealing spending trajectory acceleration or contraction.
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

export default YearOverYearChart;
