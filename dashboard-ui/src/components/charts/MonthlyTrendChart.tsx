import * as React from "react";
import * as echarts from "echarts/core";
import { BarChart, LineChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  ToolboxComponent,
  DataZoomComponent,
  AriaComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsCoreOption } from "echarts/core";

import { ChartCard } from "@/components/dashboard/ChartCard";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { getCurrentChartTheme, buildBaseChartOption, resolveChartTheme } from "@/lib/chart-theme";
import { computeSpendTrendTakeaway } from "@/lib/captions";
import { useFilters } from "@/app/FilterContext";
import {
  registerChart,
  emitHighlight,
  emitClear,
} from "@/lib/highlight-bus";

// Ensure ECharts modules registered (side-effect import of Chart also does this)
let registered = false;
function registerOnce() {
  if (registered) return;
  echarts.use([
    BarChart,
    LineChart,
    GridComponent,
    TooltipComponent,
    LegendComponent,
    ToolboxComponent,
    DataZoomComponent,
    AriaComponent,
    CanvasRenderer,
  ]);
  registered = true;
}
registerOnce();

import type { components } from "@/types/api";

export type DashboardResponse = components["schemas"]["Dashboard"];

export interface MonthlyTrendDatum {
  month?: string | null;
  date?: string;
  spend?: number;
  amount?: number;
  orders?: number;
  count?: number;
}

export type MonthlyTrendMetric = "spend" | "orders" | "both";

export interface BuildMonthlyTrendOptionInput {
  metric?: MonthlyTrendMetric;
  theme?: ReturnType<typeof getCurrentChartTheme>;
  reducedMotion?: boolean;
  compareData?: DashboardResponse | readonly MonthlyTrendDatum[] | null;
  compareMonthlySpend?: Array<{ month?: string | null; spend?: number; amount?: number }> | null;
  compareMode?: "none" | "previous_period" | "previous_year";
}

function normalizeRows(data: readonly MonthlyTrendDatum[] | null | undefined) {
  const rows = data ?? [];
  return rows.map((r) => ({
    label: String(r?.month ?? r?.date ?? ""),
    spend: Number(r?.spend ?? r?.amount ?? 0),
    orders: Number(r?.orders ?? r?.count ?? 0),
  }));
}

function extractCompareRows(
  compareData?: DashboardResponse | readonly MonthlyTrendDatum[] | null,
  compareMonthlySpend?: Array<{ month?: string | null; spend?: number; amount?: number }> | null,
): Array<{ label: string; spend: number }> {
  if (compareMonthlySpend && compareMonthlySpend.length > 0) {
    return compareMonthlySpend.map((r) => ({
      label: String(r?.month ?? ""),
      spend: Number(r?.spend ?? r?.amount ?? 0),
    }));
  }
  if (!compareData) return [];
  if (
    typeof compareData === "object" &&
    "charts" in compareData &&
    compareData.charts &&
    Array.isArray(compareData.charts.monthly)
  ) {
    return compareData.charts.monthly.map((r: { month?: string | null; spend?: number }) => ({
      label: String(r?.month ?? ""),
      spend: Number(r?.spend ?? 0),
    }));
  }
  if (Array.isArray(compareData)) {
    return (compareData as readonly MonthlyTrendDatum[]).map((r) => ({
      label: String(r?.month ?? r?.date ?? ""),
      spend: Number(r?.spend ?? r?.amount ?? 0),
    }));
  }
  return [];
}

function useOptionalFilters() {
  try {
    return useFilters();
  } catch {
    return null;
  }
}

