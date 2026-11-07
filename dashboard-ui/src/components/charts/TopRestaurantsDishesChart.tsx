import * as React from "react";
import * as echarts from "echarts/core";
import { BarChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  ToolboxComponent,
  AriaComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsCoreOption } from "echarts/core";

import { ChartCard } from "@/components/dashboard/ChartCard";
import { getCurrentChartTheme, buildBaseChartOption, resolveChartTheme } from "@/lib/chart-theme";
import { computeTopRestaurantTakeaway } from "@/lib/captions";
import { useFilters } from "@/app/FilterContext";
import {
  registerChart,
} from "@/lib/highlight-bus";
import { useLocation } from "react-router-dom";

let registered = false;
function registerOnce() {
  if (registered) return;
  echarts.use([
    BarChart,
    GridComponent,
    TooltipComponent,
    LegendComponent,
    ToolboxComponent,
    AriaComponent,
    CanvasRenderer,
  ]);
  registered = true;
}
registerOnce();

export interface TopRestaurantsDishesDatum {
  key?: string | null;
  name?: string | null;
  quantity?: number | null;
  count?: number | null;
  amount?: number | null;
  total?: number | null;
  spend?: number | null;
}

export interface BuildTopRestaurantsDishesOptionInput {
  theme?: ReturnType<typeof getCurrentChartTheme>;
  reducedMotion?: boolean;
}

function normalizeRows(data: unknown) {
  let list: any[] = [];
  if (Array.isArray(data)) {
    list = data;
  } else if (data && typeof data === "object") {
    const obj = data as any;
    list =
      obj.top_restaurants ??
      obj.topRestaurants ??
      obj.restaurants ??
      obj.top_dishes ??
      obj.topDishes ??
      obj.dishes ??
      obj.items ??
      obj.data ??
      [];
    if (!Array.isArray(list)) list = [];
  }
  return list
    .map((r: any) => ({
      key: String(r?.key ?? r?.name ?? ""),
      label: String(r?.name ?? r?.key ?? ""),
      value: Number(r?.amount ?? r?.total ?? r?.spend ?? r?.value ?? 0),
      quantity: Number(r?.quantity ?? r?.count ?? r?.qty ?? 0),
    }))
    .filter((r) => r.label !== "")
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);
}

function useOptionalFilters() {
  try {
    return useFilters();
  } catch {
    return null;
  }
}

function useOptionalLocation() {
  try {
    return useLocation();
  } catch {
    return { search: typeof window !== "undefined" ? window.location.search : "" } as any;
  }
}

export function buildTopRestaurantsDishesOption(
  data: unknown,
  metricOrOpts?: BuildTopRestaurantsDishesOptionInput | ReturnType<typeof getCurrentChartTheme>,
  themeArg?: ReturnType<typeof getCurrentChartTheme>,
): EChartsCoreOption {
  let theme: ReturnType<typeof getCurrentChartTheme> | undefined;
  let reducedMotion = false;
  if (metricOrOpts && typeof metricOrOpts === "object" && ("theme" in (metricOrOpts as any) || "reducedMotion" in (metricOrOpts as any))) {
    const opts = metricOrOpts as BuildTopRestaurantsDishesOptionInput;
    if (opts.theme) theme = opts.theme;
    if (typeof opts.reducedMotion === "boolean") reducedMotion = opts.reducedMotion;
  } else if (metricOrOpts) {
    theme = metricOrOpts as ReturnType<typeof getCurrentChartTheme>;
  }
  if (themeArg) theme = themeArg;
  if (!theme) {
    theme =
      typeof document === "undefined"
        ? resolveChartTheme("light", "emerald")
        : getCurrentChartTheme();
  }

  const rows = normalizeRows(data);
  const labels = rows.map((r) => r.label);
  const values = rows.map((r) => r.value);

  const base = buildBaseChartOption(theme, reducedMotion);

  const option: EChartsCoreOption = {
    ...base,
    tooltip: {
      ...base.tooltip,
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (params: unknown) => {
        const p = Array.isArray(params) ? params[0] : params;
        const idx = (p as any)?.dataIndex ?? 0;
        const row = rows[idx];
        const amount = row ? `₹${row.value.toLocaleString("en-IN")}` : "";
        const qty = row ? `${row.quantity} ${row.quantity === 1 ? "order" : "orders"}` : "";
        return `<div class="font-bold text-xs mb-1">${(p as any)?.name ?? ""}</div><div class="text-xs">${amount} · ${qty}</div>`;
      },
    },
    grid: { left: 120, right: 40, top: 16, bottom: 24 },
    xAxis: {
      type: "value",
      axisLabel: { fontSize: 10 },
      splitLine: { show: true },
    },
    yAxis: {
      type: "category",
      data: labels,
      axisLabel: { fontSize: 11 },
      inverse: true,
    },
    series: [
      {
        type: "bar",
        data: values,
        itemStyle: { color: theme["chart-1"], borderRadius: [0, 4, 4, 0] },
        barMaxWidth: 24,
        label: {
          show: true,
          position: "right",
          formatter: (params: any) => {
            const row = rows[params?.dataIndex];
            return row ? String(row.quantity) : "";
          },
          fontSize: 10,
        },
      },
    ],
  };

  return option;
}

// Aliases
export const buildTopRestaurantsOption = buildTopRestaurantsDishesOption;
export const buildTopDishesOption = buildTopRestaurantsDishesOption;
export const buildOption = buildTopRestaurantsDishesOption;

