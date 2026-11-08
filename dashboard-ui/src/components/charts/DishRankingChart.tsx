import * as React from "react";
import * as echarts from "echarts/core";
import { BarChart, type BarSeriesOption } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  AriaComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsCoreOption } from "echarts/core";
import { Info } from "lucide-react";

import { ChartCard } from "../dashboard/ChartCard";
import { SegmentedControl } from "../ui/segmented-control";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import {
  getCurrentChartTheme,
  buildBaseChartOption,
  resolveChartTheme,
  type ChartTheme,
} from "../../lib/chart-theme";
import {
  computeDishRankingTakeaway,
  formatRupees,
  type DishRankingDatumLike,
  type DishRankingMetric,
} from "../../lib/captions";
import { subscribeTheme } from "../../app/theme";
import { useFilters } from "../../app/FilterContext";
import { registerChart } from "../../lib/highlight-bus";

export interface DishRankingDatum extends DishRankingDatumLike {
  key?: string | null;
  name?: string | null;
  quantity?: number | null;
  count?: number | null;
  qty?: number | null;
  amount?: number | null;
  spend?: number | null;
  total?: number | null;
  value?: number | null;
  avg_price?: number | null;
  avgPrice?: number | null;
}

export interface NormalizedDishItem {
  key: string;
  name: string;
  quantity: number;
  amount: number;
  avgPrice: number;
}

export interface BuildDishRankingOptionParams {
  data?: unknown;
  dishes?: readonly (DishRankingDatum | null | undefined)[] | null;
  metric?: DishRankingMetric;
  theme?: ChartTheme;
  prefersReducedMotion?: boolean;
  maxItems?: number;
}

export interface DishRankingChartProps {
  data?: unknown;
  dishes?: readonly (DishRankingDatum | null | undefined)[] | null;
  items?: readonly (DishRankingDatum | null | undefined)[] | null;
  metric?: DishRankingMetric;
  defaultMetric?: DishRankingMetric;
  onMetricChange?: (metric: DishRankingMetric) => void;
  maxItems?: number;
  title?: string;
  subtitle?: string;
  caption?: string;
  isLoading?: boolean;
  isEmpty?: boolean;
  emptyReason?: string;
  error?: Error | string | null;
  onRetry?: () => void;
  onDishClick?: (dish: NormalizedDishItem) => void;
  showTable?: boolean;
  onShowTableChange?: (value: boolean) => void;
  fullscreen?: boolean;
  onFullscreenChange?: (value: boolean) => void;
  className?: string;
}

let echartsRegistered = false;
function registerDishRankingModules() {
  if (echartsRegistered) return;
  echarts.use([
    BarChart,
    GridComponent,
    TooltipComponent,
    AriaComponent,
    CanvasRenderer,
  ]);
  echartsRegistered = true;
}
registerDishRankingModules();

function useOptionalFilters() {
  try {
    return useFilters();
  } catch {
    return null;
  }
}

/**
 * Normalizes, aggregates duplicate dishes by name/key, calculates average price,
 * sorts descending by the selected metric (quantity or amount), and limits to maxItems (top 15).
 */
export function normalizeDishRankingData(
  data?: unknown,
  metric: DishRankingMetric = "quantity",
  maxItems = 15,
): NormalizedDishItem[] {
  let rawList: unknown[] = [];

  if (Array.isArray(data)) {
    rawList = data;
  } else if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    const candidate =
      obj.top_dishes ??
      obj.topDishes ??
      obj.dishes ??
      obj.items ??
      obj.rows ??
      obj.data;
    if (Array.isArray(candidate)) {
      rawList = candidate;
    }
  }

  const totals = new Map<string, { key: string; name: string; quantity: number; amount: number }>();

  for (const raw of rawList) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const rawName = String(item.name ?? item.key ?? "").trim();
    if (!rawName) continue;
    const rawKey = String(item.key ?? item.name ?? rawName).trim();

    const q = Number(item.quantity ?? item.count ?? item.qty ?? 0);
    const quantity = Number.isFinite(q) && q > 0 ? q : 0;

    const a = Number(item.amount ?? item.spend ?? item.total ?? item.value ?? 0);
    const amount = Number.isFinite(a) && a > 0 ? a : 0;

    const existing = totals.get(rawName);
    if (existing) {
      existing.quantity += quantity;
      existing.amount += amount;
      if (!existing.key && rawKey) existing.key = rawKey;
    } else {
      totals.set(rawName, {
        key: rawKey || rawName,
        name: rawName,
        quantity,
        amount,
      });
    }
  }

  const items: NormalizedDishItem[] = [];
  for (const entry of totals.values()) {
    if (entry.quantity <= 0 && entry.amount <= 0) continue;
    const avgPrice = entry.quantity > 0 && entry.amount > 0 ? Math.round(entry.amount / entry.quantity) : 0;
    items.push({
      key: entry.key,
      name: entry.name,
      quantity: entry.quantity,
      amount: entry.amount,
      avgPrice,
    });
  }

  // Sort descending by active metric with tiebreaker on secondary metric
  if (metric === "amount") {
    items.sort((a, b) => b.amount - a.amount || b.quantity - a.quantity || a.name.localeCompare(b.name));
  } else {
    items.sort((a, b) => b.quantity - a.quantity || b.amount - a.amount || a.name.localeCompare(b.name));
  }

  return items.slice(0, Math.max(1, maxItems));
}

