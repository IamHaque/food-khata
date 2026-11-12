import { getPatterns } from "../../app/theme";
import * as React from "react";
import * as echarts from "echarts/core";
import { PieChart, BarChart } from "echarts/charts";
import {
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  GridComponent,
  AriaComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsCoreOption } from "echarts/core";
import { Info } from "lucide-react";

import { BaseChart, useOptionalFilters } from "../dashboard/BaseChart";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { SegmentedControl } from "../ui/segmented-control";
import {
  buildBaseChartOption,
  resolveChartTheme,
  type ChartTheme,
} from "../../lib/chart-theme";
import {
  computeDietTakeaway,
  formatRupees,
  type DietDatumLike,
} from "../../lib/captions";
import { tokenAlpha } from "../../lib/tokens";
import { pluralize } from "../../lib/format";
import { swatchBg } from "../../lib/chart-kit";

export interface DietSplitItem extends DietDatumLike {
  diet: string;
  item_lines: number;
  quantity: number;
  line_total: number;
}

export interface DietMonthlyItem {
  month: string;
  veg: number;
  non_veg: number;
  unknown: number;
}

export type DietViewMode = "split" | "trend";

export interface BuildDietDonutOptionParams {
  data?: readonly (DietSplitItem | null | undefined)[] | null;
  theme?: ChartTheme;
  prefersReducedMotion?: boolean;
  selectedCategory?: string | null;
}

export interface BuildDietTrendOptionParams {
  data?: readonly (DietMonthlyItem | null | undefined)[] | null;
  theme?: ChartTheme;
  prefersReducedMotion?: boolean;
}

export interface DietSplitTrendChartProps {
  diet?: readonly (DietSplitItem | null | undefined)[] | null;
  diet_monthly?: readonly (DietMonthlyItem | null | undefined)[] | null;
  diet_unavailable_reason?: string | null;
  title?: string;
  subtitle?: string;
  caption?: string;
  viewMode?: DietViewMode;
  defaultViewMode?: DietViewMode;
  onViewModeChange?: (mode: DietViewMode) => void;
  onDietClick?: (
    dietCategory: string,
    filterValue: "veg" | "nonveg" | "unknown" | "all",
  ) => void;
  isLoading?: boolean;
  isEmpty?: boolean;
  emptyReason?: string;
  error?: Error | string | null;
  onRetry?: () => void;
  className?: string;
  showTable?: boolean;
  onShowTableChange?: (value: boolean) => void;
  fullscreen?: boolean;
  onFullscreenChange?: (value: boolean) => void;
}

let echartsRegistered = false;
function registerDietChartModules() {
  if (echartsRegistered) return;
  echarts.use([
    PieChart,
    BarChart,
    TooltipComponent,
    LegendComponent,
    TitleComponent,
    GridComponent,
    AriaComponent,
    CanvasRenderer,
  ]);
  echartsRegistered = true;
}
registerDietChartModules();


export function getDietColor(diet: string, theme: ChartTheme): string {
  const norm = diet.trim().toLowerCase().replace(/[_\s-]+/g, "");
  if (norm === "veg") {
    return (
      tokenAlpha("--success", 1) ||
      theme.success ||
      theme.colors[0]
    );
  }
  if (norm === "nonveg") {
    return (
      tokenAlpha("--destructive", 1) ||
      tokenAlpha("--danger", 1) ||
      (theme as any).destructive ||
      theme.colors[7]
    );
  }
  // Unknown or unclassified
  return (
    tokenAlpha("--muted-foreground", 0.7) ||
    theme.mutedColor ||
    theme.border
  );
}

export function normalizeDietFilterValue(
  category: string,
): "veg" | "nonveg" | "unknown" | "all" {
  const norm = category.trim().toLowerCase().replace(/[_\s-]+/g, "");
  if (norm === "veg") return "veg";
  if (norm === "nonveg") return "nonveg";
  if (norm === "unknown") return "unknown";
  return "all";
}

