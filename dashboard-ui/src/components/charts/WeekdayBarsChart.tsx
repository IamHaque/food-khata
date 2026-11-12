import * as React from "react";
import * as echarts from "echarts/core";
import { BarChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  AriaComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsCoreOption } from "echarts/core";
import { Info } from "lucide-react";

import { BaseChart, useOptionalFilters } from "@/components/dashboard/BaseChart";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  getCurrentChartTheme,
  buildBaseChartOption,
  resolveChartTheme,
  type ChartTheme,
} from "@/lib/chart-theme";
import {
  computeWeekdayTakeaway,
  formatRupees,
} from "@/lib/captions";

// Ensure ECharts modules are registered once
let registered = false;
function registerOnce() {
  if (registered) return;
  echarts.use([
    BarChart,
    GridComponent,
    TooltipComponent,
    LegendComponent,
    AriaComponent,
    CanvasRenderer,
  ]);
  registered = true;
}
registerOnce();

const WEEKDAY_SHORT_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const WEEKDAY_FULL_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export const WEEKDAY_LOOKUP: Record<string, number> = {
  mon: 0,
  monday: 0,
  tue: 1,
  tues: 1,
  tuesday: 1,
  wed: 2,
  wednesday: 2,
  thu: 3,
  thur: 3,
  thurs: 3,
  thursday: 3,
  fri: 4,
  friday: 4,
  sat: 5,
  saturday: 5,
  sun: 6,
  sunday: 6,
};

export type WeekdayMetricMode = "both" | "orders" | "spend";

export interface WeekdayBarDatum {
  key?: string | number | null;
  weekday?: number | string | null;
  day?: string | number | null;
  orders?: number | null;
  count?: number | null;
  spend?: number | null;
  amount?: number | null;
}

export interface NormalizedWeekdayBar {
  weekday: number; // 0..6
  dayShort: string; // 'Mon'..'Sun'
  dayName: string; // 'Monday'..'Sunday'
  dayType: "weekday" | "weekend";
  typeLabel: "Weekday" | "Weekend";
  orders: number;
  spend: number;
  aov: number;
}

export function normalizeWeekdayBars(
  data?: readonly WeekdayBarDatum[] | readonly NormalizedWeekdayBar[] | null,
): NormalizedWeekdayBar[] {
  const dayStats = Array.from({ length: 7 }, (_, i) => ({
    weekday: i,
    orders: 0,
    spend: 0,
  }));

  if (data) {
    for (const row of data) {
      if (!row) continue;
      let w: number | undefined;

      if (typeof (row as any).weekday === "number" && (row as any).weekday >= 0 && (row as any).weekday <= 6) {
        w = Math.floor((row as any).weekday);
      } else if (typeof (row as any).day === "string") {
        const lower = (row as any).day.trim().toLowerCase();
        if (lower in WEEKDAY_LOOKUP) {
          w = WEEKDAY_LOOKUP[lower];
        } else {
          const n = parseInt(lower, 10);
          if (Number.isFinite(n) && n >= 0 && n <= 6) w = n;
        }
      } else if (typeof (row as any).day === "number" && (row as any).day >= 0 && (row as any).day <= 6) {
        w = Math.floor((row as any).day);
      } else if ((row as any).key != null && (row as any).key !== "") {
        const keyStr = String((row as any).key).trim().toLowerCase();
        if (keyStr in WEEKDAY_LOOKUP) {
          w = WEEKDAY_LOOKUP[keyStr];
        } else {
          const keyNum = typeof (row as any).key === "number" ? (row as any).key : parseInt(keyStr, 10);
          if (Number.isFinite(keyNum)) {
            if (keyNum >= 0 && keyNum < 7) {
              w = keyNum;
            } else if (keyNum >= 7 && keyNum < 168) {
              w = Math.floor(keyNum / 24);
            }
          }
        }
      }

      if (w === undefined || w < 0 || w > 6) continue;

      const orders = Number(row.orders ?? (row as any).count ?? 0);
      const spend = Number(row.spend ?? (row as any).amount ?? 0);

      if (Number.isFinite(orders) && orders > 0) {
        dayStats[w].orders += orders;
      }
      if (Number.isFinite(spend) && spend > 0) {
        dayStats[w].spend += spend;
      }
    }
  }

  return dayStats.map((d, i) => {
    const isWeekend = i >= 5;
    const aov = d.orders > 0 ? Math.round(d.spend / d.orders) : 0;
    return {
      weekday: i,
      dayShort: WEEKDAY_SHORT_NAMES[i],
      dayName: WEEKDAY_FULL_NAMES[i],
      dayType: isWeekend ? "weekend" : "weekday",
      typeLabel: isWeekend ? "Weekend" : "Weekday",
      orders: d.orders,
      spend: d.spend,
      aov,
    };
  });
}

