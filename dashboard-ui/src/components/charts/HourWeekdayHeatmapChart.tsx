import * as React from "react";
import * as echarts from "echarts/core";
import { HeatmapChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  VisualMapComponent,
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
  weekdayToDayType,
  type MealSlot,
} from "@/lib/crossfilter";
import {
  computeHourWeekdayTakeaway,
  formatRupees,
  type HourWeekdayDatum,
} from "@/lib/captions";
import type { FilterState } from "@/lib/filters";

// Ensure ECharts modules registered once
let registered = false;
function registerOnce() {
  if (registered) return;
  echarts.use([
    HeatmapChart,
    GridComponent,
    TooltipComponent,
    VisualMapComponent,
    AriaComponent,
    CanvasRenderer,
  ]);
  registered = true;
}
registerOnce();

export const WEEKDAY_SHORT_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export const WEEKDAY_FULL_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export const HOURS = Array.from(
  { length: 24 },
  (_, i) => `${String(i).padStart(2, "0")}:00`,
);

export interface NormalizedHeatmapCell {
  key: string;
  weekday: number; // 0..6
  hour: number; // 0..23
  dayName: string; // 'Monday'..'Sunday'
  dayShort: string; // 'Mon'..'Sun'
  hourLabel: string; // '00:00'..'23:00'
  hourRange: string; // '00:00 - 00:59'
  orders: number;
  spend: number;
}

export function normalizeHourWeekdayRows(
  data: readonly HourWeekdayDatum[] | null | undefined,
): NormalizedHeatmapCell[] {
  const cellMap = new Map<number, NormalizedHeatmapCell>();

  for (let w = 0; w < 7; w++) {
    for (let h = 0; h < 24; h++) {
      const keyIndex = w * 24 + h;
      const startStr = `${String(h).padStart(2, "0")}:00`;
      const endStr = `${String(h).padStart(2, "0")}:59`;
      cellMap.set(keyIndex, {
        key: String(keyIndex),
        weekday: w,
        hour: h,
        dayName: WEEKDAY_FULL_NAMES[w],
        dayShort: WEEKDAY_SHORT_NAMES[w],
        hourLabel: startStr,
        hourRange: `${startStr} - ${endStr}`,
        orders: 0,
        spend: 0,
      });
    }
  }

  if (data) {
    for (const row of data) {
      if (!row) continue;
      const rawKey = row.key;
      if (rawKey == null || rawKey === "") continue;
      const keyNum = typeof rawKey === "number" ? rawKey : parseInt(String(rawKey), 10);
      if (!Number.isFinite(keyNum) || keyNum < 0 || keyNum >= 168) continue;

      const cell = cellMap.get(keyNum);
      if (cell) {
        cell.orders += Number(row.orders ?? (row as any).count ?? 0);
        cell.spend += Number(row.spend ?? (row as any).amount ?? 0);
      }
    }
  }

  return Array.from(cellMap.values());
}

export function buildHourWeekdayTableRows(
  data: readonly HourWeekdayDatum[] | null | undefined,
  onlyActive = false,
): {
  tableHeaders: string[];
  tableRows: Array<[string, string, number, number]>;
  tableData: Array<{ Day: string; Hour: string; Orders: number; Spend: number }>;
} {
  const normalized = normalizeHourWeekdayRows(data);
  const rows = onlyActive ? normalized.filter((r) => r.orders > 0) : normalized;
  const tableHeaders = ["Day", "Hour", "Orders", "Spend"];
  const tableRows = rows.map(
    (r) => [r.dayName, r.hourRange, r.orders, r.spend] as [string, string, number, number],
  );
  const tableData = rows.map((r) => ({
    Day: r.dayName,
    Hour: r.hourRange,
    Orders: r.orders,
    Spend: r.spend,
  }));
  return { tableHeaders, tableRows, tableData };
}

export interface CellClickPayload {
  hour: number;
  weekday: number;
  orders: number;
  spend: number;
  mealSlot: MealSlot;
  dayType: "weekday" | "weekend";
}