export function formatDietDonutTooltip(
  params: unknown,
  totalQuantity: number,
  theme: ChartTheme,
): string {
  if (!params || typeof params !== "object") return "";
  const p = params as {
    name?: string;
    value?: number;
    percent?: number;
    color?: string;
    data?: Partial<DietSplitItem>;
  };
  const item = p.data || {};
  const diet = p.name || item.diet || "Unknown";
  const quantity = typeof p.value === "number" ? p.value : (item.quantity ?? 0);
  const lines = item.item_lines ?? 0;
  const spend = item.line_total ?? 0;
  const share =
    totalQuantity > 0
      ? ((quantity / totalQuantity) * 100).toFixed(1) + "%"
      : typeof p.percent === "number"
      ? p.percent.toFixed(1) + "%"
      : "0%";

  const marker = p.color
    ? `<span style="display:inline-block;margin-right:6px;border-radius:50%;width:8px;height:8px;${swatchBg(p.color)}"></span>`
    : "";

  return [
    `<div style="font-family: 'Inter Variable', sans-serif; font-size: 12px; line-height: 1.5; color: ${theme.tooltipText}; min-width: 150px;">`,
    `  <div style="font-weight: 600; margin-bottom: 4px; display: flex; align-items: center;">${marker}${diet}</div>`,
    `  <div style="display: flex; justify-content: space-between; gap: 12px; color: ${theme.mutedColor};">`,
    `    <span>Quantity:</span>`,
    `    <span style="font-weight: 600; color: ${theme.tooltipText};">${quantity.toLocaleString("en-IN")}</span>`,
    `  </div>`,
    `  <div style="display: flex; justify-content: space-between; gap: 12px; color: ${theme.mutedColor};">`,
    `    <span>Item lines:</span>`,
    `    <span style="font-weight: 500; color: ${theme.tooltipText};">${lines.toLocaleString("en-IN")}</span>`,
    `  </div>`,
    `  <div style="display: flex; justify-content: space-between; gap: 12px; color: ${theme.mutedColor};">`,
    `    <span>Spend:</span>`,
    `    <span style="font-weight: 500; color: ${theme.tooltipText};">${formatRupees(spend)}</span>`,
    `  </div>`,
    `  <div style="display: flex; justify-content: space-between; gap: 12px; color: ${theme.mutedColor}; border-top: 1px solid ${theme.border}; margin-top: 4px; padding-top: 4px;">`,
    `    <span>Share:</span>`,
    `    <span style="font-weight: 600; color: ${theme.tooltipText};">${share}</span>`,
    `  </div>`,
    `</div>`,
  ].join("");
}

export function formatDietTrendTooltip(
  params: unknown,
  theme: ChartTheme,
): string {
  if (!Array.isArray(params) || params.length === 0) return "";
  const first = params[0];
  const month =
    first?.axisValueLabel || first?.axisValue || first?.name || "Month";
  let total = 0;
  const rows = params.map((item: any) => {
    const val = typeof item.value === "number" ? item.value : 0;
    total += val;
    const marker = item.color
      ? `<span style="display:inline-block;margin-right:6px;border-radius:50%;width:8px;height:8px;${swatchBg(item.color)}"></span>`
      : "";
    return `
      <div style="display: flex; justify-content: space-between; gap: 12px; color: ${theme.mutedColor}; margin-top: 2px;">
        <span style="display: flex; align-items: center;">${marker}${item.seriesName || "Category"}:</span>
        <span style="font-weight: 600; color: ${theme.tooltipText};">${val.toLocaleString("en-IN")}</span>
      </div>`;
  });

  return [
    `<div style="font-family: 'Inter Variable', sans-serif; font-size: 12px; line-height: 1.5; color: ${theme.tooltipText}; min-width: 150px;">`,
    `  <div style="font-weight: 600; margin-bottom: 4px;">${month}</div>`,
    ...rows,
    `  <div style="display: flex; justify-content: space-between; gap: 12px; color: ${theme.mutedColor}; border-top: 1px solid ${theme.border}; margin-top: 4px; padding-top: 4px;">`,
    `    <span>Total items:</span>`,
    `    <span style="font-weight: 600; color: ${theme.tooltipText};">${total.toLocaleString("en-IN")}</span>`,
    `  </div>`,
    `</div>`,
  ].join("");
}

