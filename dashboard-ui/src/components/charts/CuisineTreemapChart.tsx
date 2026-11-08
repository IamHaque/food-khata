import * as React from "react";
import * as echarts from "echarts/core";
import { TreemapChart } from "echarts/charts";
import {
  TooltipComponent,
  AriaComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsCoreOption } from "echarts/core";
import { Info } from "lucide-react";

import { ChartCard } from "@/components/dashboard/ChartCard";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  getCurrentChartTheme,
  resolveChartTheme,
  type ChartTheme,
} from "@/lib/chart-theme";
import {
  computeCuisineTakeaway,
  formatRupees,
  type CuisineDatumLike,
} from "@/lib/captions";
import { useFilters } from "@/app/FilterContext";
import { subscribeTheme } from "@/app/theme";
import {
  registerChart,
  emitHighlight,
  emitClear,
} from "@/lib/highlight-bus";

// Ensure ECharts modules registered once
let registered = false;
export function registerCuisineTreemapModules() {
  if (registered) return;
  echarts.use([
    TreemapChart,
    TooltipComponent,
    AriaComponent,
    CanvasRenderer,
  ]);
  registered = true;
}
registerCuisineTreemapModules();

export interface CuisineRowLike {
  name: string;
  spend: number;
  orders?: number;
}

export interface LoyaltyRowLike {
  key?: string;
  name: string;
  orders?: number;
  spend: number;
  aov?: number;
  cuisine?: string;
}

export interface CuisineTreemapNode {
  name: string;
  value: number;
  orders?: number;
  cuisineName?: string;
  itemStyle?: {
    color?: string;
  };
  children?: CuisineTreemapNode[];
}

export interface BuildCuisineTreemapOptionParams {
  cuisines?: readonly (CuisineRowLike | CuisineDatumLike | null | undefined)[] | null;
  loyalty?: readonly (LoyaltyRowLike | null | undefined)[] | null;
  restaurants?: readonly (LoyaltyRowLike | null | undefined)[] | null;
  theme?: ChartTheme;
  reducedMotion?: boolean;
}

/**
 * Builds the hierarchical tree structure for cuisines and restaurants.
 * Top-level nodes represent cuisines (with theme token colors).
 * Child nodes represent restaurants matched or distributed to cuisines.
 * If no restaurants are available, cuisine nodes function as zoomable leaves.
 */
