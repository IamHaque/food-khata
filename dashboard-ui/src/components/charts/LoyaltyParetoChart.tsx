import { getPatterns } from "../../app/theme";
import * as React from "react";
import * as echarts from "echarts/core";
import { BarChart, LineChart, type BarSeriesOption, type LineSeriesOption } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  MarkLineComponent,
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
  computeLoyaltyParetoTakeaway,
  formatRupees,
  type LoyaltyParetoDatumLike,
} from "../../lib/captions";
import { isDimensionMatch } from "../../lib/highlight-bus";

export interface LoyaltyParetoDatum extends LoyaltyParetoDatumLike {
  key?: string | null;
  name?: string | null;
  orders?: number | null;
  count?: number | null;
  spend?: number | null;
  amount?: number | null;
  aov?: number | null;
}

export interface BuildLoyaltyParetoOptionParams {
  data?: readonly LoyaltyParetoDatum[] | null;
  theme?: ChartTheme;
  prefersReducedMotion?: boolean;
  maxItems?: number;
}

export interface LoyaltyParetoChartProps {
  data?: readonly LoyaltyParetoDatum[] | null;
  isLoading?: boolean;
  isEmpty?: boolean;
  emptyReason?: string;
  error?: Error | string | null;
  onRetry?: () => void;
  className?: string;
  title?: string;
  subtitle?: string;
  caption?: string;
  maxItems?: number;
  onRestaurantClick?: ((restaurantKey: string, params?: unknown) => void) | ((item: LoyaltyParetoDatum) => void);
  showTable?: boolean;
  onShowTableChange?: (value: boolean) => void;
  fullscreen?: boolean;
  onFullscreenChange?: (value: boolean) => void;
}

let echartsRegistered = false;
function registerLoyaltyParetoModules() {
  if (echartsRegistered) return;
  echarts.use([
    BarChart,
    LineChart,
    GridComponent,
    TooltipComponent,
    LegendComponent,
    MarkLineComponent,
    AriaComponent,
    CanvasRenderer,
  ]);
  echartsRegistered = true;
}
registerLoyaltyParetoModules();


export interface NormalizedLoyaltyItem {
  key: string;
  name: string;
  orders: number;
  spend: number;
  aov: number;
}

export function normalizeLoyaltyData(
  data?: readonly (LoyaltyParetoDatum | null | undefined)[] | null,
): { items: NormalizedLoyaltyItem[]; totalOrders: number } {
  const rawItems = data ?? [];
  const validItems: NormalizedLoyaltyItem[] = [];

  for (const item of rawItems) {
    if (!item) continue;
    const orders = item.orders ?? item.count ?? 0;
    if (typeof orders !== "number" || !Number.isFinite(orders) || orders <= 0) continue;
    const name = String(item.name ?? item.key ?? "").trim();
    if (!name) continue;
    const key = String(item.key ?? item.name ?? name).trim();
    const spend =
      typeof item.spend === "number" && Number.isFinite(item.spend) && item.spend >= 0
        ? item.spend
        : typeof item.amount === "number" && Number.isFinite(item.amount) && item.amount >= 0
        ? item.amount
        : 0;
    const aov =
      typeof item.aov === "number" && Number.isFinite(item.aov) && item.aov > 0
        ? item.aov
        : orders > 0 && spend > 0
        ? Math.round(spend / orders)
        : 0;

    validItems.push({ key, name, orders, spend, aov });
  }

  // Rank descending by orders
  validItems.sort((a, b) => b.orders - a.orders);
  const totalOrders = validItems.reduce((acc, item) => acc + item.orders, 0);

  return { items: validItems, totalOrders };
}