export function buildWeekdayTableRows(
  data?: readonly NormalizedWeekdayBar[] | readonly WeekdayBarDatum[] | null,
): {
  tableHeaders: string[];
  tableRows: Array<[string, string, number, string, string]>;
  tableData: Array<{
    Weekday: string;
    Type: string;
    Orders: number;
    Spend: string;
    AOV: string;
  }>;
} {
  const normalized =
    Array.isArray(data) && data.length === 7 && "typeLabel" in (data[0] ?? {})
      ? (data as NormalizedWeekdayBar[])
      : normalizeWeekdayBars(data);

  const tableHeaders = ["Weekday", "Type", "Orders", "Spend", "AOV"];
  const tableRows = normalized.map(
    (d) =>
      [
        d.dayName,
        d.typeLabel,
        d.orders,
        formatRupees(d.spend),
        formatRupees(d.aov),
      ] as [string, string, number, string, string],
  );
  const tableData = normalized.map((d) => ({
    Weekday: d.dayName,
    Type: d.typeLabel,
    Orders: d.orders,
    Spend: formatRupees(d.spend),
    AOV: formatRupees(d.aov),
  }));

  return { tableHeaders, tableRows, tableData };
}

export function handleWeekdayBarClick(
  params: unknown,
  filters: any,
  onBarClick?: (day: NormalizedWeekdayBar) => void,
  dataset?: readonly NormalizedWeekdayBar[],
): NormalizedWeekdayBar | null {
  const p = params as any;
  let dataIndex = -1;

  if (typeof p?.dataIndex === "number") {
    dataIndex = p.dataIndex;
  } else if (typeof p?.seriesData?.[0]?.dataIndex === "number") {
    dataIndex = p.seriesData[0].dataIndex;
  } else if (Array.isArray(p?.value) && typeof p.value[0] === "number") {
    dataIndex = p.value[0];
  } else if (typeof p?.name === "string") {
    const lower = p.name.trim().toLowerCase();
    if (lower in WEEKDAY_LOOKUP) {
      dataIndex = WEEKDAY_LOOKUP[lower];
    }
  }

  if (dataIndex < 0 || dataIndex > 6) return null;

  const normalized = dataset ?? normalizeWeekdayBars();
  const day = normalized[dataIndex];
  if (!day) return null;

  if (filters?.applyCrossFilter) {
    filters.applyCrossFilter("weekday", day.dayShort);
  } else if (filters?.update) {
    const current = filters.filters?.day_type ?? "all";
    filters.update({
      day_type: current === day.dayType ? "all" : day.dayType,
    });
  }

  onBarClick?.(day);
  return day;
}

export interface BuildWeekdayBarsOptionOptions {
  theme?: ChartTheme;
  activeDayType?: "all" | "weekday" | "weekend";
  metricMode?: WeekdayMetricMode;
  reducedMotion?: boolean;
}