export function buildDietDonutOption({
  data,
  theme,
  prefersReducedMotion = false,
  selectedCategory,
}: BuildDietDonutOptionParams = {}): EChartsCoreOption {
  const currentTheme = theme ?? resolveChartTheme("light", "emerald");
  const baseOption = buildBaseChartOption(currentTheme, prefersReducedMotion);

  const raw = data ?? [];
  const items = raw.filter((d): d is DietSplitItem =>
    Boolean(d && typeof d.diet === "string"),
  );

  const totalQuantity = items.reduce(
    (sum, item) => sum + (Number(item.quantity) || 0),
    0,
  );

  const selectedNorm = selectedCategory
    ? normalizeDietFilterValue(selectedCategory)
    : null;
  const hasSelection = selectedNorm !== null && selectedNorm !== "all";

  const pieData = items.map((item) => {
    const itemNorm = normalizeDietFilterValue(item.diet);
    const isSelected = hasSelection ? itemNorm === selectedNorm : false;
    const color = getDietColor(item.diet, currentTheme);

    return {
      name: item.diet,
      value: item.quantity,
      item_lines: item.item_lines,
      line_total: item.line_total,
      itemStyle: {
        color,
        opacity: hasSelection && !isSelected ? 0.35 : 1,
      },
      selected: isSelected,
    };
  });

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
      formatter: (params: unknown) =>
        formatDietDonutTooltip(params, totalQuantity, currentTheme),
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
      text: totalQuantity.toLocaleString("en-IN"),
      subtext: "Total items",
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
        name: "Dietary classification",
        type: "pie",
        radius: ["50%", "75%"],
        center: ["50%", "50%"],
        avoidLabelOverlap: true,
        selectedMode: "single",
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

export function buildDietTrendOption({
  data,
  theme,
  prefersReducedMotion = false,
}: BuildDietTrendOptionParams = {}): EChartsCoreOption {
  const currentTheme = theme ?? resolveChartTheme("light", "emerald");
  const baseOption = buildBaseChartOption(currentTheme, prefersReducedMotion);

  const raw = data ?? [];
  const items = raw.filter((d): d is DietMonthlyItem =>
    Boolean(d && typeof d.month === "string"),
  );

  const months = items.map((d) => d.month);
  const vegData = items.map((d) => d.veg ?? 0);
  const nonVegData = items.map((d) => d.non_veg ?? 0);
  const unknownData = items.map((d) => d.unknown ?? 0);

  const vegColor = getDietColor("Veg", currentTheme);
  const nonVegColor = getDietColor("Non-veg", currentTheme);
  const unknownColor = getDietColor("Unknown", currentTheme);

  return {
    ...baseOption,
    aria: {
      enabled: true,
      decal: { show: getPatterns() },
    },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      backgroundColor: currentTheme.tooltipBg,
      borderColor: currentTheme.tooltipBorder,
      textStyle: {
        color: currentTheme.tooltipText,
      },
      formatter: (params: unknown) =>
        formatDietTrendTooltip(params, currentTheme),
    },
    legend: {
      show: true,
      top: 0,
      left: "center",
      textStyle: {
        color: currentTheme.mutedColor,
        fontSize: 11,
        fontFamily: '"Inter Variable", sans-serif',
      },
      icon: "roundRect",
      data: ["Veg", "Non-veg", "Unknown"],
    },
    grid: {
      left: 45,
      right: 20,
      top: 36,
      bottom: 30,
      containLabel: true,
    },
    xAxis: {
      type: "category",
      data: months,
      axisLine: { lineStyle: { color: currentTheme.axisLine } },
      axisLabel: {
        color: currentTheme.mutedColor,
        fontSize: 11,
        hideOverlap: true,
      },
      axisTick: { show: false },
    },
    yAxis: {
      type: "value",
      name: "Items",
      nameTextStyle: {
        color: currentTheme.mutedColor,
        fontSize: 11,
      },
      splitLine: { lineStyle: { color: currentTheme.splitLine } },
      axisLabel: {
        color: currentTheme.mutedColor,
        fontSize: 11,
      },
    },
    series: [
      {
        name: "Veg",
        type: "bar",
        stack: "diet",
        itemStyle: {
          color: vegColor,
        },
        data: vegData,
      },
      {
        name: "Non-veg",
        type: "bar",
        stack: "diet",
        itemStyle: {
          color: nonVegColor,
        },
        data: nonVegData,
      },
      {
        name: "Unknown",
        type: "bar",
        stack: "diet",
        itemStyle: {
          color: unknownColor,
          borderRadius: [4, 4, 0, 0],
        },
        data: unknownData,
      },
    ],
    animation: !prefersReducedMotion,
    animationDuration: prefersReducedMotion ? 0 : 600,
    animationDurationUpdate: prefersReducedMotion ? 0 : 250,
    animationEasing: "cubicOut",
  };
}

