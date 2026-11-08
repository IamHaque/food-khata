import * as React from "react";
import * as echarts from "echarts/core";
import { PieChart } from "echarts/charts";
import {
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  AriaComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsCoreOption } from "echarts/core";

import { ChartCard } from "../dashboard/ChartCard";
import {
  getCurrentChartTheme,
  buildBaseChartOption,
  resolveChartTheme,
  type ChartTheme,
} from "../../lib/chart-theme";
import { computePlatformTakeaway, formatRupees } from "../../lib/captions";
import {
  registerChart,
  emitHighlight,
  emitClear,
} from "../../lib/highlight-bus";
import { useFilters } from "../../app/FilterContext";
import { subscribeTheme } from "../../app/theme";

export interface PlatformSplitItem {
  platform: string;
  orders: number;
  spend: number;
  discounts: number;
  advertised_savings?: number;
  fees: number;
}

export interface BuildPlatformSplitOptionParams {
  data?: PlatformSplitItem[] | null;
  theme?: ChartTheme;
  prefersReducedMotion?: boolean;
  selectedPlatforms?: string[];
  totalSpend?: number;
}

export interface PlatformSplitChartProps {
  data?: PlatformSplitItem[] | null;
  totalSpend?: number;
  isLoading?: boolean;
  isEmpty?: boolean;
  emptyReason?: string;
  error?: Error | string | null;
  onRetry?: () => void;
  className?: string;
  title?: string;
  subtitle?: string;
  caption?: string;
  selectedPlatforms?: string[];
  onPlatformClick?: (platform: string, isMulti?: boolean) => void;
  showTable?: boolean;
  onShowTableChange?: (value: boolean) => void;
  fullscreen?: boolean;
  onFullscreenChange?: (value: boolean) => void;
}

let echartsRegistered = false;
function registerPlatformChartModules() {
  if (echartsRegistered) return;
  echarts.use([
    PieChart,
    TooltipComponent,
    LegendComponent,
    TitleComponent,
    AriaComponent,
    CanvasRenderer,
  ]);
  echartsRegistered = true;
}

export function formatPlatformTooltip(
  params: unknown,
  totalSpend: number,
  theme: ChartTheme
): string {
  if (!params || typeof params !== "object") return "";
  const p = params as {
    name?: string;
    value?: number;
    percent?: number;
    color?: string;
    data?: Partial<PlatformSplitItem>;
  };
  const item = p.data || {};
  const platform = p.name || item.platform || "Unknown";
  const spend = typeof p.value === "number" ? p.value : (item.spend ?? 0);
  const share =
    totalSpend > 0
      ? ((spend / totalSpend) * 100).toFixed(1) + "%"
      : typeof p.percent === "number"
      ? p.percent.toFixed(1) + "%"
      : "0%";
  const orders = item.orders ?? 0;
  const discounts = item.discounts ?? 0;
  const fees = item.fees ?? 0;
  const markerColor = p.color || theme.colors[0];

  return `
    <div style="font-family: inherit; font-size: 12px; line-height: 1.5; min-width: 140px;">
      <div style="font-weight: 600; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
        <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background-color:${markerColor};"></span>
        <span>${platform}</span>
      </div>
      <div style="display: flex; justify-content: space-between; gap: 12px; margin-bottom: 2px;">
        <span style="color: ${theme.mutedColor};">Spend Share:</span>
        <span style="font-weight: 600;">${share}</span>
      </div>
      <div style="display: flex; justify-content: space-between; gap: 12px; margin-bottom: 2px;">
        <span style="color: ${theme.mutedColor};">Spend:</span>
        <span style="font-weight: 600;">${formatRupees(spend)}</span>
      </div>
      <div style="display: flex; justify-content: space-between; gap: 12px; margin-bottom: 2px;">
        <span style="color: ${theme.mutedColor};">Orders:</span>
        <span style="font-weight: 600;">${orders}</span>
      </div>
      <div style="display: flex; justify-content: space-between; gap: 12px; margin-bottom: 2px;">
        <span style="color: ${theme.mutedColor};">Discounts:</span>
        <span style="font-weight: 600;">${formatRupees(discounts)}</span>
      </div>
      <div style="display: flex; justify-content: space-between; gap: 12px;">
        <span style="color: ${theme.mutedColor};">Fees:</span>
        <span style="font-weight: 600;">${formatRupees(fees)}</span>
      </div>
    </div>
  `.trim();
}