export function buildWeekdayBarsOption(
  data: readonly NormalizedWeekdayBar[] | readonly WeekdayBarDatum[] | null | undefined,
  themeOrOpts?: ChartTheme | BuildWeekdayBarsOptionOptions,
  activeDayTypeArg?: "all" | "weekday" | "weekend",
  metricModeArg?: WeekdayMetricMode,
  reducedMotionArg?: boolean,
): EChartsCoreOption {
  let theme: ChartTheme | undefined;
  let activeDayType: "all" | "weekday" | "weekend" = "all";
  let metricMode: WeekdayMetricMode = "both";
  let reducedMotion = false;

  if (themeOrOpts) {
    if ("colors" in themeOrOpts || "mode" in themeOrOpts) {
      theme = themeOrOpts as ChartTheme;
      if (activeDayTypeArg) activeDayType = activeDayTypeArg;
      if (metricModeArg) metricMode = metricModeArg;
      if (typeof reducedMotionArg === "boolean") reducedMotion = reducedMotionArg;
    } else {
      const opts = themeOrOpts as BuildWeekdayBarsOptionOptions;
      if (opts.theme) theme = opts.theme;
      if (opts.activeDayType) activeDayType = opts.activeDayType;
      if (opts.metricMode) metricMode = opts.metricMode;
      if (typeof opts.reducedMotion === "boolean") reducedMotion = opts.reducedMotion;
    }
  }

  if (!theme) {
    theme =
      typeof document === "undefined"
        ? resolveChartTheme("light", "emerald")
        : getCurrentChartTheme();
  }

  const normalized =
    Array.isArray(data) && data.length === 7 && "typeLabel" in (data[0] ?? {})
      ? (data as NormalizedWeekdayBar[])
      : normalizeWeekdayBars(data);

  const base = buildBaseChartOption(theme, reducedMotion);

  // Distinct colors and decal pattern for weekend distinction (CC-2, CC-3, CC-8, CC-12)
  const ordersWeekdayColor = theme.colors[0];
  const ordersWeekendColor = theme.colors[1];
  const spendWeekdayColor = theme.colors[2] || theme.colors[0];
  const spendWeekendColor = theme.colors[3] || theme.colors[1];

  const weekendDecal = {
    symbol: "line",
    rotation: Math.PI / 4,
  };
  const weekdayDecal = "none";

  const getOpacity = (isWeekend: boolean) => {
    if (activeDayType === "weekday") return isWeekend ? 0.35 : 1;
    if (activeDayType === "weekend") return isWeekend ? 1 : 0.35;
    return 1;
  };

  const showOrders = metricMode === "both" || metricMode === "orders";
  const showSpend = metricMode === "both" || metricMode === "spend";

  // Build Y-axis / Y-axes
  const yAxis: any[] = [];
  if (metricMode === "both") {
    // Left axis: Orders
    yAxis.push({
      type: "value",
      name: "Orders",
      nameTextStyle: { color: theme.mutedColor, fontSize: 11 },
      minInterval: 1,
      splitLine: {
        show: true,
        lineStyle: { color: theme.splitLine, width: 0.5 },
      },
      axisLine: { lineStyle: { color: theme.axisLine } },
      axisLabel: { color: theme.mutedColor, fontSize: 10 },
    });
    // Right axis: Spend
    yAxis.push({
      type: "value",
      name: "Spend",
      nameTextStyle: { color: theme.mutedColor, fontSize: 11 },
      splitLine: { show: false },
      axisLine: { lineStyle: { color: theme.axisLine } },
      axisLabel: {
        color: theme.mutedColor,
        fontSize: 11,
        formatter: (v: number) => formatRupees(v),
      },
    });
  } else if (metricMode === "orders") {
    yAxis.push({
      type: "value",
      name: "Orders",
      nameTextStyle: { color: theme.mutedColor, fontSize: 11 },
      minInterval: 1,
      splitLine: {
        show: true,
        lineStyle: { color: theme.splitLine, width: 0.5 },
      },
      axisLine: { lineStyle: { color: theme.axisLine } },
      axisLabel: { color: theme.mutedColor, fontSize: 10 },
    });
  } else {
    // metricMode === "spend"
    yAxis.push({
      type: "value",
      name: "Spend",
      nameTextStyle: { color: theme.mutedColor, fontSize: 11 },
      splitLine: {
        show: true,
        lineStyle: { color: theme.splitLine, width: 0.5 },
      },
      axisLine: { lineStyle: { color: theme.axisLine } },
      axisLabel: {
        color: theme.mutedColor,
        fontSize: 11,
        formatter: (v: number) => formatRupees(v),
      },
    });
  }

  // Build Series
  const series: any[] = [];

  if (showOrders) {
    series.push({
      name: "Orders",
      type: "bar",
      yAxisIndex: 0,
      barMaxWidth: metricMode === "both" ? 22 : 36,
      itemStyle: {
        borderRadius: [4, 4, 0, 0],
      },
      emphasis: {
        itemStyle: {
          shadowBlur: 6,
          shadowColor: theme.textColor,
        },
      },
      data: normalized.map((d) => {
        const isWeekend = d.dayType === "weekend";
        return {
          name: d.dayShort,
          value: d.orders,
          itemStyle: {
            color: isWeekend ? ordersWeekendColor : ordersWeekdayColor,
            opacity: getOpacity(isWeekend),
            decal: isWeekend ? weekendDecal : weekdayDecal,
            borderRadius: [4, 4, 0, 0],
          },
        };
      }),
    });
  }

  if (showSpend) {
    series.push({
      name: "Spend",
      type: "bar",
      yAxisIndex: metricMode === "both" ? 1 : 0,
      barMaxWidth: metricMode === "both" ? 22 : 36,
      itemStyle: {
        borderRadius: [4, 4, 0, 0],
      },
      emphasis: {
        itemStyle: {
          shadowBlur: 6,
          shadowColor: theme.textColor,
        },
      },
      data: normalized.map((d) => {
        const isWeekend = d.dayType === "weekend";
        return {
          name: d.dayShort,
          value: d.spend,
          itemStyle: {
            color: isWeekend ? spendWeekendColor : spendWeekdayColor,
            opacity: getOpacity(isWeekend),
            decal: isWeekend ? weekendDecal : weekdayDecal,
            borderRadius: [4, 4, 0, 0],
          },
        };
      }),
    });
  }

  const option: EChartsCoreOption = {
    ...base,
    aria: {
      enabled: true,
      decal: { show: false }, // disable default automatic global decal so itemStyle decal on weekend bars takes precedence
    },
    tooltip: {
      ...(base.tooltip as object),
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (params: unknown) => {
        let dayIdx = 0;
        if (Array.isArray(params) && params.length > 0) {
          dayIdx = Number(params[0].dataIndex ?? 0);
        } else if (params && typeof params === "object") {
          dayIdx = Number((params as any).dataIndex ?? 0);
        }
        const d = normalized[dayIdx];
        if (!d) return "";

        const ordersFormatted = `${d.orders.toLocaleString("en-IN")} ${
          d.orders === 1 ? "order" : "orders"
        }`;
        const spendFormatted = formatRupees(d.spend);
        const aovFormatted = formatRupees(d.aov);

        return [
          `<div class="font-bold text-xs mb-1.5">${d.dayName} (${d.typeLabel})</div>`,
          `<div class="flex justify-between gap-4 text-xs"><span>Orders:</span> <strong>${ordersFormatted}</strong></div>`,
          `<div class="flex justify-between gap-4 text-xs"><span>Spend:</span> <strong>${spendFormatted}</strong></div>`,
          `<div class="flex justify-between gap-4 text-xs"><span>AOV:</span> <strong>${aovFormatted}</strong></div>`,
        ].join("");
      },
    },
    legend: {
      show: true,
      top: 0,
      right: 15,
      textStyle: { color: theme.mutedColor, fontSize: 11 },
      data: series.map((s) => s.name),
    },
    grid: {
      top: 35,
      right: metricMode === "both" ? 50 : 20,
      bottom: 25,
      left: 45,
      containLabel: true,
    },
    xAxis: {
      type: "category",
      data: [...WEEKDAY_SHORT_NAMES],
      splitArea: { show: false },
      splitLine: { show: false },
      axisLine: { lineStyle: { color: theme.axisLine } },
      axisTick: { alignWithLabel: true },
      axisLabel: {
        color: theme.mutedColor,
        fontSize: 11,
      },
    },
    yAxis: yAxis.length === 1 ? yAxis[0] : yAxis,
    series,
  };

  return option;
}


