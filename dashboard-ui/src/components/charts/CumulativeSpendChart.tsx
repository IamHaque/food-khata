import * as React from "react";
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  AriaComponent,
  MarkPointComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsCoreOption } from "echarts/core";
import { Info } from "lucide-react";

import { BaseChart, useOptionalFilters } from "@/components/dashboard/BaseChart";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  getCurrentChartTheme,
  buildBaseChartOption,
  resolveChartTheme,
  type ChartTheme,
} from "@/lib/chart-theme";
import {
  computeCumulativeSpendTakeaway,
  formatRupees,
} from "@/lib/captions";
import { isDimensionMatch } from "@/lib/highlight-bus";

let registered = false;
function registerOnce() {
  if (registered) return;
  echarts.use([
    LineChart,
    GridComponent,
    TooltipComponent,
    LegendComponent,
    AriaComponent,
    MarkPointComponent,
    CanvasRenderer,
  ]);
  registered = true;
}
registerOnce();

export const DEFAULT_MILESTONE_STEP = 10000;

export interface CumulativeSpendDatum {
  month?: string | null;
  date?: string | null;
  spend?: number | null;
  amount?: number | null;
  orders?: number | null;
}

export interface CumulativeProcessedItem {
  label: string;
  spend: number;
  orders: number;
  cumulative: number;
  prevCumulative: number;
  milestones: number[];
}

export function formatMilestoneLabel(amount: number): string {
  if (amount > 0 && amount % 1000 === 0) {
    return `₹${amount / 1000}k`;
  }
  return formatRupees(amount);
}

export function processCumulativeSpendData(
  data: readonly CumulativeSpendDatum[] | null | undefined,
  milestoneStep = DEFAULT_MILESTONE_STEP,
): CumulativeProcessedItem[] {
  if (!data || data.length === 0) return [];

  let runningTotal = 0;
  return data.map((d, index) => {
    const rawLabel = String(d?.month ?? d?.date ?? "").trim();
    const label = rawLabel || `Point ${index + 1}`;
    const rawSpend = Number(d?.spend ?? d?.amount ?? 0);
    const spend = Number.isFinite(rawSpend) && rawSpend > 0 ? rawSpend : 0;
    const orders = Number.isFinite(Number(d?.orders)) ? Number(d?.orders) : 0;

    const prevTotal = runningTotal;
    runningTotal += spend;

    const prevCount = milestoneStep > 0 ? Math.floor(prevTotal / milestoneStep) : 0;
    const currCount = milestoneStep > 0 ? Math.floor(runningTotal / milestoneStep) : 0;

    const milestones: number[] = [];
    if (currCount > prevCount) {
      for (let k = prevCount + 1; k <= currCount; k++) {
        milestones.push(k * milestoneStep);
      }
    }

    return {
      label,
      spend,
      orders,
      cumulative: runningTotal,
      prevCumulative: prevTotal,
      milestones,
    };
  });
}

export function formatCumulativeSpendTooltip(
  params: unknown,
  processed: readonly CumulativeProcessedItem[],
  theme: ChartTheme,
): string {
  if (!params) return "";
  const first = Array.isArray(params) ? params[0] : (params as any);
  if (!first) return "";

  const monthLabel = String(first.axisValueLabel ?? first.name ?? "").trim();
  const dataIndex = typeof first.dataIndex === "number" ? first.dataIndex : -1;
  const row =
    dataIndex >= 0 && dataIndex < processed.length
      ? processed[dataIndex]
      : processed.find((p) => p.label === monthLabel) ?? null;

  const spendVal = row ? row.spend : 0;
  const cumulativeVal = row ? row.cumulative : Number(first.value ?? 0);
  const milestones = row?.milestones ?? [];

  const milestoneSection =
    milestones.length > 0
      ? `<div style="margin-top: 6px; padding-top: 5px; border-top: 1px dashed ${theme.border}; font-weight: 600; color: ${theme.primary}; font-size: 11px;">
          🎯 Milestone reached: ${milestones.map(formatMilestoneLabel).join(", ")}
        </div>`
      : "";

  return `
    <div style="font-family: inherit; font-size: 12px; line-height: 1.5; min-width: 190px;">
      <div style="font-weight: 600; margin-bottom: 6px; color: ${theme.textColor}; border-bottom: 1px solid ${theme.border}; padding-bottom: 4px;">
        ${monthLabel || "Cumulative spend"}
      </div>
      <div style="display: flex; justify-content: space-between; gap: 14px; margin-bottom: 4px;">
        <span style="color: ${theme.mutedColor};">Monthly spend:</span>
        <strong style="color: ${theme.textColor}; font-family: monospace;">${formatRupees(spendVal)}</strong>
      </div>
      <div style="display: flex; justify-content: space-between; gap: 14px; margin-bottom: 4px;">
        <span style="color: ${theme.mutedColor};">Cumulative spend:</span>
        <strong style="color: ${theme.textColor}; font-family: monospace;">${formatRupees(cumulativeVal)}</strong>
      </div>
      ${milestoneSection}
    </div>
  `.trim();
}