/**
 * Rich HTML tooltip for ranked dishes (CC-5).
 * Displays rank, dish name, quantity, total spend in formatRupees, and average price per unit in formatRupees.
 */
export function formatDishRankingTooltip(
  params: unknown,
  displayed: readonly NormalizedDishItem[],
  theme: ChartTheme,
): string {
  if (!params) return "";
  const items = Array.isArray(params) ? params : [params];
  if (items.length === 0) return "";

  const p = items[0] as {
    dataIndex?: number;
    name?: string;
    data?: { dishName?: string; dishKey?: string; rank?: number; quantity?: number; amount?: number; avgPrice?: number };
  };

  const idx = typeof p.dataIndex === "number" ? p.dataIndex : 0;
  const row = displayed[idx];

  const rank = p.data?.rank ?? idx + 1;
  const name = p.data?.dishName ?? row?.name ?? p.name ?? "Dish";
  const qty = p.data?.quantity ?? row?.quantity ?? 0;
  const amount = p.data?.amount ?? row?.amount ?? 0;
  const avgPrice = p.data?.avgPrice ?? row?.avgPrice ?? (qty > 0 && amount > 0 ? Math.round(amount / qty) : 0);

  const formattedAmount = formatRupees(amount);
  const formattedAvgPrice = formatRupees(avgPrice);
  const qtyText = `${qty} ${qty === 1 ? "order" : "orders"}`;

  return `
    <div style="font-family: inherit; font-size: 12px; line-height: 1.5; min-width: 190px;">
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px; border-bottom: 1px solid ${theme.border}; padding-bottom: 4px;">
        <span style="font-weight: 600; color: ${theme.textColor};">${name}</span>
        <span style="font-size: 10px; font-weight: 700; background: ${theme.border}; color: ${theme.textColor}; padding: 1px 6px; border-radius: 4px;">#${rank}</span>
      </div>
      <div style="display: flex; justify-content: space-between; gap: 12px; margin-bottom: 3px;">
        <span style="color: ${theme.mutedColor};">Quantity:</span>
        <strong style="color: ${theme.textColor}; font-family: monospace;">${qtyText}</strong>
      </div>
      <div style="display: flex; justify-content: space-between; gap: 12px; margin-bottom: 3px;">
        <span style="color: ${theme.mutedColor};">Total spend:</span>
        <strong style="color: ${theme.textColor}; font-family: monospace;">${formattedAmount}</strong>
      </div>
      <div style="display: flex; justify-content: space-between; gap: 12px;">
        <span style="color: ${theme.mutedColor};">Average price:</span>
        <strong style="color: ${theme.textColor}; font-family: monospace;">${formattedAvgPrice}</strong>
      </div>
    </div>
  `.trim();
}

/**
 * Handles clicking a dish bar (Scenario: Click, S-020).
 * Updates global search filter via filters.update({ search: dish.name }) and calls optional onDishClick.
 */
