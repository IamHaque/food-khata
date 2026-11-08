import * as React from "react";
import * as echarts from "echarts/core";
import { BarChart } from "echarts/charts";
import {
  PolarComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  AriaComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsCoreOption } from "echarts/core";
import { Info } from "lucide-react";

import { ChartCard } from "@/components/dashboard/ChartCard";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  getCurrentChartTheme,
  buildBaseChartOption,
  resolveChartTheme,
  type ChartTheme,
} from "@/lib/chart-theme";
import { useFilters } from "@/app/FilterContext";
import {
  registerChart,
  emitHighlight,
  emitClear,
} from "@/lib/highlight-bus";
import {
  hourToMealSlot,
  type CrossFilterDimension,
} from "@/lib/crossfilter";
import {
  computeMealSlotsTakeaway,
  formatRupees,
} from "@/lib/captions";
import type { FilterState } from "@/lib/filters";

// Ensure ECharts modules registered once
let registered = false;
function registerOnce() {
  if (registered) return;
  echarts.use([
    BarChart,
    PolarComponent,
    TooltipComponent,
    LegendComponent,
    TitleComponent,
    AriaComponent,
    CanvasRenderer,
  ]);
  registered = true;
}
registerOnce();

export const MEAL_SLOT_KEYS = [
  "breakfast",
  "lunch",
  "snack",
  "dinner",
  "late_night",
] as const;

export type MealSlotKey = (typeof MEAL_SLOT_KEYS)[number];

export const MEAL_SLOT_LABELS: Record<string, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  snack: "Snack",
  dinner: "Dinner",
  late_night: "Late night",
};

export const MEAL_SLOT_WINDOWS: Record<string, string> = {
  breakfast: "6:00 AM – 11:00 AM",
  lunch: "11:00 AM – 4:00 PM",
  snack: "4:00 PM – 7:00 PM",
  dinner: "7:00 PM – 11:00 PM",
  late_night: "11:00 PM – 6:00 AM",
};

export interface MealSlotItem {
  key: string;
  orders: number;
  spend: number;
}

export interface NormalizedMealSlot {
  key: MealSlotKey;
  label: string;
  window: string;
  orders: number;
  spend: number;
  share: string;
  sharePercent: number;
}

export function normalizeMealSlotRows(
  data?: readonly (MealSlotItem | { key?: string; slot?: string; orders?: number; count?: number; spend?: number; amount?: number } | null | undefined)[] | null,
): NormalizedMealSlot[] {
  const map = new Map<MealSlotKey, { orders: number; spend: number }>();
  for (const k of MEAL_SLOT_KEYS) {
    map.set(k, { orders: 0, spend: 0 });
  }

  if (data) {
    for (const item of data) {
      if (!item) continue;
      const rawKey = item.key ?? (item as any).slot;
      if (!rawKey) continue;
      const normalizedKey = String(rawKey)
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_") as MealSlotKey;
      if (map.has(normalizedKey)) {
        const current = map.get(normalizedKey)!;
        current.orders += Number(item.orders ?? (item as any).count ?? 0);
        current.spend += Number(item.spend ?? (item as any).amount ?? 0);
      }
    }
  }

  const totalOrders = Array.from(map.values()).reduce(
    (sum, curr) => sum + curr.orders,
    0,
  );

  return MEAL_SLOT_KEYS.map((k) => {
    const stat = map.get(k)!;
    const sharePercent =
      totalOrders > 0 ? (stat.orders / totalOrders) * 100 : 0;
    const share = `${sharePercent.toFixed(1)}%`;
    return {
      key: k,
      label: MEAL_SLOT_LABELS[k],
      window: MEAL_SLOT_WINDOWS[k],
      orders: stat.orders,
      spend: stat.spend,
      share,
      sharePercent,
    };
  });
}