export function buildCuisineHierarchy(
  cuisines?: readonly (CuisineRowLike | CuisineDatumLike | null | undefined)[] | null,
  loyalty?: readonly (LoyaltyRowLike | null | undefined)[] | null,
  theme?: ChartTheme,
): CuisineTreemapNode[] {
  if (!cuisines || cuisines.length === 0) return [];

  const activeTheme = theme ?? resolveChartTheme("light", "emerald");
  const validCuisines = cuisines
    .filter((c): c is CuisineRowLike => {
      if (!c || !c.name) return false;
      const spend = Number(c.spend ?? (c as any).value ?? (c as any).amount ?? 0);
      return Number.isFinite(spend) && spend > 0;
    })
    .map((c) => ({
      name: String(c.name).trim(),
      spend: Number(c.spend ?? (c as any).value ?? (c as any).amount ?? 0),
      orders: typeof c.orders === "number" ? c.orders : 0,
    }));

  if (validCuisines.length === 0) return [];

  const validRestaurants = (loyalty ?? [])
    .filter((r): r is LoyaltyRowLike => {
      if (!r || !r.name) return false;
      const spend = Number(r.spend ?? (r as any).amount ?? 0);
      return Number.isFinite(spend) && spend > 0;
    })
    .map((r) => ({
      key: r.key,
      name: String(r.name).trim(),
      spend: Number(r.spend ?? (r as any).amount ?? 0),
      orders: typeof r.orders === "number" ? r.orders : 0,
      cuisine: r.cuisine ? String(r.cuisine).trim() : undefined,
    }));

  const cuisineMap = new Map<string, {
    cuisine: CuisineRowLike;
    color: string;
    matchedRestaurants: LoyaltyRowLike[];
  }>();

  validCuisines.forEach((c, idx) => {
    cuisineMap.set(c.name.toLowerCase(), {
      cuisine: c,
      color: activeTheme.colors[idx % activeTheme.colors.length],
      matchedRestaurants: [],
    });
  });

  const unassignedRestaurants: LoyaltyRowLike[] = [];

  for (const r of validRestaurants) {
    if (r.cuisine && cuisineMap.has(r.cuisine.toLowerCase())) {
      cuisineMap.get(r.cuisine.toLowerCase())!.matchedRestaurants.push(r);
      continue;
    }

    // Try name keyword matching
    let matched = false;
    const lowerName = r.name.toLowerCase();
    for (const [key, entry] of cuisineMap.entries()) {
      if (lowerName.includes(key) || key.includes(lowerName)) {
        entry.matchedRestaurants.push(r);
        matched = true;
        break;
      }
    }

    if (!matched) {
      unassignedRestaurants.push(r);
    }
  }

  // Distribute remaining restaurants across cuisines round-robin if loyalty is present
  if (unassignedRestaurants.length > 0 && validCuisines.length > 0) {
    unassignedRestaurants.forEach((r, idx) => {
      const targetCuisine = validCuisines[idx % validCuisines.length];
      cuisineMap.get(targetCuisine.name.toLowerCase())?.matchedRestaurants.push(r);
    });
  }

  const nodes: CuisineTreemapNode[] = [];

  for (const { cuisine, color, matchedRestaurants } of cuisineMap.values()) {
    const cuisineNode: CuisineTreemapNode = {
      name: cuisine.name,
      value: cuisine.spend,
      orders: cuisine.orders,
      cuisineName: cuisine.name,
      itemStyle: {
        color,
      },
    };

    if (matchedRestaurants.length > 0) {
      const restTotalSpend = matchedRestaurants.reduce((sum, r) => sum + r.spend, 0);

      if (restTotalSpend > 0) {
        if (restTotalSpend <= cuisine.spend) {
          // Keep restaurant actual spend values and add remainder as Other
          const children: CuisineTreemapNode[] = matchedRestaurants.map((r) => ({
            name: r.name,
            value: r.spend,
            orders: r.orders,
            cuisineName: cuisine.name,
          }));

          const remainder = Math.round((cuisine.spend - restTotalSpend) * 100) / 100;
          if (remainder > 0) {
            children.push({
              name: `Other ${cuisine.name}`,
              value: remainder,
              cuisineName: cuisine.name,
            });
          }
          cuisineNode.children = children;
        } else {
          // Normalize child values proportionally so their sum equals cuisine.spend
          let allocated = 0;
          const children: CuisineTreemapNode[] = matchedRestaurants.map((r, i) => {
            const isLast = i === matchedRestaurants.length - 1;
            const scaled = isLast
              ? Math.max(0, Math.round((cuisine.spend - allocated) * 100) / 100)
              : Math.round(((r.spend / restTotalSpend) * cuisine.spend) * 100) / 100;
            allocated += scaled;
            return {
              name: r.name,
              value: scaled,
              orders: r.orders,
              cuisineName: cuisine.name,
            };
          });
          cuisineNode.children = children;
        }
      }
    }

    nodes.push(cuisineNode);
  }

  return nodes;
}

/**
 * Pure function: data in, ECharts treemap option out (CC-11).
 * Supports both object params and positional arguments.
 */