export function formatLoyaltyParetoTooltip(
  params: unknown,
  theme: ChartTheme,
  metadataMap?: Map<string, { orders: number; spend: number; aov: number; cumPercent: number; name: string }>,
): string {
  if (!params) return "";
  const items = Array.isArray(params) ? params : [params];
  if (items.length === 0) return "";

  const first = items[0] as any;
  const restaurantName = String(
    first?.data?.restaurantName ??
      first?.data?.name ??
      first?.name ??
      first?.axisValueLabel ??
      first?.axisValue ??
      "",
  ).trim();

  const meta =
    metadataMap?.get(restaurantName) ??
    (first?.data && typeof first.data === "object" ? first.data : null);

  let orders = meta?.orders ?? (typeof first?.value === "number" ? first.value : 0);
  let cumPercent = meta?.cumPercent ?? 0;
  const spend = meta?.spend ?? 0;
  const aov = meta?.aov ?? (orders > 0 && spend > 0 ? Math.round(spend / orders) : 0);

  for (const p of items as any[]) {
    if (!p) continue;
    const seriesType = p.seriesType;
    const seriesName = String(p.seriesName ?? "").toLowerCase();
    if (seriesType === "bar" || seriesName.includes("order")) {
      const val = typeof p.value === "number" ? p.value : p.data?.value;
      if (typeof val === "number" && Number.isFinite(val)) {
        orders = val;
      }
    } else if (seriesType === "line" || seriesName.includes("cumulat")) {
      const val = typeof p.value === "number" ? p.value : p.data?.value;
      if (typeof val === "number" && Number.isFinite(val)) {
        cumPercent = val;
      }
    }
  }

  const spendFormatted = formatRupees(spend);
  const aovFormatted = formatRupees(aov);

  return `
    <div style="font-family: inherit; font-size: 12px; line-height: 1.5; min-width: 190px;">
      <div style="font-weight: 600; margin-bottom: 6px; color: ${theme.textColor}; border-bottom: 1px solid ${theme.border}; padding-bottom: 4px;">
        ${restaurantName}
      </div>
      <div style="display: flex; justify-content: space-between; gap: 14px; margin-bottom: 4px;">
        <span style="color: ${theme.mutedColor};">Orders:</span>
        <strong style="color: ${theme.textColor}; font-family: monospace;">${orders} orders (cumulative ${cumPercent}%)</strong>
      </div>
      <div style="display: flex; justify-content: space-between; gap: 14px; margin-bottom: 4px;">
        <span style="color: ${theme.mutedColor};">Total spend:</span>
        <strong style="color: ${theme.textColor}; font-family: monospace;">${spendFormatted}</strong>
      </div>
      <div style="display: flex; justify-content: space-between; gap: 14px;">
        <span style="color: ${theme.mutedColor};">Average order value:</span>
        <strong style="color: ${theme.textColor}; font-family: monospace;">${aovFormatted}</strong>
      </div>
    </div>
  `.trim();
}

export function handleLoyaltyParetoClick(
  params: unknown,
  displayed: readonly NormalizedLoyaltyItem[],
  filters?: { update: (patch: { restaurant_ids: string[] }) => void } | null,
  onRestaurantClick?: ((restaurantKey: string, params?: unknown) => void) | ((item: LoyaltyParetoDatum) => void),
): string | null {
  const p = params as {
    name?: unknown;
    data?: { restaurantKey?: unknown; key?: unknown; name?: unknown };
    dataIndex?: number;
  } | null;

  let restaurantId: string | null = null;
  const idx = typeof p?.dataIndex === "number" ? p.dataIndex : -1;
  const matchedItem = idx >= 0 && idx < displayed.length ? displayed[idx] : undefined;

  if (p?.data?.restaurantKey && typeof p.data.restaurantKey === "string") {
    restaurantId = p.data.restaurantKey.trim();
  } else if (p?.data?.key && typeof p.data.key === "string") {
    restaurantId = p.data.key.trim();
  } else if (matchedItem?.key) {
    restaurantId = matchedItem.key;
  } else if (typeof p?.name === "string" && p.name.trim()) {
    restaurantId = p.name.trim();
  }

  if (restaurantId) {
    if (filters?.update) {
      filters.update({ restaurant_ids: [restaurantId] });
    }
    onRestaurantClick?.(restaurantId, matchedItem ?? params);
    return restaurantId;
  }
  return null;
}

/**
 * Pure option builder (CC-11):
 * Data in, ECharts Core Option out.
 */