export interface WeekdayBarsChartProps {
  data?: readonly WeekdayBarDatum[] | readonly NormalizedWeekdayBar[] | null;
  hour_weekday?: readonly WeekdayBarDatum[] | null;
  day_type?: readonly { key: string; orders: number; spend: number }[] | null;
  date_unavailable_reason?: string | null;
  dateUnavailableReason?: string | null;
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
  onBarClick?: (day: NormalizedWeekdayBar) => void;
  showTable?: boolean;
  onShowTableChange?: (value: boolean) => void;
  fullscreen?: boolean;
  onFullscreenChange?: (value: boolean) => void;
  initialMetric?: WeekdayMetricMode;
}

export function WeekdayBarsChart({
  data: dataProp,
  hour_weekday,
  day_type: _day_type,
  date_unavailable_reason,
  dateUnavailableReason: dateUnavailableProp,
  timing_unavailable_reason,
  timingUnavailableReason: timingUnavailableProp,
  title = "Weekday breakdown",
  subtitle = "Distribution across days with weekend pattern distinction",
  isLoading,
  isEmpty,
  emptyReason,
  error,
  onRetry,
  className,
  onBarClick,
  showTable,
  onShowTableChange,
  fullscreen,
  onFullscreenChange,
  initialMetric = "both",
}: WeekdayBarsChartProps) {
  const data = dataProp ?? hour_weekday;
  const unavailableReason =
    dateUnavailableProp ??
    date_unavailable_reason ??
    timingUnavailableProp ??
    timing_unavailable_reason ??
    null;

  const filters = useOptionalFilters();
  const activeDayType = filters?.filters?.day_type ?? "all";

  const [metricMode, setMetricMode] = React.useState<WeekdayMetricMode>(initialMetric);

  const normalized = React.useMemo(() => normalizeWeekdayBars(data), [data]);
  const totalOrders = React.useMemo(
    () => normalized.reduce((acc, c) => acc + c.orders, 0),
    [normalized],
  );

  const { tableHeaders, tableRows, tableData } = React.useMemo(
    () => buildWeekdayTableRows(normalized),
    [normalized],
  );

  const caption = React.useMemo(() => computeWeekdayTakeaway(normalized), [normalized]);

  const empty =
    isEmpty ||
    Boolean(unavailableReason) ||
    (!isLoading && !error && (totalOrders === 0 || !data || (Array.isArray(data) && data.length === 0)));

  const resolvedEmptyReason =
    unavailableReason ||
    emptyReason ||
    "No weekday order data available";

  const infoPopover = (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Weekday breakdown information"
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
          <p className="font-semibold text-foreground text-sm">Weekday Breakdown</p>
          <p className="text-muted-foreground mt-0.5 leading-relaxed">
            Order volume and spend distributed across the 7 days of the week (Monday through Sunday).
          </p>
        </div>
        <div className="space-y-1.5 pt-1 border-t border-border/50">
          <p className="font-medium text-foreground">Weekend Distinction</p>
          <p className="text-muted-foreground leading-relaxed">
            Saturday and Sunday bars are visually distinguished using both diagonal stripe patterns (decal) and distinct color tokens.
          </p>
        </div>
        <div className="space-y-1.5 pt-1 border-t border-border/50">
          <p className="font-medium text-foreground">Interactive Cross-Filtering</p>
          <p className="text-muted-foreground leading-relaxed">
            Clicking Monday–Friday toggles the Weekday filter. Clicking Saturday or Sunday toggles the Weekend filter.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );

  return (
    <BaseChart
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
      chartHeight={280}
      headerControls={
        <div className="flex items-center justify-between pb-2 w-full">
          <div className="text-xs text-muted-foreground">
            {activeDayType !== "all" && (
              <span className="inline-flex items-center gap-1 font-medium text-foreground bg-muted/60 px-2 py-0.5 rounded">
                Filtered: {activeDayType === "weekend" ? "Weekends only" : "Weekdays only"}
              </span>
            )}
          </div>
          <SegmentedControl
            value={metricMode}
            onChange={(val) => setMetricMode(val as WeekdayMetricMode)}
            options={[
              { value: "both", label: "Both" },
              { value: "orders", label: "Orders" },
              { value: "spend", label: "Spend" },
            ]}
          />
        </div>
      }
      data={normalized}
      spec={(currentNormalized, theme, { prefersReducedMotion }) =>
        buildWeekdayBarsOption(currentNormalized, {
          theme,
          activeDayType,
          metricMode,
          reducedMotion: prefersReducedMotion,
        })
      }
      onClick={(params) => {
        handleWeekdayBarClick(params, filters, onBarClick, normalized);
      }}
      highlightDimension="weekday"
      getHighlightValue={(params) => {
        const dayIdx = Number(params?.dataIndex ?? -1);
        if (dayIdx >= 0 && dayIdx < WEEKDAY_SHORT_NAMES.length) {
          return WEEKDAY_SHORT_NAMES[dayIdx];
        }
        return undefined;
      }}
      registerModules={registerOnce}
      ariaLabel={title}
    />
  );
}

export default WeekdayBarsChart;