export interface TopRestaurantsDishesChartProps {
  data?: unknown;
  restaurants?: readonly TopRestaurantsDishesDatum[] | null;
  dishes?: readonly TopRestaurantsDishesDatum[] | null;
  topRestaurants?: readonly TopRestaurantsDishesDatum[] | null;
  topDishes?: readonly TopRestaurantsDishesDatum[] | null;
  title?: string;
  subtitle?: string;
  isLoading?: boolean;
  isEmpty?: boolean;
  emptyReason?: string;
  error?: Error | string | null;
  onRetry?: () => void;
}

export function TopRestaurantsDishesChart({
  data,
  restaurants,
  dishes,
  topRestaurants,
  topDishes,
  title = "Top restaurants and dishes",
  subtitle = "Top 5 by spend, with quantities",
  isLoading,
  isEmpty,
  emptyReason,
  error,
  onRetry,
}: TopRestaurantsDishesChartProps) {
  const filters = useOptionalFilters();
  const location = useOptionalLocation();

  const restRows = normalizeRows(
    restaurants ?? topRestaurants ?? (data as any)?.top_restaurants ?? (data as any)?.topRestaurants ?? (data as any)?.restaurants ?? (Array.isArray(data) ? data : null),
  );
  // dishes: if data has both, use top_dishes
  const dishRows = normalizeRows(
    dishes ?? topDishes ?? (data as any)?.top_dishes ?? (data as any)?.topDishes ?? (data as any)?.dishes ?? null,
  );

  // If only one list provided via data array, show restaurants only; dishes empty
  const restData = restRows.map((r) => ({ name: r.label, quantity: r.quantity, amount: r.value, key: r.key }));
  const dishData = dishRows.map((r) => ({ name: r.label, quantity: r.quantity, amount: r.value, key: r.key }));

  const tableData = [
    ...restData.map((r) => ({ Type: "Restaurant", Name: r.name, Amount: r.amount, Quantity: r.quantity })),
    ...dishData.map((r) => ({ Type: "Dish", Name: r.name, Amount: r.amount, Quantity: r.quantity })),
  ];

  const caption = computeTopRestaurantTakeaway(restData.map((r) => ({ name: r.name, count: r.quantity, total: r.amount })));

  const empty = isEmpty || (restData.length === 0 && dishData.length === 0 && !isLoading && !error);

  const restContainerRef = React.useRef<HTMLDivElement>(null);
  const dishContainerRef = React.useRef<HTMLDivElement>(null);
  const restChartRef = React.useRef<echarts.ECharts | null>(null);
  const dishChartRef = React.useRef<echarts.ECharts | null>(null);
  const restIdRef = React.useRef(`top-rest-${Math.random().toString(36).slice(2, 9)}`);
  const dishIdRef = React.useRef(`top-dish-${Math.random().toString(36).slice(2, 9)}`);
  const restId = restIdRef.current;
  const dishId = dishIdRef.current;

  React.useEffect(() => {
    const node = restContainerRef.current;
    if (!node) return;
    registerOnce();
    if (!restChartRef.current) restChartRef.current = echarts.init(node);
    const chart = restChartRef.current;
    const unregister = registerChart(restId, chart, () => undefined);

    const handleClick = (params: any) => {
      const idx = params?.dataIndex;
      const row = restData[idx];
      const id = row?.key || row?.name || params?.name;
      if (id != null && filters) {
        filters.applyCrossFilter("restaurant", String(id));
      }
    };
    const handleOver = (params: any) => {
      const name = params?.name;
      if (name != null) {
        // emitHighlight optional; skip to avoid import complexity
      }
    };
    chart.on("click", handleClick);
    const ro = new ResizeObserver(() => {
      if (chart && !chart.isDisposed()) chart.resize();
    });
    ro.observe(node);
    return () => {
      chart.off("click", handleClick);
      unregister();
      ro.disconnect();
      if (restChartRef.current) {
        restChartRef.current.dispose();
        restChartRef.current = null;
      }
    };
  }, [restId, filters]);

  React.useEffect(() => {
    const node = dishContainerRef.current;
    if (!node) return;
    registerOnce();
    if (!dishChartRef.current) dishChartRef.current = echarts.init(node);
    const chart = dishChartRef.current;
    const unregister = registerChart(dishId, chart, () => undefined);
    const ro = new ResizeObserver(() => {
      if (chart && !chart.isDisposed()) chart.resize();
    });
    ro.observe(node);
    return () => {
      unregister();
      ro.disconnect();
      if (dishChartRef.current) {
        dishChartRef.current.dispose();
        dishChartRef.current = null;
      }
    };
  }, [dishId]);

  React.useEffect(() => {
    const chart = restChartRef.current;
    if (!chart || chart.isDisposed()) return;
    const theme = getCurrentChartTheme();
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const option = buildTopRestaurantsDishesOption(restData, { theme, reducedMotion: prefersReducedMotion });
    chart.setOption(option, { notMerge: true, lazyUpdate: true });
  }, [restData]);

  React.useEffect(() => {
    const chart = dishChartRef.current;
    if (!chart || chart.isDisposed()) return;
    const theme = getCurrentChartTheme();
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const option = buildTopRestaurantsDishesOption(dishData, { theme, reducedMotion: prefersReducedMotion });
    chart.setOption(option, { notMerge: true, lazyUpdate: true });
  }, [dishData]);

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
      <div className="space-y-4">
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-1">Restaurants</div>
          <div ref={restContainerRef} role="img" aria-label="Top restaurants" style={{ height: 200, width: "100%" }} />
        </div>
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-1">Dishes</div>
          <div ref={dishContainerRef} role="img" aria-label="Top dishes" style={{ height: 200, width: "100%" }} />
        </div>
        <div>
          <a href={`/food${location.search}`}>View all</a>
        </div>
      </div>
    </ChartCard>
  );
}

export default TopRestaurantsDishesChart;