export function buildLoyaltyParetoOption({
  data,
  theme,
  prefersReducedMotion = false,
  maxItems,
}: BuildLoyaltyParetoOptionParams): EChartsCoreOption {
  const currentTheme = theme ?? resolveChartTheme("light", "emerald");
  const baseOption = buildBaseChartOption(currentTheme, prefersReducedMotion);

  const { items: ranked, totalOrders } = normalizeLoyaltyData(data);
  const limit = typeof maxItems === "number" && maxItems > 0 ? maxItems : 20;
  const displayed = ranked.slice(0, limit);

  if (displayed.length === 0) {
    return {
      ...baseOption,
      xAxis: { type: "value" },
      yAxis: { type: "category", data: [] },
      series: [],
    };
  }

  let runningOrders = 0;
  const cumPercentages: number[] = [];
  for (const item of displayed) {
    runningOrders += item.orders;
    const pct = totalOrders > 0 ? Math.round((runningOrders / totalOrders) * 100) : 0;
    cumPercentages.push(pct);
  }

  const categories = displayed.map((d) => d.name);

  const metadataMap = new Map<string, { orders: number; spend: number; aov: number; cumPercent: number; name: string }>();
  displayed.forEach((d, i) => {
    metadataMap.set(d.name, {
      orders: d.orders,
      spend: d.spend,
      aov: d.aov,
      cumPercent: cumPercentages[i],
      name: d.name,
    });
  });

  const barData = displayed.map((d, i) => ({
    value: d.orders,
    key: d.key,
    restaurantKey: d.key,
    name: d.name,
    restaurantName: d.name,
    spend: d.spend,
    aov: d.aov,
    cumPercent: cumPercentages[i],
    itemStyle: {
      color: currentTheme.colors[0],
      borderRadius: [0, 4, 4, 0],
    },
  }));

  const lineData = displayed.map((d, i) => ({
    value: cumPercentages[i],
    key: d.key,
    restaurantKey: d.key,
    name: d.name,
    restaurantName: d.name,
    spend: d.spend,
    aov: d.aov,
    cumPercent: cumPercentages[i],
  }));

  const series: (BarSeriesOption | LineSeriesOption)[] = [
    {
      name: "Orders",
      type: "bar",
      xAxisIndex: 0,
      data: barData,
      barMaxWidth: 32,
      itemStyle: {
        color: currentTheme.colors[0],
        borderRadius: [0, 4, 4, 0],
      },
      emphasis: {
        focus: "series",
      },
      animationDuration: prefersReducedMotion ? 0 : 600,
      animationEasing: "cubicOut",
    },
    {
      name: "Cumulative %",
      type: "line",
      xAxisIndex: 1,
      smooth: false,
      symbol: "circle",
      symbolSize: 6,
      data: lineData,
      itemStyle: {
        color: currentTheme.colors[1],
      },
      lineStyle: {
        color: currentTheme.colors[1],
        width: 2,
      },
      markLine: {
        silent: true,
        symbol: "none",
        data: [
          {
            name: "80% Pareto",
            xAxis: 80,
            lineStyle: {
              type: "dashed",
              color: currentTheme.colors[2] ?? currentTheme.mutedColor,
              width: 1.5,
            },
            label: {
              show: true,
              formatter: "80% Pareto",
              position: "end",
              fontSize: 11,
              color: currentTheme.textColor,
            },
          },
        ],
      },
      emphasis: {
        focus: "series",
      },
      animationDuration: prefersReducedMotion ? 0 : 600,
      animationEasing: "cubicOut",
    },
  ];

  return {
    ...baseOption,
    aria: {
      enabled: true,
      decal: { show: getPatterns() },
    },
    animation: !prefersReducedMotion,
    animationDuration: prefersReducedMotion ? 0 : 600,
    animationEasing: "cubicOut",
    tooltip: {
      trigger: "axis",
      axisPointer: {
        type: "shadow",
      },
      backgroundColor: currentTheme.tooltipBg,
      borderColor: currentTheme.tooltipBorder,
      textStyle: {
        color: currentTheme.tooltipText,
      },
      formatter: (params: unknown) => formatLoyaltyParetoTooltip(params, currentTheme, metadataMap),
    },
    legend: {
      show: true,
      top: 0,
      right: 12,
      textStyle: {
        color: currentTheme.mutedColor,
        fontSize: 11,
      },
      data: ["Orders", "Cumulative %"],
    },
    // Horizontal bars: long restaurant names stay readable and are never rotated.
    grid: {
      left: 8,
      right: 24,
      top: 56,
      bottom: 8,
      containLabel: true,
    },
    yAxis: {
      type: "category",
      data: categories,
      inverse: true,
      axisLine: { lineStyle: { color: currentTheme.axisLine } },
      axisTick: { show: false },
      axisLabel: {
        color: currentTheme.mutedColor,
        fontSize: 11,
        interval: 0,
        width: 160,
        overflow: "truncate",
      },
    },
    xAxis: [
      {
        type: "value",
        name: "Orders",
        nameLocation: "end",
        min: 0,
        minInterval: 1,
        position: "bottom",
        splitLine: { show: true, lineStyle: { color: currentTheme.splitLine } },
        axisLabel: { color: currentTheme.mutedColor, fontSize: 11, formatter: (v: number) => v.toLocaleString("en-IN") },
      },
      {
        type: "value",
        name: "Cumulative share of orders",
        nameLocation: "end",
        min: 0,
        max: 100,
        interval: 20,
        position: "top",
        splitLine: { show: false },
        axisLabel: { color: currentTheme.mutedColor, fontSize: 11, formatter: "{value}%" },
      },
    ],
    series,
  };
}