export interface BuildCumulativeSpendOptionParams {
  data?: readonly CumulativeSpendDatum[] | null;
  theme?: ChartTheme;
  prefersReducedMotion?: boolean;
  milestoneStep?: number;
}

export function buildCumulativeSpendOption({
  data,
  theme,
  prefersReducedMotion = false,
  milestoneStep = DEFAULT_MILESTONE_STEP,
}: BuildCumulativeSpendOptionParams): EChartsCoreOption {
  const currentTheme =
    theme ??
    (typeof document === "undefined"
      ? resolveChartTheme("light", "emerald")
      : getCurrentChartTheme());

  const processed = processCumulativeSpendData(data, milestoneStep);
  const labels = processed.map((p) => p.label);
  const cumulativeValues = processed.map((p) => p.cumulative);

  const markPoints = processed.flatMap((p) =>
    p.milestones.map((m) => ({
      name: `Milestone ${formatMilestoneLabel(m)}`,
      coord: [p.label, p.cumulative] as [string, number],
      value: formatMilestoneLabel(m),
    }))
  );

  const base = buildBaseChartOption(currentTheme, prefersReducedMotion);

  const option: EChartsCoreOption = {
    ...base,
    tooltip: {
      ...(base.tooltip as object),
      trigger: "axis",
      axisPointer: {
        type: "cross",
        label: {
          color: currentTheme.textColor,
        },
      },
      formatter: (params: unknown) =>
        formatCumulativeSpendTooltip(params, processed, currentTheme),
    },
    grid: {
      left: 60,
      right: 32,
      top: 36,
      bottom: 42,
      containLabel: true,
    },
    xAxis: {
      type: "category",
      data: labels,
      boundaryGap: false,
      axisLabel: {
        fontSize: 10,
        color: currentTheme.mutedColor,
        interval: "auto",
      },
      axisLine: {
        lineStyle: {
          color: currentTheme.axis,
        },
      },
    },
    yAxis: {
      type: "value",
      name: "Cumulative (₹)",
      nameTextStyle: {
        fontSize: 10,
        color: currentTheme.mutedColor,
      },
      axisLabel: {
        fontSize: 10,
        color: currentTheme.mutedColor,
        formatter: (val: number) => {
          if (val >= 100000) return `₹${(val / 100000).toFixed(val % 100000 === 0 ? 0 : 1)}L`;
          if (val >= 1000) return `₹${(val / 1000).toFixed(0)}k`;
          return `₹${val}`;
        },
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
        name: "Cumulative Spend",
        type: "line",
        smooth: true,
        data: cumulativeValues,
        lineStyle: {
          color: currentTheme.colors[0],
          width: 2.5,
        },
        itemStyle: {
          color: currentTheme.colors[0],
        },
        areaStyle: {
          color: currentTheme.colors[0],
          opacity: 0.15,
        },
        markPoint: {
          symbol: "pin",
          symbolSize: 44,
          data: markPoints,
          itemStyle: {
            color: currentTheme.primary,
          },
          label: {
            fontSize: 10,
            fontWeight: "bold",
            color: currentTheme.text,
          },
        },
        animation: !prefersReducedMotion,
        animationDuration: prefersReducedMotion ? 0 : 600,
        animationEasing: "cubicOut",
      },
    ],
  };

  return option;
}

export interface CumulativeSpendChartProps {
  data?: readonly CumulativeSpendDatum[] | null;
  isLoading?: boolean;
  isEmpty?: boolean;
  emptyReason?: string;
  error?: Error | string | null;
  onRetry?: () => void;
  className?: string;
  title?: string;
  subtitle?: string;
  caption?: string;
  milestoneStep?: number;
  showTable?: boolean;
  onShowTableChange?: (value: boolean) => void;
  fullscreen?: boolean;
  onFullscreenChange?: (value: boolean) => void;
  onMonthClick?: (month: string) => void;
}