export function handleDishClick(
  params: unknown,
  displayed: readonly NormalizedDishItem[],
  filters?: { update: (patch: { search: string }) => void } | null,
  onDishClick?: (item: NormalizedDishItem) => void,
): string | null {
  const p = params as {
    name?: unknown;
    data?: { dishKey?: unknown; key?: unknown; name?: unknown; dishName?: unknown };
    dataIndex?: number;
  } | null;

  const idx = typeof p?.dataIndex === "number" ? p.dataIndex : -1;
  const item = idx >= 0 && idx < displayed.length ? displayed[idx] : undefined;

  const dishName =
    (typeof item?.name === "string" && item.name.trim()) ||
    (typeof p?.data?.dishName === "string" && p.data.dishName.trim()) ||
    (typeof p?.data?.name === "string" && p.data.name.trim()) ||
    (typeof p?.name === "string" && p.name.trim()) ||
    null;

  if (dishName) {
    if (filters?.update) {
      filters.update({ search: dishName });
    }
    const resolvedItem = item ?? {
      key: String(p?.data?.dishKey ?? p?.data?.key ?? dishName),
      name: dishName,
      quantity: 0,
      amount: 0,
      avgPrice: 0,
    };
    onDishClick?.(resolvedItem);
    return dishName;
  }
  return null;
}

/**
 * Pure option builder (CC-11):
 * Data in, ECharts Core Option out.
 * Overloaded to support both single parameter object and legacy positional signatures.
 */
export function buildDishRankingOption(
  paramsOrData?: BuildDishRankingOptionParams | unknown,
  metricOrOpts?: DishRankingMetric | BuildDishRankingOptionParams,
  themeArg?: ChartTheme,
): EChartsCoreOption {
  let dataInput: unknown;
  let metric: DishRankingMetric = "quantity";
  let theme: ChartTheme | undefined;
  let prefersReducedMotion = false;
  let maxItems = 15;

  if (paramsOrData && typeof paramsOrData === "object" && ("theme" in paramsOrData || "metric" in paramsOrData || "data" in paramsOrData || "dishes" in paramsOrData)) {
    const params = paramsOrData as BuildDishRankingOptionParams;
    dataInput = params.dishes ?? params.data;
    if (params.metric) metric = params.metric;
    if (params.theme) theme = params.theme;
    if (typeof params.prefersReducedMotion === "boolean") prefersReducedMotion = params.prefersReducedMotion;
    if (typeof params.maxItems === "number") maxItems = params.maxItems;
  } else {
    dataInput = paramsOrData;
    if (typeof metricOrOpts === "string") {
      metric = metricOrOpts;
    } else if (metricOrOpts && typeof metricOrOpts === "object") {
      const opts = metricOrOpts as BuildDishRankingOptionParams;
      if (opts.metric) metric = opts.metric;
      if (opts.theme) theme = opts.theme;
      if (typeof opts.prefersReducedMotion === "boolean") prefersReducedMotion = opts.prefersReducedMotion;
      if (typeof opts.maxItems === "number") maxItems = opts.maxItems;
    }
    if (themeArg) theme = themeArg;
  }

  const currentTheme =
    theme ??
    (typeof document === "undefined"
      ? resolveChartTheme("light", "emerald")
      : getCurrentChartTheme());

  const displayed = normalizeDishRankingData(dataInput, metric, maxItems);
  const base = buildBaseChartOption(currentTheme, prefersReducedMotion);

  const labels = displayed.map((d) => d.name);
  const isAmount = metric === "amount";

  const seriesData = displayed.map((d, i) => ({
    value: isAmount ? d.amount : d.quantity,
    dishKey: d.key,
    name: d.name,
    dishName: d.name,
    rank: i + 1,
    quantity: d.quantity,
    amount: d.amount,
    avgPrice: d.avgPrice,
    itemStyle: {
      color: currentTheme.colors[0],
      borderRadius: [0, 4, 4, 0],
    },
  }));

  const series: BarSeriesOption = {
    name: isAmount ? "Amount" : "Quantity",
    type: "bar",
    data: seriesData,
    barMaxWidth: 20,
    itemStyle: {
      color: currentTheme.colors[0],
      borderRadius: [0, 4, 4, 0],
    },
    emphasis: {
      focus: "self",
      itemStyle: {
        color: currentTheme.colors[0],
      },
    },
    label: {
      show: true,
      position: "right",
      fontSize: 10,
      color: currentTheme.mutedColor,
      formatter: (p: any) => {
        const idx = p?.dataIndex ?? 0;
        const d = displayed[idx];
        if (!d) return "";
        if (!isAmount) {
          return d.amount > 0 ? `${d.quantity} (${formatRupees(d.amount)})` : `${d.quantity}`;
        } else {
          return d.quantity > 0
            ? `${formatRupees(d.amount)} (${d.quantity} ${d.quantity === 1 ? "order" : "orders"})`
            : formatRupees(d.amount);
        }
      },
    },
    animation: !prefersReducedMotion,
    animationDuration: prefersReducedMotion ? 0 : 600,
    animationEasing: "cubicOut",
  };

  const option: EChartsCoreOption = {
    ...base,
    grid: {
      left: 16,
      right: 90,
      top: 16,
      bottom: 24,
      containLabel: true,
    },
    tooltip: {
      ...(base.tooltip as object),
      trigger: "item",
      axisPointer: { type: "shadow" },
      formatter: (p: unknown) => formatDishRankingTooltip(p, displayed, currentTheme),
    },
    xAxis: {
      type: "value",
      axisLabel: {
        color: currentTheme.mutedColor,
        fontSize: 10,
        formatter: (val: number) => (isAmount ? `₹${val.toLocaleString("en-IN")}` : `${val}`),
      },
      splitLine: {
        show: true,
        lineStyle: {
          color: currentTheme.splitLineColor,
          type: "dashed",
        },
      },
    },
    yAxis: {
      type: "category",
      data: labels,
      inverse: true, // Top ranked dish at the top
      axisLabel: {
        color: currentTheme.textColor,
        fontSize: 11,
        width: 140,
        overflow: "truncate",
        ellipsis: "...",
      },
      axisTick: { show: false },
      axisLine: {
        lineStyle: {
          color: currentTheme.axisLineColor,
        },
      },
    },
    series: [series],
  };

  return option;
}

