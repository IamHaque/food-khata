import { getPatterns } from "../../app/theme";
import * as React from "react";
import { monthLabel, swatchBg } from "../../lib/chart-kit";
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

import { BaseChart, useOptionalFilters } from "../dashboard/BaseChart";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import {
  buildBaseChartOption,
  resolveChartTheme,
  type ChartTheme,
} from "../../lib/chart-theme";
import {
  computeNewVsRepeatTakeaway,
  type NewVsRepeatDatumLike,
} from "../../lib/captions";
import { isDimensionMatch } from "../../lib/highlight-bus";
import { monthToDateRange } from "../../lib/crossfilter";

export interface NewVsRepeatDatum extends NewVsRepeatDatumLike {
  month?: string | null;
  new_orders?: number | null;
  repeat_orders?: number | null;
  newOrders?: number | null;
  repeatOrders?: number | null;
}

export interface BuildNewVsRepeatOptionParams {
  data?: readonly NewVsRepeatDatum[] | null;
  theme?: ChartTheme;
  prefersReducedMotion?: boolean;
  selectedSeries?: string[] | Record<string, boolean>;
}

export interface NewVsRepeatChartProps {
  data?: readonly NewVsRepeatDatum[] | null;
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

export const NEW_VS_REPEAT_SERIES_CONFIG = [
  { key: "new_orders", name: "New restaurants", symbol: "circle" },
  { key: "repeat_orders", name: "Repeat restaurants", symbol: "rect" },
] as const;

let echartsRegistered = false;
function registerNewVsRepeatModules() {
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
registerNewVsRepeatModules();


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
        (b === "new restaurants" && (a === "new" || a === "new orders" || a === "new restaurant orders")) ||
        (b === "repeat restaurants" && (a === "repeat" || a === "repeat orders" || a === "repeat restaurant orders"))
      );
    });
  }
  const match = Object.entries(selectedSeries).find(([key]) => {
    const a = key.trim().toLowerCase();
    const b = seriesName.trim().toLowerCase();
    return (
      a === b ||
      (b === "new restaurants" && (a === "new" || a === "new orders" || a === "new restaurant orders")) ||
      (b === "repeat restaurants" && (a === "repeat" || a === "repeat orders" || a === "repeat restaurant orders"))
    );
  });
  if (match) {
    return Boolean(match[1]);
  }
  return false;
}

export function formatNewVsRepeatTooltip(
  params: unknown,
  theme: ChartTheme,
): string {
  if (!Array.isArray(params) || params.length === 0) return "";

  const first = params[0] as any;
  const month = first?.axisValueLabel ?? first?.name ?? "Month";

  let newOrders = 0;
  let repeatOrders = 0;
  let newColor = theme.colors[0];
  let repeatColor = theme.colors[1];

  for (const p of params as any[]) {
    if (!p) continue;
    const name = String(p.seriesName ?? "").toLowerCase();
    const val = typeof p.value === "number" && !isNaN(p.value) ? p.value : 0;
    if (name.includes("new")) {
      newOrders = val;
      if (p.color) newColor = p.color;
    } else if (name.includes("repeat")) {
      repeatOrders = val;
      if (p.color) repeatColor = p.color;
    }
  }

  const total = newOrders + repeatOrders;
  const repeatShare = total > 0 ? Math.round((repeatOrders / total) * 100) : 0;

  return `
    <div style="font-family: inherit; font-size: 12px; line-height: 1.5; min-width: 180px;">
      <div style="font-weight: 600; margin-bottom: 8px; color: ${theme.textColor}; border-bottom: 1px solid ${theme.border}; padding-bottom: 4px;">
        ${month}
      </div>
      <div style="margin-bottom: 8px;">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 4px;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; ${swatchBg(newColor)}"></span>
            <span style="color: ${theme.textColor}; font-weight: 500;">New restaurants:</span>
          </div>
          <span style="font-weight: 600; color: ${theme.textColor};">${newOrders.toLocaleString("en-IN")}</span>
        </div>
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 4px;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="display: inline-block; width: 8px; height: 8px; border-radius: 2px; ${swatchBg(repeatColor)}"></span>
            <span style="color: ${theme.textColor}; font-weight: 500;">Repeat restaurants:</span>
          </div>
          <span style="font-weight: 600; color: ${theme.textColor};">${repeatOrders.toLocaleString("en-IN")}</span>
        </div>
      </div>
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 16px; border-top: 1px solid ${theme.border}; padding-top: 6px; font-weight: 600;">
        <span style="color: ${theme.textColor};">Total orders:</span>
        <span style="color: ${theme.textColor};">${total.toLocaleString("en-IN")}</span>
      </div>
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-top: 4px; font-size: 11px; color: ${theme.mutedColor};">
        <span>Repeat share:</span>
        <span style="font-weight: 600; color: ${theme.textColor};">${repeatShare}%</span>
      </div>
    </div>
  `.trim();
}