export function LoyaltyParetoChart({
  data,
  isLoading = false,
  isEmpty: isEmptyProp,
  emptyReason,
  error = null,
  onRetry,
  className,
  title = "Restaurant loyalty",
  subtitle = "Orders per restaurant, with the share of all orders they add up to.",
  caption: captionProp,
  maxItems,
  onRestaurantClick,
  showTable,
  onShowTableChange,
  fullscreen,
  onFullscreenChange,
}: LoyaltyParetoChartProps) {
  const filterContext = useOptionalFilters();

  const { items: ranked, totalOrders } = React.useMemo(() => normalizeLoyaltyData(data), [data]);
  const limit = typeof maxItems === "number" && maxItems > 0 ? maxItems : 20;
  const displayed = React.useMemo(() => ranked.slice(0, limit), [ranked, limit]);

  const cumPercentages = React.useMemo(() => {
    let runningOrders = 0;
    return displayed.map((item) => {
      runningOrders += item.orders;
      return totalOrders > 0 ? Math.round((runningOrders / totalOrders) * 100) : 0;
    });
  }, [displayed, totalOrders]);

  const computedCaption = React.useMemo(() => {
    return captionProp ?? (computeLoyaltyParetoTakeaway(data) ?? undefined);
  }, [captionProp, data]);

  const isEmpty = isEmptyProp ?? (!isLoading && (!data || data.length === 0 || totalOrders === 0));
  const resolvedEmptyReason =
    emptyReason ?? "No restaurant loyalty data available for the selected filters";

  const tableData = React.useMemo(() => {
    if (!displayed || displayed.length === 0) return undefined;
    return displayed.map((d, i) => ({
      Restaurant: d.name,
      Orders: d.orders,
      Spend: formatRupees(d.spend),
      AOV: formatRupees(d.aov),
      "Cumulative %": `${cumPercentages[i]}%`,
    }));
  }, [displayed, cumPercentages]);

  const ariaDescription = React.useMemo(() => {
    if (!displayed.length || totalOrders === 0) {
      return "Restaurant loyalty Pareto chart with no data";
    }
    const topCount = displayed.length;
    return `Restaurant loyalty Pareto chart ranking ${topCount} restaurants by order volume with cumulative order percentage and 80% reference threshold. Total orders: ${totalOrders}.`;
  }, [displayed, totalOrders]);

  const highlightMatcher = React.useMemo(
    () => ({
      dimension: "restaurant",
      matcher: (dim: string, val: string) => {
        if (dim !== "restaurant") return false;
        const matchIdx = displayed.findIndex(
          (d) =>
            isDimensionMatch("restaurant", d.name, val) ||
            isDimensionMatch("restaurant", d.key, val),
        );
        if (matchIdx >= 0) {
          return { type: "highlight", dataIndex: matchIdx };
        }
        return undefined;
      },
    }),
    [displayed]
  );

  const infoPopover = (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Loyalty Pareto information"
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
          <p className="font-semibold text-foreground text-sm">Restaurant loyalty</p>
          <p className="text-muted-foreground mt-0.5 leading-relaxed">
            Pareto analysis (80/20 rule) ranks restaurants by order volume to highlight vendor concentration.
          </p>
        </div>
        <div className="space-y-1.5 pt-1 border-t border-border/50">
          <p className="font-medium text-foreground">80/20 Principle & Cumulative Curve</p>
          <p className="text-muted-foreground leading-relaxed">
            The descending bars show individual order counts, while the cumulative percentage line tracks total order share toward the 80% reference threshold. Typically, a small fraction of top restaurants account for ~80% of total orders.
          </p>
        </div>
        <div className="space-y-1.5 pt-1 border-t border-border/50">
          <p className="font-medium text-foreground">Click to Filter</p>
          <p className="text-muted-foreground leading-relaxed">
            Clicking any restaurant bar filters the dashboard by that restaurant to inspect specific order items and spend patterns.
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
      chartHeight={Math.max(320, displayed.length * 28 + 96)}
      spec={(currentData, theme, { prefersReducedMotion }) =>
        buildLoyaltyParetoOption({
          data: currentData,
          theme,
          prefersReducedMotion,
          maxItems,
        })
      }
      onClick={(params) => {
        handleLoyaltyParetoClick(
          params,
          displayed,
          filterContext,
          onRestaurantClick,
        );
      }}
      highlightDimension="restaurant"
      getHighlightValue={(params) => {
        const idx = params?.dataIndex;
        const row = typeof idx === "number" && idx >= 0 && idx < displayed.length ? displayed[idx] : undefined;
        return row?.name ?? row?.key ?? params?.name ?? params?.axisValue;
      }}
      highlightMatcher={highlightMatcher}
      registerModules={registerLoyaltyParetoModules}
      ariaLabel={title}
      ariaDescription={ariaDescription}
    />
  );
}

export default LoyaltyParetoChart;