export function buildMealSlotsTableRows(
  data?: readonly MealSlotItem[] | null,
): {
  tableHeaders: string[];
  tableRows: Array<[string, number, string, string]>;
  tableData: Array<{
    "Meal slot": string;
    Orders: number;
    Spend: string;
    Share: string;
  }>;
} {
  const normalized = normalizeMealSlotRows(data);
  const tableHeaders = ["Meal slot", "Orders", "Spend", "Share"];
  const tableRows = normalized.map(
    (s) =>
      [s.label, s.orders, formatRupees(s.spend), s.share] as [
        string,
        number,
        string,
        string,
      ],
  );
  const tableData = normalized.map((s) => ({
    "Meal slot": s.label,
    Orders: s.orders,
    Spend: formatRupees(s.spend),
    Share: s.share,
  }));
  return { tableHeaders, tableRows, tableData };
}

export function formatMealSlotTooltip(
  slot: NormalizedMealSlot,
  theme: ChartTheme,
  markerColor?: string,
): string {
  const color = markerColor || theme.colors[0];
  const orderCountText = `${slot.orders.toLocaleString("en-IN")} ${
    slot.orders === 1 ? "order" : "orders"
  }`;
  return [
    `<div style="font-family: inherit; font-size: 12px; line-height: 1.5; min-width: 170px;">`,
    `  <div style="font-weight: 600; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">`,
    `    <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background-color:${color};"></span>`,
    `    <span style="color: ${theme.textColor};">${slot.label}</span>`,
    `    <span style="color: ${theme.mutedColor}; font-size: 11px; margin-left: auto;">${slot.window}</span>`,
    `  </div>`,
    `  <div style="display: flex; justify-content: space-between; gap: 12px; margin-bottom: 2px;">`,
    `    <span style="color: ${theme.mutedColor};">Orders:</span>`,
    `    <span style="font-weight: 600; color: ${theme.textColor};">${orderCountText}</span>`,
    `  </div>`,
    `  <div style="display: flex; justify-content: space-between; gap: 12px; margin-bottom: 2px;">`,
    `    <span style="color: ${theme.mutedColor};">Share of orders:</span>`,
    `    <span style="font-weight: 600; color: ${theme.textColor};">${slot.share}</span>`,
    `  </div>`,
    `  <div style="display: flex; justify-content: space-between; gap: 12px;">`,
    `    <span style="color: ${theme.mutedColor};">Spend:</span>`,
    `    <span style="font-weight: 600; color: ${theme.textColor};">${formatRupees(slot.spend)}</span>`,
    `  </div>`,
    `</div>`,
  ].join("");
}

export interface BuildMealSlotsOptionParams {
  data?: readonly MealSlotItem[] | null;
  theme?: ChartTheme;
  prefersReducedMotion?: boolean;
  selectedSlots?: readonly string[] | null;
}