export function DietSplitTrendChart({
  diet,
  diet_monthly,
  diet_unavailable_reason,
  title = "Dietary classification",
  subtitle = "Veg, non-veg, and unknown split with monthly volume trend",
  caption: captionProp,
  viewMode: viewModeProp,
  defaultViewMode = "split",
  onViewModeChange,
  onDietClick,
  isLoading,
  isEmpty: isEmptyProp,
  emptyReason,
  error,
  onRetry,
  className,
  showTable,
  onShowTableChange,
  fullscreen,
  onFullscreenChange,
}: DietSplitTrendChartProps) {
  const filters = useOptionalFilters();

  const [viewModeState, setViewModeState] =
    React.useState<DietViewMode>(defaultViewMode);
  const viewMode = viewModeProp ?? viewModeState;

  const handleViewModeChange = React.useCallback(
    (newMode: DietViewMode) => {
      if (viewModeProp === undefined) {
        setViewModeState(newMode);
      }
      onViewModeChange?.(newMode);
    },
    [viewModeProp, onViewModeChange],
  );

  const validDiet = React.useMemo(() => {
    return (diet ?? []).filter((d): d is DietSplitItem =>
      Boolean(d && typeof d.diet === "string"),
    );
  }, [diet]);

  const validMonthly = React.useMemo(() => {
    return (diet_monthly ?? []).filter((m): m is DietMonthlyItem =>
      Boolean(m && typeof m.month === "string"),
    );
  }, [diet_monthly]);

  const totalQuantity = React.useMemo(() => {
    return validDiet.reduce(
      (sum, item) => sum + (Number(item.quantity) || 0),
      0,
    );
  }, [validDiet]);

  const computedCaption =
    captionProp !== undefined ? captionProp : computeDietTakeaway(validDiet);

  const isDataUnavailable = Boolean(diet_unavailable_reason);
  const hasSplitData =
    validDiet.length > 0 &&
    validDiet.some((d) => (d.quantity || 0) > 0 || (d.item_lines || 0) > 0);
  const hasTrendData =
    validMonthly.length > 0 &&
    validMonthly.some(
      (m) =>
        (m.veg || 0) > 0 || (m.non_veg || 0) > 0 || (m.unknown || 0) > 0,
    );

  const empty =
    isEmptyProp ||
    isDataUnavailable ||
    (!hasSplitData && !hasTrendData && !isLoading && !error);
  const resolvedEmptyReason =
    diet_unavailable_reason || emptyReason || "No dietary data available.";

  const tableData = React.useMemo(() => {
    if (viewMode === "trend" && validMonthly.length > 0) {
      return validMonthly.map((m) => {
        const total = (m.veg || 0) + (m.non_veg || 0) + (m.unknown || 0);
        return {
          Month: m.month,
          Veg: m.veg,
          "Non-veg": m.non_veg,
          Unknown: m.unknown,
          Total: total,
        };
      });
    }

    if (validDiet.length === 0) return undefined;
    return validDiet.map((d) => {
      const share =
        totalQuantity > 0
          ? `${((d.quantity / totalQuantity) * 100).toFixed(1)}%`
          : "0%";
      return {
        Diet: d.diet,
        Quantity: d.quantity,
        "Item lines": d.item_lines ?? 0,
        "Line total": formatRupees(d.line_total),
        "Share (%)": share,
      };
    });
  }, [viewMode, validMonthly, validDiet, totalQuantity]);

  const ariaDescription = React.useMemo(() => {
    if (empty) {
      return `Dietary classification chart unavailable: ${resolvedEmptyReason}`;
    }
    if (viewMode === "split") {
      const parts = validDiet.map((d) => `${d.diet}: ${pluralize(d.quantity, "item")}`);
      return `Dietary classification donut breakdown: ${parts.join(", ")}`;
    }
    return `Monthly dietary volume trend across ${validMonthly.length} months`;
  }, [empty, resolvedEmptyReason, viewMode, validDiet, validMonthly]);

  const activeVegFilter = filters?.filters?.veg ?? "all";

  const handleClick = React.useCallback(
    (params: any) => {
      const rawCategory =
        params?.name || params?.seriesName || params?.data?.diet || "";
      if (!rawCategory) return;
      const targetFilter = normalizeDietFilterValue(rawCategory);

      if (filters?.update) {
        if (filters.filters.veg === targetFilter) {
          filters.update({ veg: "all" });
        } else {
          filters.update({ veg: targetFilter });
        }
      }

      onDietClick?.(rawCategory, targetFilter);
    },
    [filters, onDietClick]
  );

  const spec = React.useCallback(
    (
      _chartData: any,
      theme: ChartTheme,
      { prefersReducedMotion }: { prefersReducedMotion: boolean }
    ) => {
      if (viewMode === "split") {
        return buildDietDonutOption({
          data: validDiet,
          theme,
          prefersReducedMotion,
          selectedCategory: activeVegFilter,
        });
      }
      return buildDietTrendOption({
        data: validMonthly,
        theme,
        prefersReducedMotion,
      });
    },
    [viewMode, validDiet, validMonthly, activeVegFilter]
  );

  const infoPopover = (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Dietary classification information"
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
          <p className="font-semibold text-foreground text-sm">
            Dietary Classification
          </p>
          <p className="text-muted-foreground mt-0.5 leading-relaxed">
            Classifies order items into vegetarian, non-vegetarian, or unknown
            categories based on item line data. Note: Reflects individual item
            quantities, not overall order count.
          </p>
        </div>
        <div className="space-y-1.5 pt-1 border-t border-border/50">
          <p className="font-medium text-foreground">Split & Monthly Trend</p>
          <p className="text-muted-foreground leading-relaxed">
            The Split donut illustrates item volume and spend share across
            dietary categories. The Trend view tracks monthly stacked volume
            progression to reveal dietary shifts over time.
          </p>
        </div>
        <div className="space-y-1.5 pt-1 border-t border-border/50">
          <p className="font-medium text-foreground">
            Unavailable Data Threshold
          </p>
          <p className="text-muted-foreground leading-relaxed">
            When more than 80% of item lines lack dietary classification, the
            chart displays an unavailable reason notice rather than
            inconclusive metrics.
          </p>
        </div>
        <div className="space-y-1.5 pt-1 border-t border-border/50">
          <p className="font-medium text-foreground">Cross-Filtering</p>
          <p className="text-muted-foreground leading-relaxed">
            Clicking a category toggles the global diet filter (Veg, Non-veg,
            Unknown) to drill into specific order lines.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );

  return (
    <BaseChart
      title={title}
      subtitle={subtitle}
      caption={computedCaption ?? undefined}
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
      data={{ viewMode, validDiet, validMonthly, activeVegFilter }}
      spec={spec}
      onClick={handleClick}
      highlightDimension={viewMode === "trend" ? "month" : "diet"}
      getHighlightValue={(params) =>
        viewMode === "trend"
          ? params?.axisValueLabel || params?.axisValue || params?.name
          : undefined
      }
      registerModules={registerDietChartModules}
      ariaLabel={title}
      ariaDescription={ariaDescription}
    >
      <div className="flex items-center justify-between">
        <SegmentedControl
          options={[
            { value: "split", label: "Split" },
            { value: "trend", label: "Trend" },
          ]}
          value={viewMode}
          onChange={(v) => handleViewModeChange(v as DietViewMode)}
        />
      </div>
    </BaseChart>
  );
}

export default DietSplitTrendChart;