export function buildCuisineTreemapOption(
  paramsOrCuisines?: BuildCuisineTreemapOptionParams | readonly (CuisineRowLike | CuisineDatumLike | null | undefined)[] | null,
  loyaltyArg?: readonly (LoyaltyRowLike | null | undefined)[] | null,
  themeArg?: ChartTheme,
  reducedMotionArg?: boolean,
): EChartsCoreOption {
  let cuisines: readonly (CuisineRowLike | CuisineDatumLike | null | undefined)[] | null | undefined;
  let loyalty: readonly (LoyaltyRowLike | null | undefined)[] | null | undefined;
  let theme: ChartTheme;
  let reducedMotion = false;

  if (paramsOrCuisines && typeof paramsOrCuisines === "object" && !Array.isArray(paramsOrCuisines)) {
    const params = paramsOrCuisines as BuildCuisineTreemapOptionParams;
    cuisines = params.cuisines;
    loyalty = params.loyalty ?? params.restaurants;
    theme = params.theme ?? resolveChartTheme("light", "emerald");
    reducedMotion = !!params.reducedMotion;
  } else {
    cuisines = paramsOrCuisines as readonly (CuisineRowLike | CuisineDatumLike | null | undefined)[] | null;
    loyalty = loyaltyArg;
    theme = themeArg ?? resolveChartTheme("light", "emerald");
    reducedMotion = !!reducedMotionArg;
  }

  const treeData = buildCuisineHierarchy(cuisines, loyalty, theme);
  const totalSpend = treeData.reduce((sum, n) => sum + n.value, 0);

  const option: EChartsCoreOption = {
    animation: !reducedMotion,
    animationDuration: reducedMotion ? 0 : 600,
    animationDurationUpdate: reducedMotion ? 0 : 250,
    animationEasing: "cubicOut",
    tooltip: {
      trigger: "item",
      backgroundColor: theme.tooltipBg,
      borderColor: theme.tooltipBorder,
      borderWidth: 1,
      textStyle: {
        color: theme.tooltipText,
        fontSize: 12,
        fontFamily: '"Inter Variable", sans-serif',
      },
      formatter: (params: any) => {
        const name = params?.name ?? "Unknown";
        const val = typeof params?.value === "number" ? params.value : 0;
        const formattedVal = formatRupees(val);
        const orders = params?.data?.orders;
        const ordersText = typeof orders === "number" && orders > 0
          ? `${orders} ${orders === 1 ? "order" : "orders"}`
          : "";

        const share = totalSpend > 0 ? ((val / totalSpend) * 100).toFixed(1) + "%" : "";
        const lines: string[] = [`<strong>${name}</strong>`];

        if (params?.treePathInfo && Array.isArray(params.treePathInfo) && params.treePathInfo.length > 2) {
          const path = params.treePathInfo
            .map((p: any) => p?.name)
            .filter(Boolean)
            .join(" → ");
          lines.push(`<span style="opacity: 0.8; font-size: 11px;">${path}</span>`);
        }

        let valueLine = `Spend: <strong>${formattedVal}</strong>`;
        if (share) {
          valueLine += ` (${share} of food spend)`;
        }
        lines.push(valueLine);

        if (ordersText) {
          lines.push(`Volume: ${ordersText}`);
        }

        return lines.join("<br/>");
      },
    },
    series: [
      {
        name: "Cuisines",
        type: "treemap",
        roam: false,
        nodeClick: "zoomToNode",
        breadcrumb: {
          show: true,
          left: "center",
          bottom: 2,
          emptyItemWidth: 25,
          itemStyle: {
            color: theme.tooltipBg,
            borderColor: theme.borderColor,
            borderWidth: 1,
            textStyle: {
              color: theme.textColor,
              fontSize: 11,
            },
          },
        },
        label: {
          show: true,
          formatter: (params: any) => {
            const name = params?.name ?? "";
            const val = typeof params?.value === "number" ? formatRupees(params.value) : "";
            return val ? `${name}\n${val}` : name;
          },
          fontSize: 12,
          color: theme.tooltipBg,
        },
        upperLabel: {
          show: true,
          height: 22,
          color: theme.textColor,
          textStyle: {
            fontSize: 11,
            fontWeight: "bold",
          },
        },
        itemStyle: {
          borderColor: theme.borderColor,
          borderWidth: 1,
          gapWidth: 2,
        },
        levels: [
          {
            itemStyle: {
              borderColor: theme.borderColor,
              borderWidth: 1,
              gapWidth: 2,
            },
            upperLabel: { show: false },
          },
          {
            itemStyle: {
              borderColor: theme.borderColor,
              borderWidth: 2,
              gapWidth: 2,
            },
            emphasis: {
              itemStyle: {
                borderColor: theme.textColor,
              },
            },
          },
          {
            colorSaturation: [0.35, 0.6],
            itemStyle: {
              borderWidth: 1,
              gapWidth: 1,
              borderColorSaturation: 0.5,
            },
          },
        ],
        data: treeData,
      },
    ],
  };

  return option;
}