export function buildMealSlotsOption(
  dataOrParams?: readonly MealSlotItem[] | null | BuildMealSlotsOptionParams,
  themeArg?: ChartTheme,
  selectedSlotsArg?: readonly string[] | null,
  prefersReducedMotionArg = false,
): EChartsCoreOption {
  let data: readonly MealSlotItem[] | null | undefined;
  let theme: ChartTheme | undefined;
  let prefersReducedMotion = false;
  let selectedSlots: readonly string[] | null | undefined;

  if (
    dataOrParams &&
    ("theme" in dataOrParams ||
      "selectedSlots" in dataOrParams ||
      "data" in dataOrParams)
  ) {
    const p = dataOrParams as BuildMealSlotsOptionParams;
    data = p.data;
    theme = p.theme;
    selectedSlots = p.selectedSlots;
    prefersReducedMotion = Boolean(p.prefersReducedMotion);
  } else {
    data = dataOrParams as readonly MealSlotItem[] | null | undefined;
    theme = themeArg;
    selectedSlots = selectedSlotsArg;
    prefersReducedMotion = Boolean(prefersReducedMotionArg);
  }

  if (!theme) {
    theme =
      typeof document === "undefined"
        ? resolveChartTheme("light", "emerald")
        : getCurrentChartTheme();
  }

  const normalized = normalizeMealSlotRows(data);

  const activeSelected = (selectedSlots ?? [])
    .map((s) => String(s).trim().toLowerCase().replace(/[\s-]+/g, "_"))
    .filter((s) => s.length > 0);
  const hasActiveSelection = activeSelected.length > 0;

  const base = buildBaseChartOption(theme, prefersReducedMotion);
  const categoryLabels = normalized.map((s) => s.label);

  const seriesData = normalized.map((slot, idx) => {
    const isSelected = activeSelected.includes(slot.key);
    const opacity = hasActiveSelection ? (isSelected ? 1 : 0.35) : 1;
    const color = theme.colors[idx % theme.colors.length];

    return {
      value: slot.orders,
      name: slot.label,
      key: slot.key,
      slotData: slot,
      itemStyle: {
        color,
        opacity,
        borderRadius: [4, 4, 0, 0],
      },
    };
  });

  return {
    ...base,
    polar: {
      radius: ["18%", "78%"],
    },
    angleAxis: {
      type: "category",
      data: categoryLabels,
      startAngle: 90,
      boundaryGap: true,
      axisLine: {
        lineStyle: {
          color: theme.axisLineColor,
        },
      },
      axisLabel: {
        color: theme.textColor,
        fontSize: 11,
        formatter: (val: string) => val,
      },
      splitLine: {
        show: true,
        lineStyle: {
          color: theme.splitLineColor,
          type: "dashed",
        },
      },
    },
    radiusAxis: {
      min: 0,
      splitNumber: 4,
      axisLine: {
        lineStyle: {
          color: theme.axisLineColor,
        },
      },
      axisLabel: {
        color: theme.mutedColor,
        fontSize: 10,
        formatter: (v: number) => (v % 1 === 0 ? String(v) : v.toFixed(0)),
      },
      splitLine: {
        lineStyle: {
          color: theme.splitLineColor,
        },
      },
    },
    tooltip: {
      ...(base.tooltip as object),
      trigger: "item",
      formatter: (params: any) => {
        const item = params?.data;
        if (!item?.slotData) return "";
        const slot = item.slotData as NormalizedMealSlot;
        const color =
          item.itemStyle?.color ||
          theme.colors[params.dataIndex % theme.colors.length];
        return formatMealSlotTooltip(slot, theme, color);
      },
    },
    series: [
      {
        type: "bar",
        coordinateSystem: "polar",
        name: "Orders",
        data: seriesData,
        roundCap: true,
        barCategoryGap: "30%",
        emphasis: {
          itemStyle: {
            opacity: 1,
            shadowBlur: 10,
            shadowColor: "rgba(0, 0, 0, 0.2)",
          },
        },
      },
    ],
  };
}

export function handleMealSlotClick(
  params: unknown,
  filters?: {
    meal_slots?: string[];
    update?: (patch: Partial<FilterState>) => void;
    applyCrossFilter?: (
      dimension: CrossFilterDimension,
      value: string,
      isMulti?: boolean,
    ) => void;
  } | null,
  onSlotClick?: (slotKey: string, isMulti?: boolean) => void,
): string | null {
  const p = params as any;
  let slotKey: string | null = null;
  const isMulti = Boolean(p?.event?.event?.shiftKey || p?.isMulti);

  if (p?.data?.key) {
    slotKey = String(p.data.key);
  } else if (
    typeof p?.dataIndex === "number" &&
    p.dataIndex >= 0 &&
    p.dataIndex < MEAL_SLOT_KEYS.length
  ) {
    slotKey = MEAL_SLOT_KEYS[p.dataIndex];
  } else if (p?.name) {
    const raw = String(p.name).trim().toLowerCase().replace(/[\s-]+/g, "_");
    if (MEAL_SLOT_KEYS.includes(raw as any)) {
      slotKey = raw;
    } else {
      const entry = Object.entries(MEAL_SLOT_LABELS).find(
        ([, lbl]) => lbl.toLowerCase() === String(p.name).toLowerCase(),
      );
      if (entry) slotKey = entry[0];
    }
  }

  if (!slotKey) return null;
  const normKey = slotKey.trim().toLowerCase().replace(/[\s-]+/g, "_");

  if (filters?.applyCrossFilter) {
    filters.applyCrossFilter("meal_slot", normKey, isMulti);
  } else if (filters?.update && filters.meal_slots !== undefined) {
    const current = filters.meal_slots ?? [];
    let next: string[];
    if (!isMulti) {
      if (current.length === 1 && current[0] === normKey) {
        next = [];
      } else {
        next = [normKey];
      }
    } else {
      if (current.includes(normKey)) {
        next = current.filter((s) => s !== normKey);
      } else {
        next = [...current, normKey];
      }
    }
    filters.update({ meal_slots: next as any });
  }

  onSlotClick?.(normKey, isMulti);
  return normKey;
}