/**
 * Pure option builder (CC-11):
 * Data in, ECharts Core Option out.
 */
export function buildNewVsRepeatOption({
  data,
  theme,
  prefersReducedMotion = false,
  selectedSeries,
}: BuildNewVsRepeatOptionParams): EChartsCoreOption {
  const currentTheme = theme ?? resolveChartTheme("light", "emerald");
  const items = data ?? [];

  const categories = items.map((d) => d.month ?? "Unknown");

  const series: LineSeriesOption[] = NEW_VS_REPEAT_SERIES_CONFIG.map((cfg, index) => {
    const color = currentTheme.colors[index % currentTheme.colors.length];
    const seriesData = items.map((d) => {
      const val =
        cfg.key === "new_orders"
          ? (d.new_orders ?? d.newOrders ?? 0)
          : (d.repeat_orders ?? d.repeatOrders ?? 0);
      return Number.isFinite(val) && val !== undefined && val !== null ? Number(val) : 0;
    });

    return {
      name: cfg.name,
      type: "line",
      stack: "visits",
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
      decal: { show: getPatterns() },
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
      formatter: (params: unknown) => formatNewVsRepeatTooltip(params, currentTheme),
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
      data: NEW_VS_REPEAT_SERIES_CONFIG.map((c) => c.name),
      selected: selectedSeries
        ? NEW_VS_REPEAT_SERIES_CONFIG.reduce<Record<string, boolean>>((acc, c) => {
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
        rotate: 0,
        hideOverlap: true,
        formatter: monthLabel,
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
      name: "Orders",
      nameTextStyle: {
        color: currentTheme.mutedColor,
        fontSize: 11,
      },
      axisLabel: {
        color: currentTheme.mutedColor,
        fontSize: 11,
        fontFamily: '"Inter Variable", sans-serif',
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

export function NewVsRepeatChart({
  data,
  isLoading,
  isEmpty: isEmptyProp,
  emptyReason,
  error,
  onRetry,
  className,
  title = "New vs repeat restaurants",
  subtitle = "Monthly discovery versus loyalty trajectories",
  caption: captionProp,
  onMonthClick,
  selectedSeries,
  showTable,
  onShowTableChange,
  fullscreen,
  onFullscreenChange,
}: NewVsRepeatChartProps) {
  const filterContext = useOptionalFilters();

  const { totalOrdersSum, totalRepeatSum } = React.useMemo(() => {
    let orderSum = 0;
    let repeatSum = 0;
    for (const d of data ?? []) {
      const newOrders = Number.isFinite(d.new_orders) ? d.new_orders! : (d.newOrders ?? 0);
      const repeatOrders = Number.isFinite(d.repeat_orders) ? d.repeat_orders! : (d.repeatOrders ?? 0);
      if (newOrders > 0) orderSum += newOrders;
      if (repeatOrders > 0) {
        orderSum += repeatOrders;
        repeatSum += repeatOrders;
      }
    }
    return { totalOrdersSum: orderSum, totalRepeatSum: repeatSum };
  }, [data]);

  const computedCaption = React.useMemo(() => {
    return (
      captionProp ??
      (computeNewVsRepeatTakeaway(data) ?? undefined)
    );
  }, [captionProp, data]);

  const isEmpty =
    isEmptyProp ?? (!isLoading && (!data || data.length === 0 || totalOrdersSum === 0));
  const resolvedEmptyReason =
    emptyReason ?? "No new vs repeat restaurant data available for the selected filters";

  const tableData = React.useMemo(() => {
    if (!data || data.length === 0) return undefined;
    return data.map((d) => {
      const newOrders = Number.isFinite(d.new_orders) ? d.new_orders! : (d.newOrders ?? 0);
      const repeatOrders = Number.isFinite(d.repeat_orders) ? d.repeat_orders! : (d.repeatOrders ?? 0);
      const total = newOrders + repeatOrders;
      const repeatPct = total > 0 ? `${Math.round((repeatOrders / total) * 100)}%` : "0%";

      return {
        Month: d.month ?? "Unknown",
        "New orders": newOrders,
        "Repeat orders": repeatOrders,
        Total: total,
        "Repeat (%)": repeatPct,
      };
    });
  }, [data]);

  const ariaDescription = React.useMemo(() => {
    if (!data || data.length === 0 || totalOrdersSum === 0) {
      return "New vs repeat restaurants chart with no data";
    }
    const overallRepeatPct = totalOrdersSum > 0 ? Math.round((totalRepeatSum / totalOrdersSum) * 100) : 0;
    return `New vs repeat restaurants stacked area chart showing monthly order counts for first-time discoveries and repeat visits across ${data.length} months with repeat share of ${overallRepeatPct}%.`;
  }, [data, totalOrdersSum, totalRepeatSum]);

  const highlightMatcher = React.useMemo(
    () => ({
      dimension: "month",
      matcher: (dim: string, val: string) => {
        if (dim !== "month") return false;
        const months = (data ?? []).map((d) => d.month ?? "Unknown");
        const matchIdx = months.findIndex((m) => isDimensionMatch("month", m, val));
        if (matchIdx >= 0) {
          return { type: "highlight", dataIndex: matchIdx };
        }
        return undefined;
      },
    }),
    [data]
  );

  const getMonthFromParams = React.useCallback(
    (params: any) => {
      const months = (data ?? []).map((d) => d.month ?? "Unknown");
      let month = params?.name ?? params?.axisValueLabel ?? params?.axisValue;
      if (!month && typeof params?.dataIndex === "number" && months[params.dataIndex]) {
        month = months[params.dataIndex];
      }
      return month ? String(month) : undefined;
    },
    [data]
  );

  const handleSelect = React.useCallback(
    (month: string) => {
      if (onMonthClick) {
        onMonthClick(month);
      } else if (filterContext?.applyCrossFilter) {
        filterContext.applyCrossFilter("month", month);
      } else if (filterContext?.update) {
        try {
          const range = monthToDateRange(month);
          filterContext.update(range);
        } catch {
          // ignore invalid format
        }
      }
    },
    [onMonthClick, filterContext]
  );

  const infoPopover = (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="New vs repeat information"
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
          <p className="font-semibold text-foreground text-sm">New vs Repeat Restaurants</p>
          <p className="text-muted-foreground mt-0.5 leading-relaxed">
            Monthly comparison between orders placed at brand-new restaurant vendors versus repeat orders at previously visited restaurants.
          </p>
        </div>
        <div className="space-y-1.5 pt-1 border-t border-border/50">
          <p className="font-medium text-foreground">Discovery vs Loyalty</p>
          <p className="text-muted-foreground leading-relaxed">
            First-time orders represent your exploration of new dining spots, while repeat orders reflect sustained loyalty to favorite vendors.
          </p>
        </div>
        <div className="space-y-1.5 pt-1 border-t border-border/50">
          <p className="font-medium text-foreground">Repeat Share Calculation</p>
          <p className="text-muted-foreground leading-relaxed">
            Repeat share is calculated as <span className="font-mono text-[11px]">Math.round((repeat_orders / (new_orders + repeat_orders)) * 100)%</span>, showing the proportion of monthly dining volume that returns to familiar spots.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );

  return (
    <BaseChart
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
      data={data}
      spec={(currentData, theme, { prefersReducedMotion }) =>
        buildNewVsRepeatOption({
          data: currentData,
          theme,
          prefersReducedMotion,
          selectedSeries,
        })
      }
      onSelect={handleSelect}
      crossFilterDimension="month"
      getCrossFilterValue={getMonthFromParams}
      highlightDimension="month"
      getHighlightValue={getMonthFromParams}
      highlightMatcher={highlightMatcher}
      registerModules={registerNewVsRepeatModules}
      ariaLabel={title}
      ariaDescription={ariaDescription}
    />
  );
}

export default NewVsRepeatChart;