export function buildPlatformSplitOption({
  data,
  theme,
  prefersReducedMotion = false,
  selectedPlatforms = [],
  totalSpend: explicitTotalSpend,
}: BuildPlatformSplitOptionParams): EChartsCoreOption {
  const currentTheme = theme ?? resolveChartTheme("light", "emerald");
  const items = data ?? [];

  const totalSpend =
    explicitTotalSpend ??
    items.reduce((sum, d) => sum + (Number.isFinite(d.spend) && d.spend > 0 ? d.spend : 0), 0);

  const hasSelection = selectedPlatforms.length > 0;
  const pieData = items.map((item, index) => {
    const isSelected = hasSelection
      ? selectedPlatforms.some((s) => s.toLowerCase() === item.platform.toLowerCase())
      : false;

    return {
      name: item.platform,
      value: item.spend,
      orders: item.orders,
      discounts: item.discounts,
      fees: item.fees,
      advertised_savings: item.advertised_savings,
      itemStyle: {
        color: currentTheme.colors[index % currentTheme.colors.length],
        opacity: hasSelection && !isSelected ? 0.35 : 1,
      },
      selected: isSelected,
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
      trigger: "item",
      backgroundColor: currentTheme.tooltipBg,
      borderColor: currentTheme.tooltipBorder,
      textStyle: {
        color: currentTheme.tooltipText,
      },
      formatter: (params: unknown) => formatPlatformTooltip(params, totalSpend, currentTheme),
    },
    legend: {
      show: true,
      bottom: 8,
      left: "center",
      textStyle: {
        color: currentTheme.mutedColor,
        fontSize: 11,
        fontFamily: '"Inter Variable", sans-serif',
      },
      icon: "circle",
    },
    title: {
      text: formatRupees(totalSpend),
      subtext: "Total Spend",
      left: "center",
      top: "center",
      textAlign: "center",
      textVerticalAlign: "middle",
      textStyle: {
        fontSize: 20,
        fontWeight: "bold",
        color: currentTheme.textColor,
        fontFamily: '"Inter Variable", sans-serif',
      },
      subtextStyle: {
        fontSize: 11,
        color: currentTheme.mutedColor,
        fontFamily: '"Inter Variable", sans-serif',
      },
    },
    series: [
      {
        name: "Platform Spend",
        type: "pie",
        radius: ["50%", "75%"],
        center: ["50%", "50%"],
        avoidLabelOverlap: true,
        selectedMode: "multiple",
        itemStyle: {
          borderRadius: 4,
          borderColor: currentTheme.tooltip.background,
          borderWidth: 2,
        },
        label: {
          show: false,
        },
        emphasis: {
          scale: true,
          scaleSize: 6,
          label: {
            show: false,
          },
        },
        data: pieData,
      },
    ],
    animation: !prefersReducedMotion,
    animationDuration: prefersReducedMotion ? 0 : 600,
    animationDurationUpdate: prefersReducedMotion ? 0 : 250,
    animationEasing: "cubicOut",
  };
}

function useOptionalFilters() {
  try {
    return useFilters();
  } catch {
    return null;
  }
}

export function PlatformSplitChart({
  data,
  totalSpend: totalSpendProp,
  isLoading,
  isEmpty: isEmptyProp,
  emptyReason,
  error,
  onRetry,
  className,
  title = "Platform Split",
  subtitle = "Spend share, orders, discounts and fees by platform",
  caption: captionProp,
  selectedPlatforms: selectedPlatformsProp,
  onPlatformClick,
  showTable,
  onShowTableChange,
  fullscreen,
  onFullscreenChange,
}: PlatformSplitChartProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const chartRef = React.useRef<echarts.ECharts | null>(null);
  const autoIdRef = React.useRef<string | null>(null);
  if (!autoIdRef.current) {
    autoIdRef.current = `platform-chart-${Math.random().toString(36).slice(2, 9)}`;
  }
  const chartId = autoIdRef.current;

  const filterContext = useOptionalFilters();
  const activeSelectedPlatforms =
    selectedPlatformsProp ?? filterContext?.filters.platforms ?? [];

  const computedCaption = React.useMemo(() => {
    return captionProp ?? (computePlatformTakeaway(data) ?? undefined);
  }, [captionProp, data]);

  const isEmpty = isEmptyProp ?? (!isLoading && (!data || data.length === 0));
  const resolvedEmptyReason =
    emptyReason ?? "No platform data available for the selected filters";

  const computedTotalSpend = React.useMemo(() => {
    return (data ?? []).reduce(
      (sum, d) => sum + (Number.isFinite(d.spend) && d.spend > 0 ? d.spend : 0),
      0
    );
  }, [data]);

  const totalSpend = totalSpendProp ?? computedTotalSpend;

  const tableData = React.useMemo(() => {
    if (!data || data.length === 0) return undefined;
    return data.map((d) => {
      const share =
        totalSpend > 0 ? ((d.spend / totalSpend) * 100).toFixed(1) + "%" : "0%";
      return {
        Platform: d.platform,
        Orders: d.orders,
        Spend: d.spend,
        "Spend Share": share,
        Discounts: d.discounts,
        Fees: d.fees,
      };
    });
  }, [data, totalSpend]);

  const handleSliceClick = React.useCallback(
    (platform: string, isMulti = false) => {
      if (onPlatformClick) {
        onPlatformClick(platform, isMulti);
      } else if (filterContext?.applyCrossFilter) {
        filterContext.applyCrossFilter("platform", platform, isMulti);
      }
    },
    [onPlatformClick, filterContext]
  );

  const handleSliceClickRef = React.useRef(handleSliceClick);
  React.useEffect(() => {
    handleSliceClickRef.current = handleSliceClick;
  });

  const applyUpdate = React.useCallback(() => {
    const node = containerRef.current;
    if (!node || isEmpty || isLoading || error) return;
    registerPlatformChartModules();
    if (!chartRef.current || chartRef.current.isDisposed()) {
      chartRef.current = echarts.init(node);
    }
    const chart = chartRef.current;
    const theme = getCurrentChartTheme();
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const opt = buildPlatformSplitOption({
      data: data ?? [],
      theme,
      prefersReducedMotion,
      selectedPlatforms: activeSelectedPlatforms,
      totalSpend,
    });

    chart.setOption(opt, { notMerge: true, lazyUpdate: true });
  }, [data, activeSelectedPlatforms, totalSpend, isEmpty, isLoading, error]);

  React.useEffect(() => {
    const node = containerRef.current;
    if (!node || isEmpty || isLoading || error) return;

    registerPlatformChartModules();

    if (!chartRef.current || chartRef.current.isDisposed()) {
      chartRef.current = echarts.init(node);
    }
    const chart = chartRef.current;

    const unregister = registerChart(chartId, chart, {
      dimension: "platform",
      matcher: (dim, val, ch) => {
        if (dim === "platform") {
          const opt = (ch.getOption?.() || {}) as Record<string, unknown>;
          const seriesList = (Array.isArray(opt.series) ? opt.series : []) as Array<{
            data?: Array<{ name?: string }>;
          }>;
          const actions: Array<{
            type: string;
            seriesIndex: number;
            dataIndex: number;
            name: string;
          }> = [];
          seriesList.forEach((s, sIdx) => {
            if (Array.isArray(s.data)) {
              s.data.forEach((item, dIdx) => {
                if (
                  item &&
                  typeof item === "object" &&
                  item.name &&
                  item.name.toLowerCase() === val.toLowerCase()
                ) {
                  actions.push({
                    type: "highlight",
                    seriesIndex: sIdx,
                    dataIndex: dIdx,
                    name: item.name,
                  });
                }
              });
            }
          });
          if (actions.length > 0) return actions;
        }
        return undefined;
      },
    });

    const handleMouseOver = (params: unknown) => {
      const p = params as { name?: string };
      if (p && p.name) {
        emitHighlight(chartId, "platform", p.name);
      }
    };

    const handleMouseOut = () => {
      emitClear(chartId);
    };

    const handleClick = (params: unknown) => {
      const p = params as { name?: string; event?: { event?: MouseEvent } };
      if (p && p.name) {
        const isMulti = Boolean(p.event?.event?.shiftKey);
        handleSliceClickRef.current(p.name, isMulti);
      }
    };

    chart.on("mouseover", handleMouseOver);
    chart.on("mouseout", handleMouseOut);
    chart.on("globalout", handleMouseOut);
    chart.on("click", handleClick);

    const resizeObserver = new ResizeObserver(() => {
      if (chart && !chart.isDisposed()) {
        chart.resize();
      }
    });
    resizeObserver.observe(node);

    applyUpdate();

    return () => {
      chart.off("mouseover", handleMouseOver);
      chart.off("mouseout", handleMouseOut);
      chart.off("globalout", handleMouseOut);
      chart.off("click", handleClick);
      unregister();
      resizeObserver.disconnect();
      if (chartRef.current) {
        chartRef.current.dispose();
        chartRef.current = null;
      }
    };
  }, [chartId, isEmpty, isLoading, error, applyUpdate]);

  React.useEffect(() => {
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
  }, [applyUpdate]);

  return (
    <ChartCard
      title={title}
      subtitle={subtitle}
      caption={computedCaption}
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
        aria-label={`Donut chart of spend share by platform, total spend ${formatRupees(
          totalSpend
        )}`}
        tabIndex={0}
        style={{ height: 320, width: "100%", minHeight: 280 }}
        className="cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring rounded-md"
      />
    </ChartCard>
  );
}

export default PlatformSplitChart;