export interface MealSlotsChartProps {
  data?: readonly MealSlotItem[] | null;
  timing_unavailable_reason?: string | null;
  isLoading?: boolean;
  isEmpty?: boolean;
  emptyReason?: string;
  error?: Error | string | null;
  onRetry?: () => void;
  title?: string;
  subtitle?: string;
  caption?: string;
  className?: string;
  selectedSlots?: readonly string[] | null;
  onSlotClick?: (slotKey: string, isMulti?: boolean) => void;
  showTable?: boolean;
  onShowTableChange?: (value: boolean) => void;
  fullscreen?: boolean;
  onFullscreenChange?: (value: boolean) => void;
}

export function MealSlotsInfoContent() {
  return (
    <div>
      <div>
        <p className="font-semibold text-foreground text-sm">Meal Slots</p>
        <p className="text-muted-foreground mt-0.5 leading-relaxed">
          Radial polar distribution of orders across 5 time-of-day meal slot windows.
        </p>
      </div>
      <div className="space-y-1.5 pt-1 border-t border-border/50">
        <p className="font-medium text-foreground">Meal Slot Windows</p>
        <ul className="text-muted-foreground space-y-1 pl-1">
          <li>• <span className="text-foreground font-medium">Breakfast:</span> 6:00 AM – 11:00 AM</li>
          <li>• <span className="text-foreground font-medium">Lunch:</span> 11:00 AM – 4:00 PM</li>
          <li>• <span className="text-foreground font-medium">Snack:</span> 4:00 PM – 7:00 PM</li>
          <li>• <span className="text-foreground font-medium">Dinner:</span> 7:00 PM – 11:00 PM</li>
          <li>• <span className="text-foreground font-medium">Late night:</span> 11:00 PM – 6:00 AM</li>
        </ul>
      </div>
      <div className="space-y-1.5 pt-1 border-t border-border/50">
        <p className="font-medium text-foreground">Interactive Filtering</p>
        <p className="text-muted-foreground leading-relaxed">
          Clicking any meal slot bar toggles the meal_slots filter. Shift-click to select multiple meal slots.
        </p>
      </div>
    </div>
  );
}

function useOptionalFilters() {
  try {
    return useFilters();
  } catch {
    return null;
  }
}