export function buildMonthlyTrendOption(
  data: readonly MonthlyTrendDatum[] | null | undefined,
  metricOrOpts?: MonthlyTrendMetric | BuildMonthlyTrendOptionInput,
  themeArg?: ReturnType<typeof getCurrentChartTheme>,
  compareDataArg?: DashboardResponse | readonly MonthlyTrendDatum[] | null,
  compareModeArg?: "none" | "previous_period" | "previous_year",
): EChartsCoreOption {
  let metric: MonthlyTrendMetric = "both";
  let theme = themeArg;
  let reducedMotion = false;
  let compareData = compareDataArg;
  let compareMonthlySpend: Array<{ month?: string | null; spend?: number; amount?: number }> | null | undefined = null;
  let compareMode: "none" | "previous_period" | "previous_year" = compareModeArg ?? "previous_period";

  if (typeof metricOrOpts === "string") {
    metric = (metricOrOpts as MonthlyTrendMetric) || "both";
  } else if (metricOrOpts && typeof metricOrOpts === "object") {
    if (metricOrOpts.metric) metric = metricOrOpts.metric;
    if (metricOrOpts.theme) theme = metricOrOpts.theme;
    if (typeof metricOrOpts.reducedMotion === "boolean") reducedMotion = metricOrOpts.reducedMotion;
    if (metricOrOpts.compareData !== undefined) compareData = metricOrOpts.compareData;
    if (metricOrOpts.compareMonthlySpend !== undefined) compareMonthlySpend = metricOrOpts.compareMonthlySpend;
    if (metricOrOpts.compareMode !== undefined) compareMode = metricOrOpts.compareMode;
  }
  if (!theme) {
    theme = typeof document === "undefined"
      ? resolveChartTheme("light", "emerald")
      : getCurrentChartTheme();
  }

  const rows = normalizeRows(data);
  const labels = rows.map((r) => r.label);
  const spends = rows.map((r) => r.spend);
  const orders = rows.map((r) => r.orders);

  const base = buildBaseChartOption(theme, reducedMotion);

  const showSpend = metric === "spend" || metric === "both";
  const showOrders = metric === "orders" || metric === "both";

  const yAxis: any[] = [];
  if (showSpend) {
    yAxis.push({
      type: "value",
      name: "Spend (₹)",
      position: "left",
      axisLabel: { fontSize: 10 },
      splitLine: { show: true },
    });
  }
  if (showOrders) {
    yAxis.push({
      type: "value",
      name: "Orders",
      position: "right",
      axisLabel: { fontSize: 10 },
      splitLine: { show: !showSpend },
    });
  }
  if (yAxis.length === 0) {
    yAxis.push({ type: "value" });
  }

  const spendAxisIndex = 0;
  const ordersAxisIndex = showSpend ? (showOrders ? 1 : 0) : 0;

  const series: any[] = [];
  if (showSpend) {
    series.push({
      name: "Spend (₹)",
      type: "line",
      smooth: true,
      showSymbol: false,
      yAxisIndex: spendAxisIndex,
      data: spends,
      areaStyle: {
        color: new (echarts as any).graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: theme["chart-1"] + "66" },
          { offset: 1, color: theme["chart-1"] + "00" },
        ]),
      },
      lineStyle: { color: theme["chart-1"], width: 2 },
      itemStyle: { color: theme["chart-1"] },
    });
  }

  const compareRows = extractCompareRows(compareData, compareMonthlySpend);
  const hasCompare = compareMode !== "none" && compareRows.length > 0 && showSpend;
  const compSeriesName = compareMode === "previous_year" ? "Previous Year" : "Previous Period";

  if (hasCompare) {
    const compareSpends = labels.map((label, i) => {
      if (compareMode === "previous_year" && /^\d{4}-\d{2}$/.test(label)) {
        const prevYear = Number(label.slice(0, 4)) - 1;
        const targetLabel = `${prevYear}${label.slice(4)}`;
        const match = compareRows.find((r) => r.label === targetLabel);
        if (match) return match.spend;
      }
      return compareRows[i]?.spend ?? null;
    });

    series.push({
      name: compSeriesName,
      type: "line",
      smooth: true,
      showSymbol: false,
      yAxisIndex: spendAxisIndex,
      data: compareSpends,
      lineStyle: {
        type: "dashed",
        width: 2,
        color: theme["chart-3"] || theme["chart-2"],
      },
      itemStyle: {
        color: theme["chart-3"] || theme["chart-2"],
      },
    });
  }

  if (showOrders) {
    series.push({
      name: "Orders",
      type: "bar",
      yAxisIndex: ordersAxisIndex,
      data: orders,
      itemStyle: { borderRadius: [3, 3, 0, 0], color: theme["chart-2"] },
      barMaxWidth: 24,
    });
  }

  const legendData = series.map((s) => s.name);

  const option: EChartsCoreOption = {
    ...base,
    tooltip: {
      ...(base.tooltip as object),
      trigger: "axis",
      formatter: (params: unknown) => {
        if (!Array.isArray(params)) return "";
        const month = (params[0] as { axisValueLabel?: string; name?: string })?.axisValueLabel
          ?? (params[0] as { name?: string })?.name
          ?? "";
        let res = `<div class="font-bold text-xs mb-1">${month}</div>`;
        for (const item of params as Array<{ seriesName: string; value: number | null }>) {
          if (item.value == null || Number.isNaN(Number(item.value))) continue;
          const formatted =
            item.seriesName.includes("Spend") || item.seriesName.includes("Previous")
              ? `₹${Number(item.value).toLocaleString("en-IN")}`
              : `${Number(item.value).toLocaleString("en-IN")} orders`;
          res += `<div class="flex justify-between gap-3 text-xs"><span>${item.seriesName}:</span> <strong>${formatted}</strong></div>`;
        }
        return res;
      },
    },
    legend: { show: true, top: 0, data: legendData },
    grid: { left: 55, right: 55, top: 40, bottom: 50 },
    toolbox: { feature: { restore: { title: "Reset zoom" } } },
    dataZoom: [{ type: "inside" }],
    brush: { toolbox: [] },
    xAxis: {
      type: "category",
      data: labels,
      axisLabel: { fontSize: 11, interval: "auto" },
    },
    yAxis,
    series,
  };

  return option;
}