export function handleCuisineTreemapClick(
  params: unknown,
  filters?: { update: (patch: { cuisines: string[] }) => void } | null,
  onCuisineClick?: (cuisine: string, params?: unknown) => void,
): string | null {
  const p = params as {
    name?: unknown;
    data?: { cuisineName?: unknown; name?: unknown };
    treePathInfo?: Array<{ name?: unknown }>;
  } | null;

  let cuisineName: string | null = null;

  if (p?.data?.cuisineName && typeof p.data.cuisineName === "string") {
    cuisineName = p.data.cuisineName.trim();
  } else if (p?.treePathInfo && Array.isArray(p.treePathInfo) && p.treePathInfo.length > 1) {
    const nodeName = p.treePathInfo[1]?.name;
    if (typeof nodeName === "string" && nodeName.trim()) {
      cuisineName = nodeName.trim();
    }
  }

  if (!cuisineName && typeof p?.name === "string" && p.name.trim()) {
    cuisineName = p.name.trim();
  }

  if (cuisineName) {
    if (filters?.update) {
      filters.update({ cuisines: [cuisineName] });
    }
    onCuisineClick?.(cuisineName, params);
    return cuisineName;
  }

  return null;
}

function useOptionalFilters() {
  try {
    return useFilters();
  } catch {
    return null;
  }
}

export interface CuisineTreemapChartProps {
  cuisines?: readonly (CuisineRowLike | CuisineDatumLike | null | undefined)[] | null;
  loyalty?: readonly (LoyaltyRowLike | null | undefined)[] | null;
  restaurants?: readonly (LoyaltyRowLike | null | undefined)[] | null;
  cuisine_unavailable_reason?: string | null;
  title?: string;
  subtitle?: string;
  caption?: string;
  onCuisineClick?: (cuisine: string, params?: unknown) => void;
  isLoading?: boolean;
  isEmpty?: boolean;
  emptyReason?: string;
  error?: Error | string | null;
  onRetry?: () => void;
  className?: string;
  showTable?: boolean;
  onShowTableChange?: (show: boolean) => void;
  fullscreen?: boolean;
  onFullscreenChange?: (fullscreen: boolean) => void;
}