export function MealSlotsChart({
  data,
  timing_unavailable_reason,
  isLoading = false,
  isEmpty = false,
  emptyReason,
  error = null,
  onRetry,
  title = "Meal slots",
  subtitle = "Distribution across breakfast, lunch, snack, dinner, and late night",
  caption: captionProp,
  className,
  selectedSlots: selectedSlotsProp,
  onSlotClick,
  showTable,
  onShowTableChange,
  fullscreen,
  onFullscreenChange,
}: MealSlotsChartProps) {
  const filtersContext = useOptionalFilters();
  const activeSelectedSlots = React.useMemo(() => {
    if (selectedSlotsProp !== undefined) return selectedSlotsProp ?? [];
    return filtersContext?.filters?.meal_slots ?? [];
  }, [selectedSlotsProp, filtersContext?.filters?.meal_slots]);

  const totalOrders = React.useMemo(() => {
    if (!data || data.length === 0) return 0;
    return data.reduce((sum, item) => sum + (Number(item?.orders) || 0), 0);
  }, [data]);

  const empty = Boolean(
    isEmpty ||
      timing_unavailable_reason ||
      !data ||
      data.length === 0 ||
      totalOrders === 0,
  );

  const resolvedEmptyReason =
    timing_unavailable_reason ||
    emptyReason ||
    (!data || data.length === 0
      ? "No meal slot data available."
      : totalOrders === 0
        ? "No orders recorded across meal slots in this period."
        : "No meal slot data available.");

  const { tableHeaders, tableRows, tableData } = React.useMemo(() => {
    return buildMealSlotsTableRows(data);
  }, [data]);

  const caption = React.useMemo(() => {
    if (captionProp !== undefined) return captionProp;
    if (empty) return undefined;
    return computeMealSlotsTakeaway(data) ?? undefined;
  }, [captionProp, empty, data]);

  const containerRef = React.useRef<HTMLDivElement>(null);
  const chartRef = React.useRef<echarts.ECharts | null>(null);
  const idRef = React.useRef(
    `meal-slots-chart-${Math.random().toString(36).slice(2, 9)}`,
  );
  const chartId = idRef.current;

  React.useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    registerOnce();
    if (!chartRef.current) {
      chartRef.current = echarts.init(node);
    }
    const chart = chartRef.current;

    const unregister = registerChart(chartId, chart, (dimension, value) => {
      if (dimension === "meal_slot" || dimension === "hour") {
        let slotKey = value;
        if (dimension === "hour") {
          try {
            slotKey = hourToMealSlot(value);
          } catch {
            return undefined;
          }
        }
        const norm = String(slotKey).trim().toLowerCase().replace(/[\s-]+/g, "_");
        const idx = MEAL_SLOT_KEYS.indexOf(norm as any);
        if (idx !== -1) {
          return {
            type: "highlight",
            seriesIndex: 0,
            dataIndex: idx,
          };
        }
      }
      return undefined;
    });

    const handleClick = (params: unknown) => {
      handleMealSlotClick(params, filtersContext, onSlotClick);
    };

    const handleMouseOver = (params: any) => {
      const slotKey =
        params?.data?.key ||
        (typeof params?.dataIndex === "number"
          ? MEAL_SLOT_KEYS[params.dataIndex]
          : null);
      if (slotKey) {
        emitHighlight(chartId, "meal_slot", slotKey);
      }
    };

    const handleMouseOut = () => {
      emitClear(chartId);
    };

    chart.on("click", handleClick);
    chart.on("mouseover", handleMouseOver);
    chart.on("mouseout", handleMouseOut);
    chart.on("globalout", handleMouseOut);

    const ro = new ResizeObserver(() => {
      if (chart && !chart.isDisposed()) {
        chart.resize();
      }
    });
    ro.observe(node);

    return () => {
      chart.off("click", handleClick);
      chart.off("mouseover", handleMouseOver);
      chart.off("mouseout", handleMouseOut);
      chart.off("globalout", handleMouseOut);
      unregister();
      ro.disconnect();
      if (chartRef.current) {
        chartRef.current.dispose();
        chartRef.current = null;
      }
    };
  }, [chartId, filtersContext, onSlotClick]);

  React.useEffect(() => {
    const chart = chartRef.current;
    if (!chart || chart.isDisposed()) return;
    const theme = getCurrentChartTheme();
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const option = buildMealSlotsOption({
      data: data ?? [],
      theme,
      selectedSlots: activeSelectedSlots,
      prefersReducedMotion,
    });
    chart.setOption(option, { notMerge: true, lazyUpdate: true });
  }, [data, activeSelectedSlots]);

  const infoPopover = (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Meal slots information"
          className="text-muted-foreground hover:text-foreground inline-flex items-center justify-center p-0.5 rounded cursor-pointer transition-colors"
        >
          <Info className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 text-xs space-y-2.5 p-3.5 bg-popover text-popover-foreground shadow-md rounded-md border border-border"
        align="start"
      >
        <MealSlotsInfoContent />
      </PopoverContent>
    </Popover>
  );

  return (
    <ChartCard
      title={title}
      subtitle={subtitle}
      caption={caption}
      infoPopover={infoPopover}
      isLoading={isLoading}
      isEmpty={empty}
      emptyReason={resolvedEmptyReason}
      error={error}
      onRetry={onRetry}
      tableHeaders={tableHeaders}
      tableRows={tableRows}
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
        aria-label={title}
        className="cursor-pointer"
        style={{ height: 320, width: "100%" }}
      />
    </ChartCard>
  );
}

export default MealSlotsChart;
