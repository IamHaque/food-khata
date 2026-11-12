import { getPatterns } from "../../app/theme";
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

import { BaseChart, useOptionalFilters } from "../dashboard/BaseChart";
import {
  buildBaseChartOption,
  resolveChartTheme,
  type ChartTheme,
  platformColor,
} from "../../lib/chart-theme";
import { platformLabel, pluralize } from "../../lib/format";
import { computePlatformTakeaway, formatRupees } from "../../lib/captions";
import { swatchBg } from "../../lib/chart-kit";

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
        <span style="display:inline-block;width:8px;height:8px;border-radius:50%;${swatchBg(markerColor)}"></span>
        <span>${platformLabel(platform)}</span>
      </div>
      <div style="display: flex; justify-content: space-between; gap: 12px; margin-bottom: 2px;">
        <span style="color: ${theme.mutedColor};">Share of spend:</span>
        <span style="font-weight: 600;">${share}</span>
      </div>
      <div style="display: flex; justify-content: space-between; gap: 12px; margin-bottom: 2px;">
        <span style="color: ${theme.mutedColor};">Spend:</span>
        <span style="font-weight: 600;">${formatRupees(spend)}</span>
      </div>
      <div style="display: flex; justify-content: space-between; gap: 12px; margin-bottom: 2px;">
        <span style="color: ${theme.mutedColor};">Orders:</span>
        <span style="font-weight: 600;">${pluralize(orders, "order")}</span>
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
        color: platformColor(currentTheme, item.platform, index),
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
      decal: { show: getPatterns() },
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
      formatter: (name: string) => platformLabel(name),
    },
    title: {
      text: formatRupees(totalSpend),
      subtext: "Total spend",
      left: "center",
      top: "center",
      textAlign: "center",
      textVerticalAlign: "middle",
      textStyle: {
        fontSize: 16,
        fontWeight: 600,
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
        radius: ["62%", "80%"],
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


export function PlatformSplitChart({
  data,
  totalSpend: totalSpendProp,
  isLoading,
  isEmpty: isEmptyProp,
  emptyReason,
  error,
  onRetry,
  className,
  title = "Platform split",
  subtitle = "How your spend divides between Zomato and Swiggy.",
  caption: captionProp,
  selectedPlatforms: selectedPlatformsProp,
  onPlatformClick,
  showTable,
  onShowTableChange,
  fullscreen,
  onFullscreenChange,
}: PlatformSplitChartProps) {
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

  const highlightMatcher = React.useMemo(
    () => ({
      dimension: "platform",
      matcher: (dim: string, val: string, ch: any) => {
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
    }),
    []
  );

  return (
    <BaseChart
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
      data={data}
      spec={(currentData, theme, { prefersReducedMotion }) =>
        buildPlatformSplitOption({
          data: currentData ?? [],
          theme,
          prefersReducedMotion,
          selectedPlatforms: activeSelectedPlatforms,
          totalSpend,
        })
      }
      onSelect={(platform, isMulti) => handleSliceClick(String(platform), Boolean(isMulti))}
      highlightDimension="platform"
      highlightMatcher={highlightMatcher}
      registerModules={registerPlatformChartModules}
      ariaLabel={`Donut chart of spend share by platform, total spend ${formatRupees(
        totalSpend
      )}`}
    />
  );
}

export default PlatformSplitChart;