export function DishRankingChart({
  data,
  dishes,
  items,
  metric: controlledMetric,
  defaultMetric = "quantity",
  onMetricChange,
  maxItems = 15,
  title = "Top dishes ranking",
  subtitle = "Leaderboard of most ordered items by volume and expenditure",
  caption,
  isLoading,
  isEmpty,
  emptyReason,
  error,
  onRetry,
  onDishClick,
  showTable,
  onShowTableChange,
  fullscreen,
  onFullscreenChange,
  className,
}: DishRankingChartProps) {
  const filters = useOptionalFilters();
  const [internalMetric, setInternalMetric] = React.useState<DishRankingMetric>(defaultMetric);
  const activeMetric = controlledMetric !== undefined ? controlledMetric : internalMetric;

  const handleMetricToggle = (next: DishRankingMetric) => {
    if (controlledMetric === undefined) {
      setInternalMetric(next);
    }
    onMetricChange?.(next);
  };

  const rawData = dishes ?? items ?? data;
  const displayedItems = React.useMemo(() => {
    return normalizeDishRankingData(rawData, activeMetric, maxItems);
  }, [rawData, activeMetric, maxItems]);

  const computedCaption = React.useMemo(() => {
    return computeDishRankingTakeaway(displayedItems, activeMetric);
  }, [displayedItems, activeMetric]);

  const resolvedCaption = caption ?? computedCaption ?? undefined;

  const resolvedEmptyReason =
    emptyReason ?? "No dish data available for the selected filters";
  const empty =
    isEmpty ||
    (!isLoading && !error && displayedItems.length === 0);

  const containerRef = React.useRef<HTMLDivElement>(null);
  const chartInstanceRef = React.useRef<echarts.ECharts | null>(null);
  const chartIdRef = React.useRef(`dish-ranking-${Math.random().toString(36).slice(2, 9)}`);

  const tableData = React.useMemo(() => {
    if (displayedItems.length === 0) return undefined;
    return displayedItems.map((d, i) => ({
      Rank: i + 1,
      Dish: d.name,
      Quantity: d.quantity,
      Amount: formatRupees(d.amount),
      "Avg price": formatRupees(d.avgPrice),
    }));
  }, [displayedItems]);

  const ariaDescription = React.useMemo(() => {
    if (displayedItems.length === 0) {
      return "Top dishes ranking chart with no data.";
    }
    const top = displayedItems[0];
    const topMetricDesc =
      activeMetric === "amount"
        ? `${formatRupees(top.amount)} spend`
        : `${top.quantity} orders`;
    return `Horizontal bar chart showing top ${displayedItems.length} dishes ranked by ${activeMetric === "amount" ? "expenditure" : "order volume"}. Top dish is ${top.name} with ${topMetricDesc}.`;
  }, [displayedItems, activeMetric]);

  const callbacksRef = React.useRef({ onDishClick, filters, displayedItems });
  callbacksRef.current = { onDishClick, filters, displayedItems };

  const dataRef = React.useRef({ displayedItems, activeMetric, maxItems });
  dataRef.current = { displayedItems, activeMetric, maxItems };

  const applyUpdate = React.useCallback(() => {
    const node = containerRef.current;
    if (!node) return;
    if (!chartInstanceRef.current || chartInstanceRef.current.isDisposed()) {
      chartInstanceRef.current = echarts.init(node);
    }
    const chart = chartInstanceRef.current;
    const theme = getCurrentChartTheme();
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const option = buildDishRankingOption({
      data: dataRef.current.displayedItems,
      metric: dataRef.current.activeMetric,
      theme,
      prefersReducedMotion,
      maxItems: dataRef.current.maxItems,
    });

    chart.setOption(option, { notMerge: true, lazyUpdate: true });
  }, []);

  // Chart initialization & resize handling
  React.useEffect(() => {
    const node = containerRef.current;
    if (!node || empty || isLoading || error) return;
    registerDishRankingModules();

    if (!chartInstanceRef.current || chartInstanceRef.current.isDisposed()) {
      chartInstanceRef.current = echarts.init(node);
    }
    const chart = chartInstanceRef.current;
    const unregister = registerChart(chartIdRef.current, chart, () => undefined);

    const onChartClick = (params: unknown) => {
      handleDishClick(
        params,
        callbacksRef.current.displayedItems,
        callbacksRef.current.filters,
        callbacksRef.current.onDishClick,
      );
    };

    chart.on("click", onChartClick);

    const ro = new ResizeObserver(() => {
      if (chart && !chart.isDisposed()) {
        chart.resize();
      }
    });
    ro.observe(node);

    applyUpdate();

    return () => {
      chart.off("click", onChartClick);
      unregister();
      ro.disconnect();
      if (chartInstanceRef.current) {
        chartInstanceRef.current.dispose();
        chartInstanceRef.current = null;
      }
    };
  }, [empty, isLoading, error, applyUpdate]);

  // Option application & theme updates
  React.useEffect(() => {
    if (empty || isLoading || error) return;
    applyUpdate();

    const unsubscribe = subscribeTheme(() => {
      applyUpdate();
    });

    return () => {
      unsubscribe();
    };
  }, [displayedItems, activeMetric, empty, isLoading, error, maxItems, applyUpdate]);

  const infoPopover = (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Dish ranking information"
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
          <p className="font-semibold text-foreground text-sm">Top Dishes Ranking</p>
          <p className="text-muted-foreground mt-0.5 leading-relaxed">
            Leaderboard of your top 15 most ordered dishes across your entire dining history.
          </p>
        </div>
        <div className="space-y-1.5 pt-1 border-t border-border/50">
          <p className="font-medium text-foreground">Metric Toggle (Quantity vs Amount)</p>
          <p className="text-muted-foreground leading-relaxed">
            Switch between <strong>Quantity</strong> (total item units/orders) and <strong>Amount</strong> (total rupee expenditure) to analyze both order volume popularity and spending impact.
          </p>
        </div>
        <div className="space-y-1.5 pt-1 border-t border-border/50">
          <p className="font-medium text-foreground">Click to Search Filter</p>
          <p className="text-muted-foreground leading-relaxed">
            Clicking any dish bar immediately updates the global search filter with that dish name, drilling down your orders, restaurants, and spend patterns.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );

  return (
    <ChartCard
      title={title}
      subtitle={subtitle}
      caption={resolvedCaption}
      infoPopover={infoPopover}
      isLoading={isLoading}
      isEmpty={empty}
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
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <SegmentedControl
            options={[
              { value: "quantity", label: "Quantity" },
              { value: "amount", label: "Amount" },
            ]}
            value={activeMetric}
            onChange={(v) => handleMetricToggle(v as DishRankingMetric)}
          />
        </div>
        <div
          ref={containerRef}
          role="img"
          aria-label={title}
          aria-description={ariaDescription}
          style={{ height: 420, width: "100%" }}
        />
      </div>
    </ChartCard>
  );
}

export default DishRankingChart;