export function CumulativeSpendChart({
  data,
  isLoading,
  isEmpty: isEmptyProp,
  emptyReason = "No monthly spending data recorded to calculate cumulative trajectory.",
  error,
  onRetry,
  className,
  title = "Cumulative spend",
  subtitle = "Running total of expenditures with milestone markers",
  caption,
  milestoneStep = DEFAULT_MILESTONE_STEP,
  showTable,
  onShowTableChange,
  fullscreen,
  onFullscreenChange,
  onMonthClick,
}: CumulativeSpendChartProps) {
  const filters = useOptionalFilters();

  const processed = React.useMemo(
    () => processCumulativeSpendData(data, milestoneStep),
    [data, milestoneStep]
  );

  const isEmpty =
    isEmptyProp ||
    (!isLoading &&
      !error &&
      (!data ||
        data.length === 0 ||
        processed.every((p) => p.spend === 0)));

  const autoCaption = React.useMemo(
    () => computeCumulativeSpendTakeaway(data, milestoneStep),
    [data, milestoneStep]
  );
  const effectiveCaption = caption !== undefined ? caption : autoCaption ?? undefined;

  const tableData = React.useMemo(() => {
    if (!data || data.length === 0) return undefined;
    return processed.map((p) => ({
      Month: p.label,
      Spend: p.spend,
      "Cumulative total": p.cumulative,
      Milestone:
        p.milestones.length > 0
          ? p.milestones.map(formatMilestoneLabel).join(", ")
          : "-",
    }));
  }, [data, processed]);

  const highlightMatcher = React.useMemo(
    () => ({
      dimension: "month",
      matcher: (dim: string, val: string) => {
        if (dim !== "month") return false;
        const months = processed.map((p) => p.label);
        const matchIdx = months.findIndex((m) =>
          isDimensionMatch("month", m, val)
        );
        if (matchIdx >= 0) {
          return { type: "highlight", dataIndex: matchIdx };
        }
        return undefined;
      },
    }),
    [processed]
  );

  const getMonthFromParams = React.useCallback(
    (params: any) => {
      const months = processed.map((p) => p.label);
      let month = params?.name ?? params?.axisValueLabel ?? params?.axisValue;
      if (
        !month &&
        typeof params?.dataIndex === "number" &&
        months[params.dataIndex]
      ) {
        month = months[params.dataIndex];
      }
      return month ? String(month) : undefined;
    },
    [processed]
  );

  const infoPopover = (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Cumulative spend information"
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
          <p className="font-semibold text-foreground text-sm">Cumulative Spend</p>
          <p className="text-muted-foreground mt-0.5 leading-relaxed">
            Running total of food expenditures over time with milestone threshold callouts.
          </p>
        </div>
        <div className="space-y-1.5 text-muted-foreground leading-relaxed">
          <p>
            <strong className="text-foreground">Running Total:</strong> Successive monthly spending amounts are accumulated chronologically to show total outlay trajectory.
          </p>
          <p>
            <strong className="text-foreground">Milestones:</strong> Annotated pins highlight round milestone thresholds (every ₹10,000 crossed) on the cumulative line.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );

  return (
    <BaseChart
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
      data={data}
      spec={(currentData, theme, { prefersReducedMotion }) =>
        buildCumulativeSpendOption({
          data: currentData,
          theme,
          prefersReducedMotion,
          milestoneStep,
        })
      }
      onSelect={(month) => {
        if (onMonthClick) {
          onMonthClick(String(month));
        } else if (filters?.applyCrossFilter) {
          filters.applyCrossFilter("month", String(month));
        }
      }}
      crossFilterDimension="month"
      getCrossFilterValue={getMonthFromParams}
      highlightDimension="month"
      getHighlightValue={getMonthFromParams}
      highlightMatcher={highlightMatcher}
      registerModules={registerOnce}
      ariaLabel={`${title}: ${subtitle}`}
      ariaDescription={
        effectiveCaption ||
        "Cumulative expenditure trajectory across monthly periods with milestone markers."
      }
    />
  );
}

export default CumulativeSpendChart;