export function CuisineTreemapChart({
  cuisines,
  loyalty,
  restaurants,
  cuisine_unavailable_reason,
  title = "Cuisine breakdown",
  subtitle = "Treemap of spend by cuisine with restaurant drilldown",
  caption: captionProp,
  onCuisineClick,
  isLoading,
  isEmpty,
  emptyReason,
  error,
  onRetry,
  className,
  showTable,
  onShowTableChange,
  fullscreen,
  onFullscreenChange,
}: CuisineTreemapChartProps) {
  const filters = useOptionalFilters();
  const effectiveRestaurants = loyalty ?? restaurants;

  const validCuisines = React.useMemo(() => {
    if (!cuisines) return [];
    return cuisines.filter((c): c is CuisineRowLike => {
      if (!c || !c.name) return false;
      const spend = Number(c.spend ?? (c as any).value ?? (c as any).amount ?? 0);
      return Number.isFinite(spend) && spend > 0;
    });
  }, [cuisines]);

  const totalSpend = React.useMemo(
    () => validCuisines.reduce((sum, c) => sum + (c.spend || 0), 0),
    [validCuisines],
  );

  const tableData = React.useMemo(() => {
    if (validCuisines.length === 0) return undefined;
    return validCuisines.map((c) => ({
      Cuisine: c.name,
      Spend: c.spend,
      Orders: c.orders ?? 0,
      "Share (%)": totalSpend > 0 ? Number(((c.spend / totalSpend) * 100).toFixed(1)) : 0,
    }));
  }, [validCuisines, totalSpend]);

  const effectiveCaption =
    captionProp !== undefined
      ? captionProp
      : computeCuisineTakeaway(validCuisines);

  const isDataUnavailable = Boolean(cuisine_unavailable_reason);
  const empty = isEmpty || isDataUnavailable || (validCuisines.length === 0 && !isLoading && !error);
  const effectiveEmptyReason = cuisine_unavailable_reason || emptyReason || "No cuisine data available.";

  const containerRef = React.useRef<HTMLDivElement>(null);
  const chartRef = React.useRef<echarts.ECharts | null>(null);
  const idRef = React.useRef(`cuisine-treemap-${Math.random().toString(36).slice(2, 9)}`);
  const chartId = idRef.current;

  React.useEffect(() => {
    const node = containerRef.current;
    if (!node || empty || isLoading || error) return;

    registerCuisineTreemapModules();
    if (!chartRef.current) chartRef.current = echarts.init(node);
    const chart = chartRef.current;
    const unregister = registerChart(chartId, chart, { dimension: "cuisine" });

    const handleClick = (params: unknown) => {
      handleCuisineTreemapClick(params, filters, onCuisineClick);
    };

    const handleOver = (params: any) => {
      const cuisineName = params?.data?.cuisineName || params?.name;
      if (cuisineName && typeof cuisineName === "string") {
        emitHighlight(chartId, "cuisine", cuisineName);
      }
    };

    const handleOut = () => emitClear(chartId);

    chart.on("click", handleClick);
    chart.on("mouseover", handleOver);
    chart.on("mouseout", handleOut);

    const ro = new ResizeObserver(() => {
      if (chart && !chart.isDisposed()) chart.resize();
    });
    ro.observe(node);

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
  }, [chartId, filters, onCuisineClick, empty, isLoading, error]);

  React.useEffect(() => {
    const chart = chartRef.current;
    if (!chart || chart.isDisposed() || empty || isLoading || error) return;

    function applyUpdate() {
      if (!chart || chart.isDisposed()) return;
      const theme = getCurrentChartTheme();
      const prefersReducedMotion =
        typeof window !== "undefined" &&
        window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      const option = buildCuisineTreemapOption({
        cuisines: validCuisines,
        loyalty: effectiveRestaurants,
        theme,
        reducedMotion: prefersReducedMotion,
      });

      chart.setOption(option, { notMerge: true, lazyUpdate: true });
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
  }, [validCuisines, effectiveRestaurants, empty, isLoading, error]);

  const infoPopover = (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Cuisine breakdown information"
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
          <p className="font-semibold text-foreground text-sm">Cuisine Breakdown</p>
          <p className="text-muted-foreground mt-0.5 leading-relaxed">
            Hierarchical treemap visualizing provider-paid expenditure across cuisine categories and restaurants.
          </p>
        </div>
        <div className="space-y-1.5 text-muted-foreground leading-relaxed">
          <p>
            <strong className="text-foreground">Tile Sizing by Spend:</strong> Each cuisine tile is sized proportionally to its total spend, labeled with cuisine name and rupee total.
          </p>
          <p>
            <strong className="text-foreground">Restaurant Drilldown:</strong> Click any cuisine tile to zoom into its constituent restaurants to see vendor-level spend distribution.
          </p>
          <p>
            <strong className="text-foreground">Breadcrumb Navigation:</strong> Use the breadcrumb trail at the bottom to zoom back up to the all-cuisines overview.
          </p>
          <p>
            <strong className="text-foreground">Cross-Filtering:</strong> Clicking a cuisine tile applies that cuisine as a filter across the dashboard.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );

  return (
    <ChartCard
      title={title}
      subtitle={subtitle}
      caption={effectiveCaption ?? undefined}
      infoPopover={infoPopover}
      isLoading={isLoading}
      isEmpty={empty}
      emptyReason={effectiveEmptyReason}
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
        <div className="sr-only" aria-live="polite">
          {effectiveCaption || `${title}: ${subtitle}`}
        </div>

        <div className="w-full">
          <div
            ref={containerRef}
            role="img"
            aria-label={`${title}: ${subtitle}`}
            className="cursor-pointer"
            style={{ height: 320, width: "100%" }}
          />
        </div>
      </div>
    </ChartCard>
  );
}

export default CuisineTreemapChart;