export function handleHourWeekdayCellClick(
  params: unknown,
  filters: { update: (patch: Partial<FilterState>) => void } | null | undefined,
  onCellClick?: (payload: CellClickPayload) => void,
): CellClickPayload | null {
  const p = params as any;
  let hour: number | null = null;
  let weekday: number | null = null;
  let orders = 0;
  let spend = 0;

  if (Array.isArray(p?.value) && p.value.length >= 2) {
    hour = Number(p.value[0]);
    weekday = Number(p.value[1]);
    orders = Number(p.value[2] ?? 0);
    spend = Number(p.value[3] ?? 0);
  } else if (Array.isArray(p?.data) && p.data.length >= 2) {
    hour = Number(p.data[0]);
    weekday = Number(p.data[1]);
    orders = Number(p.data[2] ?? 0);
    spend = Number(p.data[3] ?? 0);
  } else if (p && typeof p.hour === "number" && typeof p.weekday === "number") {
    hour = p.hour;
    weekday = p.weekday;
    orders = Number(p.orders ?? 0);
    spend = Number(p.spend ?? 0);
  }

  if (
    hour == null ||
    weekday == null ||
    !Number.isFinite(hour) ||
    !Number.isFinite(weekday) ||
    hour < 0 ||
    hour > 23 ||
    weekday < 0 ||
    weekday > 6
  ) {
    return null;
  }

  const mealSlot = hourToMealSlot(hour);
  const dayCode = WEEKDAY_SHORT_NAMES[weekday].toLowerCase();
  const dayType = weekdayToDayType(dayCode);

  const payload: CellClickPayload = {
    hour,
    weekday,
    orders,
    spend,
    mealSlot,
    dayType,
  };

  if (filters) {
    filters.update({
      day_type: dayType,
      meal_slots: [mealSlot],
    });
  }

  onCellClick?.(payload);
  return payload;
}

export interface BuildHourWeekdayHeatmapOptionOptions {
  theme?: ChartTheme;
  reducedMotion?: boolean;
}