// Alias names for compatibility
export const buildMonthlyOption = buildMonthlyTrendOption;
export const buildOption = buildMonthlyTrendOption;

export interface MonthlyTrendChartProps {
  data?: readonly MonthlyTrendDatum[] | null;
  compareData?: DashboardResponse | readonly MonthlyTrendDatum[] | null;
  compareMonthlySpend?: Array<{ month?: string | null; spend?: number; amount?: number }> | null;
  compareMode?: "none" | "previous_period" | "previous_year";
  title?: string;
  subtitle?: string;
  isLoading?: boolean;
  isEmpty?: boolean;
  emptyReason?: string;
  error?: Error | string | null;
  onRetry?: () => void;
  metric?: MonthlyTrendMetric;
}

export function MonthlyTrendChart({
  data,
  compareData,
  compareMonthlySpend,
  compareMode: compareModeProp,
  title = "Monthly spend and orders",
  subtitle = "Historical monthly expenditure and total volume",
  isLoading,
  isEmpty,
  emptyReason,
  error,
  onRetry,
  metric: metricProp,
}: MonthlyTrendChartProps) {
  const filters = useOptionalFilters();
  const [metric, setMetric] = React.useState<MonthlyTrendMetric>(metricProp ?? "both");
  React.useEffect(() => {
    if (metricProp) setMetric(metricProp);
  }, [metricProp]);

  const compareMode =
    compareModeProp ?? filters?.filters.compare ?? (compareData || compareMonthlySpend ? "previous_period" : "none");


  const rows = normalizeRows(data);
  const compRows = extractCompareRows(compareData, compareMonthlySpend);
  const compSeriesName = compareMode === "previous_year" ? "Previous Year" : "Previous Period";
  const hasCompare = compareMode !== "none" && compRows.length > 0;

  const tableData = rows.map((r, i) => {
    const rowObj: Record<string, any> = { Month: r.label, Spend: r.spend, Orders: r.orders };
    if (hasCompare) {
      let compSpend: number | null = null;
      if (compareMode === "previous_year" && /^\d{4}-\d{2}$/.test(r.label)) {
        const prevYear = Number(r.label.slice(0, 4)) - 1;
        const targetLabel = `${prevYear}${r.label.slice(4)}`;
        const match = compRows.find((c) => c.label === targetLabel);
        if (match) compSpend = match.spend;
      }
      if (compSpend === null) {
        compSpend = compRows[i]?.spend ?? null;
      }
      rowObj[compSeriesName] = compSpend !== null ? compSpend : "-";
    }
    return rowObj;
  });

  const caption = computeSpendTrendTakeaway(rows.map((r) => ({ date: r.label, amount: r.spend })));
  const empty = isEmpty || (rows.length === 0 && !isLoading && !error);

  const containerRef = React.useRef<HTMLDivElement>(null);
  const chartRef = React.useRef<echarts.ECharts | null>(null);
  const idRef = React.useRef(`monthly-trend-${Math.random().toString(36).slice(2, 9)}`);
  const chartId = idRef.current;

  const filtersRef = React.useRef(filters);
  React.useEffect(() => {
    filtersRef.current = filters;
  });

  const applyUpdate = React.useCallback(() => {
    const node = containerRef.current;
    if (!node) return;
    registerOnce();
    if (!chartRef.current || chartRef.current.isDisposed()) {
      chartRef.current = echarts.init(node);
    }
    const chart = chartRef.current;
    const theme = getCurrentChartTheme();
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const option = buildMonthlyTrendOption(data ?? [], {
      metric,
      theme,
      reducedMotion: prefersReducedMotion,
      compareData,
      compareMonthlySpend,
      compareMode,
    });
    // merge base theme
    const base = buildBaseChartOption(theme, prefersReducedMotion);
    chart.setOption({ ...base, ...option }, { notMerge: true, lazyUpdate: true });
  }, [data, metric, compareData, compareMonthlySpend, compareMode]);

  React.useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    registerOnce();
    if (!chartRef.current || chartRef.current.isDisposed()) {
      chartRef.current = echarts.init(node);
    }
    const chart = chartRef.current;
    const unregister = registerChart(chartId, chart, () => undefined);

    const handleClick = (params: any) => {
      const month = params?.name ?? params?.value;
      if (month != null && filtersRef.current) {
        filtersRef.current.applyCrossFilter("month", String(month));
      }
    };
    const handleOver = (params: any) => {
      const month = params?.name;
      if (month != null) emitHighlight(chartId, "month", String(month));
    };
    const handleOut = () => emitClear(chartId);

    chart.on("click", handleClick);
    chart.on("mouseover", handleOver);
    chart.on("mouseout", handleOut);

    const ro = new ResizeObserver(() => {
      if (chart && !chart.isDisposed()) chart.resize();
    });
    ro.observe(node);

    applyUpdate();

    return () => {
      chart.off("click", handleClick);
      chart.off("mouseover", handleOver);
      chart.off("mouseout", handleOut);
      unregister();
      ro.disconnect();
      if (chartRef.current) {
        chartRef.current.dispose();
        chartRef.current = null;
      }
    };
  }, [chartId, applyUpdate]);

  React.useEffect(() => {
    applyUpdate();
  }, [applyUpdate]);

  return (
    <ChartCard
      title={title}
      subtitle={subtitle}
      caption={caption ?? undefined}
      isLoading={isLoading}
      isEmpty={empty}
      emptyReason={emptyReason}
      error={error}
      onRetry={onRetry}
      tableData={tableData}
    >
      <div className="space-y-2">
        <SegmentedControl
          options={[
            { value: "spend", label: "Spend" },
            { value: "orders", label: "Orders" },
            { value: "both", label: "Both" },
          ]}
          value={metric}
          onChange={(v) => setMetric(v as MonthlyTrendMetric)}
        />
        <div ref={containerRef} role="img" aria-label={title} style={{ height: 320, width: "100%" }} />
      </div>
    </ChartCard>
  );
}

export default MonthlyTrendChart;