export function buildHourWeekdayHeatmapOption(
  data: readonly HourWeekdayDatum[] | null | undefined,
  themeOrOpts?: ChartTheme | BuildHourWeekdayHeatmapOptionOptions,
  reducedMotionArg?: boolean,
): EChartsCoreOption {
  let theme: ChartTheme | undefined;
  let reducedMotion = false;

  if (themeOrOpts) {
    if ("colors" in themeOrOpts || "mode" in themeOrOpts) {
      theme = themeOrOpts as ChartTheme;
      if (typeof reducedMotionArg === "boolean") {
        reducedMotion = reducedMotionArg;
      }
    } else {
      const opts = themeOrOpts as BuildHourWeekdayHeatmapOptionOptions;
      if (opts.theme) theme = opts.theme;
      if (typeof opts.reducedMotion === "boolean") reducedMotion = opts.reducedMotion;
    }
  }

  if (!theme) {
    theme =
      typeof document === "undefined"
        ? resolveChartTheme("light", "emerald")
        : getCurrentChartTheme();
  }

  const normalized = normalizeHourWeekdayRows(data);
  const maxOrders = Math.max(0, ...normalized.map((c) => c.orders));
  const seriesData = normalized.map((c) => [c.hour, c.weekday, c.orders, c.spend]);

  const base = buildBaseChartOption(theme, reducedMotion);
  const themePrimary = theme["chart-1"] || theme.primary || theme.colors[0];
  const inRangeColors = [themePrimary + "22", themePrimary];

  const option: EChartsCoreOption = {
    ...base,
    tooltip: {
      ...(base.tooltip as object),
      trigger: "item",
      formatter: (params: unknown) => {
        const p = params as {
          value?: unknown;
          data?: unknown;
        };
        const raw = Array.isArray(p?.value)
          ? p.value
          : Array.isArray(p?.data)
            ? p.data
            : null;
        if (!raw || raw.length < 2) return "";

        const hour = Number(raw[0]);
        const dayIdx = Number(raw[1]);
        const orders = Number(raw[2] ?? 0);
        const spend = Number(raw[3] ?? 0);

        const dayName = WEEKDAY_FULL_NAMES[dayIdx] ?? "Unknown";
        const startStr = `${String(hour).padStart(2, "0")}:00`;
        const endStr = `${String(hour).padStart(2, "0")}:59`;
        const hourRange = `${startStr} - ${endStr}`;
        const ordersFormatted = `${orders.toLocaleString("en-IN")} ${
          orders === 1 ? "order" : "orders"
        }`;
        const spendFormatted = formatRupees(spend);

        return [
          `<div class="font-bold text-xs mb-1">${dayName}, ${hourRange}</div>`,
          `<div class="flex justify-between gap-3 text-xs"><span>Orders:</span> <strong>${ordersFormatted}</strong></div>`,
          `<div class="flex justify-between gap-3 text-xs"><span>Spend:</span> <strong>${spendFormatted}</strong></div>`,
        ].join("");
      },
    },
    grid: {
      top: 15,
      right: 15,
      bottom: 55,
      left: 45,
      containLabel: true,
    },
    xAxis: {
      type: "category",
      data: [...HOURS],
      splitArea: { show: false },
      splitLine: {
        show: true,
        lineStyle: {
          color: theme.splitLine,
          width: 0.5,
        },
      },
      axisLine: { lineStyle: { color: theme.axisLine } },
      axisTick: { alignWithLabel: true },
      axisLabel: {
        color: theme.mutedColor,
        fontSize: 10,
        interval: 1, // display every 2 hours to prevent crowding
      },
    },
    yAxis: {
      type: "category",
      data: [...WEEKDAY_SHORT_NAMES],
      inverse: true, // Monday at top, Sunday at bottom
      splitArea: { show: false },
      splitLine: {
        show: true,
        lineStyle: {
          color: theme.splitLine,
          width: 0.5,
        },
      },
      axisLine: { lineStyle: { color: theme.axisLine } },
      axisLabel: {
        color: theme.mutedColor,
        fontSize: 11,
      },
    },
    visualMap: {
      min: 0,
      max: maxOrders > 0 ? maxOrders : 1,
      type: "continuous",
      calculable: false,
      orient: "horizontal",
      left: "center",
      bottom: 0,
      dimension: 2,
      text: ["More", "Less"],
      inRange: {
        color: inRangeColors,
      },
      textStyle: {
        color: theme.mutedColor,
        fontSize: 10,
      },
    },
    series: [
      {
        name: "Orders",
        type: "heatmap",
        data: seriesData,
        label: {
          show: false,
        },
        itemStyle: {
          borderWidth: 1,
          borderColor: theme.border,
          borderRadius: 2,
        },
        emphasis: {
          itemStyle: {
            shadowBlur: 6,
            shadowColor: theme.textColor,
            borderColor: theme.textColor,
            borderWidth: 1.5,
          },
        },
      },
    ],
  };

  return option;
}

function useOptionalFilters() {
  try {
    return useFilters();
  } catch {
    return null;
  }
}

export interface HourWeekdayHeatmapChartProps {
  data?: readonly HourWeekdayDatum[] | null;
  hour_weekday?: readonly HourWeekdayDatum[] | null;
  timing_unavailable_reason?: string | null;
  timingUnavailableReason?: string | null;
  title?: string;
  subtitle?: string;
  isLoading?: boolean;
  isEmpty?: boolean;
  emptyReason?: string;
  error?: Error | string | null;
  onRetry?: () => void;
  className?: string;
  onCellClick?: (payload: CellClickPayload) => void;
  showTable?: boolean;
  onShowTableChange?: (value: boolean) => void;
  fullscreen?: boolean;
  onFullscreenChange?: (value: boolean) => void;
}

export function HourWeekdayHeatmapChart({
  data: dataProp,
  hour_weekday,
  timing_unavailable_reason,
  timingUnavailableReason: timingUnavailableProp,
  title = "Hour and weekday heatmap",
  subtitle = "Order distribution across 7 days and 24 hours",
  isLoading,
  isEmpty,
  emptyReason,
  error,
  onRetry,
  className,
  onCellClick,
  showTable,
  onShowTableChange,
  fullscreen,
  onFullscreenChange,
}: HourWeekdayHeatmapChartProps) {
  const data = dataProp ?? hour_weekday;
  const unavailableReason =
    timingUnavailableProp ?? timing_unavailable_reason ?? null;

  const filters = useOptionalFilters();
  const allCells = React.useMemo(() => normalizeHourWeekdayRows(data), [data]);
  const totalOrders = React.useMemo(
    () => allCells.reduce((acc, c) => acc + c.orders, 0),
    [allCells],
  );

  const { tableHeaders, tableRows, tableData } = React.useMemo(() => {
    const all = buildHourWeekdayTableRows(data, false);
    const active = all.tableData.filter((r) => r.Orders > 0);
    if (active.length > 0) {
      return buildHourWeekdayTableRows(data, true);
    }
    return all;
  }, [data]);

  const caption = React.useMemo(() => computeHourWeekdayTakeaway(data), [data]);

  const empty =
    isEmpty ||
    Boolean(unavailableReason) ||
    (!isLoading && !error && (totalOrders === 0 || !data || data.length === 0));

  const resolvedEmptyReason =
    unavailableReason ||
    emptyReason ||
    "No order timing data available";

  const containerRef = React.useRef<HTMLDivElement>(null);
  const chartRef = React.useRef<echarts.ECharts | null>(null);
  const idRef = React.useRef(
    `hour-weekday-heatmap-${Math.random().toString(36).slice(2, 9)}`,
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
    const unregister = registerChart(chartId, chart, () => undefined);

    const handleClick = (params: unknown) => {
      handleHourWeekdayCellClick(params, filters, onCellClick);
    };

    const handleOver = (params: any) => {
      let hour: number | null = null;
      if (Array.isArray(params?.value) && params.value.length >= 1) {
        hour = Number(params.value[0]);
      } else if (Array.isArray(params?.data) && params.data.length >= 1) {
        hour = Number(params.data[0]);
      }
      if (hour != null && Number.isFinite(hour) && hour >= 0 && hour <= 23) {
        try {
          const slot = hourToMealSlot(hour);
          emitHighlight(chartId, "meal_slot", slot);
        } catch {
          // ignore
        }
      }
    };

    const handleOut = () => emitClear(chartId);

    chart.on("click", handleClick);
    chart.on("mouseover", handleOver);
    chart.on("mouseout", handleOut);

    const ro = new ResizeObserver(() => {
      if (chart && !chart.isDisposed()) {
        chart.resize();
      }
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
  }, [chartId, filters, onCellClick]);

  React.useEffect(() => {
    const chart = chartRef.current;
    if (!chart || chart.isDisposed()) return;
    const theme = getCurrentChartTheme();
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const option = buildHourWeekdayHeatmapOption(data ?? [], {
      theme,
      reducedMotion: prefersReducedMotion,
    });
    chart.setOption(option, { notMerge: true, lazyUpdate: true });
  }, [data]);

  const infoPopover = (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Hour and weekday heatmap information"
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
          <p className="font-semibold text-foreground text-sm">Hour & Weekday Rhythm</p>
          <p className="text-muted-foreground mt-0.5 leading-relaxed">
            Order volume distribution across all 7 days of the week (Monday through Sunday) and 24 hours of the day (00:00 to 23:00).
          </p>
        </div>
        <div className="space-y-1.5 pt-1 border-t border-border/50">
          <p className="font-medium text-foreground">Color Intensity</p>
          <p className="text-muted-foreground leading-relaxed">
            Darker cells indicate higher order frequency during that specific day and hour window.
          </p>
        </div>
        <div className="space-y-1.5 pt-1 border-t border-border/50">
          <p className="font-medium text-foreground">Interactive Cross-Filtering</p>
          <p className="text-muted-foreground leading-relaxed">
            Clicking any cell applies the nearest supported filters: Day Type (weekday or weekend) and Meal Slot (breakfast, lunch, snack, dinner, or late night).
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );

  return (
    <ChartCard
      title={title}
      subtitle={subtitle}
      caption={caption ?? undefined}
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
      <div className="overflow-x-auto select-custom-scroll pb-2">
        <div className="min-w-[640px]">
          <div
            ref={containerRef}
            role="img"
            aria-label={title}
            className="cursor-pointer"
            style={{ height: 280, width: "100%" }}
          />
        </div>
      </div>
    </ChartCard>
  );
}

export default HourWeekdayHeatmapChart;
