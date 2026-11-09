import * as React from "react";
import * as echarts from "echarts/core";
import { HeatmapChart } from "echarts/charts";
import {
  CalendarComponent,
  TooltipComponent,
  VisualMapComponent,
  AriaComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsCoreOption } from "echarts/core";

import { BaseChart, useOptionalFilters } from "@/components/dashboard/BaseChart";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  getCurrentChartTheme,
  buildBaseChartOption,
  resolveChartTheme,
  type ChartTheme,
} from "@/lib/chart-theme";

// Ensure ECharts modules registered once
let registered = false;
function registerOnce() {
  if (registered) return;
  echarts.use([
    HeatmapChart,
    CalendarComponent,
    TooltipComponent,
    VisualMapComponent,
    AriaComponent,
    CanvasRenderer,
  ]);
  registered = true;
}
registerOnce();

export interface CalendarHeatmapDatum {
  date?: string | null;
  orders?: number;
  spend?: number;
  count?: number;
  amount?: number;
}

export interface BuildCalendarHeatmapOptionInput {
  year?: string | number;
  theme?: ChartTheme;
  reducedMotion?: boolean;
}

export function normalizeCalendarRows(
  data: readonly CalendarHeatmapDatum[] | null | undefined,
): Array<{ date: string; orders: number; spend: number }> {
  const rows = data ?? [];
  return rows
    .filter((r): r is CalendarHeatmapDatum & { date: string } => Boolean(r && r.date))
    .map((r) => ({
      date: String(r.date),
      orders: Number(r.orders ?? r.count ?? 0),
      spend: Number(r.spend ?? r.amount ?? 0),
    }));
}

export function extractAvailableYears(
  data: readonly CalendarHeatmapDatum[] | null | undefined,
): string[] {
  const set = new Set<string>();
  if (data) {
    for (const r of data) {
      if (r?.date) {
        const match = /^(\d{4})/.exec(String(r.date));
        if (match) {
          set.add(match[1]);
        }
      }
    }
  }
  const sorted = Array.from(set).sort();
  if (sorted.length === 0) {
    return [String(new Date().getFullYear())];
  }
  return sorted;
}

export function computeCalendarTakeaway(
  data: readonly CalendarHeatmapDatum[] | null | undefined,
  year?: string,
): string | null {
  const rows = normalizeCalendarRows(data);
  const filtered = year ? rows.filter((r) => r.date.startsWith(year)) : rows;
  if (filtered.length === 0) return null;

  let busiestDay: { date: string; orders: number; spend: number } | null = null;
  let totalOrders = 0;
  for (const r of filtered) {
    totalOrders += r.orders;
    if (r.orders > 0 && (!busiestDay || r.orders > busiestDay.orders)) {
      busiestDay = r;
    }
  }

  if (!busiestDay || totalOrders === 0) return null;
  const yearSuffix = year ? ` in ${year}` : "";
  return `Busiest day${yearSuffix} was ${busiestDay.date} with ${busiestDay.orders} ${busiestDay.orders === 1 ? "order" : "orders"}`;
}

export function handleDayClick(
  params: unknown,
  filters: { update: (patch: { date_from: string; date_to: string }) => void } | null | undefined,
  onDayClick?: (date: string) => void,
): string | null {
  const p = params as {
    value?: unknown;
    data?: unknown;
    date?: unknown;
    name?: unknown;
  } | null;

  let dateStr: string | null = null;
  if (Array.isArray(p?.value) && typeof p.value[0] === "string") {
    dateStr = p.value[0];
  } else if (Array.isArray(p?.data) && typeof p.data[0] === "string") {
    dateStr = p.data[0];
  } else if (typeof p?.date === "string") {
    dateStr = p.date;
  } else if (typeof p?.value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.value)) {
    dateStr = p.value;
  } else if (typeof p?.name === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.name)) {
    dateStr = p.name;
  }

  if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    if (filters) {
      filters.update({ date_from: dateStr, date_to: dateStr });
    }
    onDayClick?.(dateStr);
    return dateStr;
  }

  return null;
}


export function buildCalendarHeatmapOption(
  data: readonly CalendarHeatmapDatum[] | null | undefined,
  yearOrOpts?: string | number | BuildCalendarHeatmapOptionInput,
  themeArg?: ChartTheme,
): EChartsCoreOption {
  let year: string | undefined;
  let theme = themeArg;
  let reducedMotion = false;

  if (typeof yearOrOpts === "string" || typeof yearOrOpts === "number") {
    year = String(yearOrOpts);
  } else if (yearOrOpts && typeof yearOrOpts === "object") {
    if (yearOrOpts.year != null) year = String(yearOrOpts.year);
    if (yearOrOpts.theme) theme = yearOrOpts.theme;
    if (typeof yearOrOpts.reducedMotion === "boolean") reducedMotion = yearOrOpts.reducedMotion;
  }

  if (!theme) {
    theme = typeof document === "undefined"
      ? resolveChartTheme("light", "emerald")
      : getCurrentChartTheme();
  }

  const allRows = normalizeCalendarRows(data);
  if (!year) {
    const years = extractAvailableYears(data);
    year = years[years.length - 1];
  }

  const yearRows = allRows.filter((r) => r.date.startsWith(year));
  const maxOrders = Math.max(1, ...yearRows.map((r) => r.orders));

  const dateMap = new Map<string, { date: string; orders: number; spend: number }>();
  for (const r of yearRows) {
    dateMap.set(r.date, r);
  }

  const seriesData = yearRows.map((r) => [r.date, r.orders, r.spend]);

  const base = buildBaseChartOption(theme, reducedMotion);

  const baseColor = theme["chart-1"] || theme.colors[0];
  const inRangeColors = [
    baseColor + "33",
    baseColor + "66",
    baseColor + "99",
    baseColor,
  ];

  const option: EChartsCoreOption = {
    ...base,
    tooltip: {
      ...(base.tooltip as object),
      trigger: "item",
      formatter: (params: unknown) => {
        const p = params as {
          value?: unknown;
          data?: unknown;
          name?: string;
        };
        let dateStr = "";
        let orders = 0;
        let spend = 0;

        if (Array.isArray(p?.value)) {
          dateStr = String(p.value[0] ?? "");
          orders = Number(p.value[1] ?? 0);
          spend = Number(p.value[2] ?? 0);
        } else if (Array.isArray(p?.data)) {
          dateStr = String(p.data[0] ?? "");
          orders = Number(p.data[1] ?? 0);
          spend = Number(p.data[2] ?? 0);
        } else if (p?.name) {
          dateStr = String(p.name);
        }

        if (dateStr && dateMap.has(dateStr)) {
          const item = dateMap.get(dateStr)!;
          orders = item.orders;
          spend = item.spend;
        }

        if (!dateStr) return "";

        const formattedOrders = `${Number(orders).toLocaleString("en-IN")} ${Number(orders) === 1 ? "order" : "orders"}`;
        const formattedSpend = `₹${Number(spend).toLocaleString("en-IN")}`;

        return [
          `<div class="font-bold text-xs mb-1">${dateStr}</div>`,
          `<div class="flex justify-between gap-3 text-xs"><span>Orders:</span> <strong>${formattedOrders}</strong></div>`,
          `<div class="flex justify-between gap-3 text-xs"><span>Spend:</span> <strong>${formattedSpend}</strong></div>`,
        ].join("");
      },
    },
    calendar: {
      top: 35,
      left: 45,
      right: 25,
      bottom: 45,
      cellSize: ["auto", 16],
      range: year,
      itemStyle: {
        borderWidth: 1,
        borderColor: theme.border,
      },
      splitLine: {
        show: true,
        lineStyle: {
          color: theme.splitLine,
          width: 1,
          type: "solid",
        },
      },
      yearLabel: { show: false },
      dayLabel: {
        firstDay: 1,
        nameMap: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
        color: theme.mutedColor,
        fontSize: 10,
      },
      monthLabel: {
        nameMap: "en",
        color: theme.mutedColor,
        fontSize: 10,
      },
    },
    visualMap: {
      min: 1,
      max: maxOrders,
      type: "continuous",
      calculable: false,
      orient: "horizontal",
      left: "center",
      bottom: 0,
      dimension: 1,
      text: ["More", "Less"],
      inRange: {
        color: inRangeColors,
      },
      outOfRange: {
        color: ["transparent"],
      },
      textStyle: {
        color: theme.mutedColor,
        fontSize: 10,
      },
    },
    series: [
      {
        type: "heatmap",
        coordinateSystem: "calendar",
        data: seriesData,
      },
    ],
  };

  return option;
}

export const buildCalendarOption = buildCalendarHeatmapOption;
export const buildOption = buildCalendarHeatmapOption;

export interface CalendarHeatmapChartProps {
  data?: readonly CalendarHeatmapDatum[] | null;
  title?: string;
  subtitle?: string;
  year?: string;
  onYearChange?: (year: string) => void;
  onDayClick?: (date: string) => void;
  yearSelectorVariant?: "dropdown" | "segmented";
  isLoading?: boolean;
  isEmpty?: boolean;
  emptyReason?: string;
  error?: Error | string | null;
  onRetry?: () => void;
  className?: string;
}

export function CalendarHeatmapChart({
  data,
  title = "Daily order activity",
  subtitle = "GitHub-style calendar showing orders per day",
  year: yearProp,
  onYearChange,
  onDayClick,
  yearSelectorVariant = "dropdown",
  isLoading,
  isEmpty,
  emptyReason,
  error,
  onRetry,
  className,
}: CalendarHeatmapChartProps) {
  const filters = useOptionalFilters();
  const availableYears = React.useMemo(() => extractAvailableYears(data), [data]);
  const [internalYear, setInternalYear] = React.useState<string>("");

  React.useEffect(() => {
    if (yearProp) {
      setInternalYear(yearProp);
    }
  }, [yearProp]);

  const selectedYear =
    yearProp ??
    (availableYears.includes(internalYear)
      ? internalYear
      : availableYears[availableYears.length - 1]);

  const handleYearChange = (newYear: string) => {
    setInternalYear(newYear);
    onYearChange?.(newYear);
  };

  const allRows = React.useMemo(() => normalizeCalendarRows(data), [data]);
  const yearRows = React.useMemo(
    () => allRows.filter((r) => r.date.startsWith(selectedYear)),
    [allRows, selectedYear],
  );

  const tableData = React.useMemo(
    () =>
      yearRows.map((r) => ({
        Date: r.date,
        Orders: r.orders,
        Spend: r.spend,
      })),
    [yearRows],
  );

  const caption = computeCalendarTakeaway(data, selectedYear);
  const empty = isEmpty || (allRows.length === 0 && !isLoading && !error);

  const handleClick = React.useCallback(
    (params: unknown) => {
      handleDayClick(params, filters, onDayClick);
    },
    [filters, onDayClick]
  );

  const handleHover = React.useCallback((params: any) => {
    let dateStr: string | null = null;
    if (Array.isArray(params?.value)) dateStr = String(params.value[0]);
    else if (params?.name) dateStr = String(params.name);
    if (dateStr && dateStr.length >= 7) {
      return dateStr.slice(0, 7);
    }
    return undefined;
  }, []);

  return (
    <BaseChart
      title={title}
      subtitle={subtitle}
      caption={caption ?? undefined}
      isLoading={isLoading}
      isEmpty={empty}
      emptyReason={emptyReason}
      error={error}
      onRetry={onRetry}
      tableData={tableData}
      className={className}
      data={{ data, selectedYear }}
      spec={(_d, theme, { prefersReducedMotion }) =>
        buildCalendarHeatmapOption(data ?? [], {
          year: selectedYear,
          theme,
          reducedMotion: prefersReducedMotion,
        })
      }
      onClick={handleClick}
      highlightDimension="month"
      getHighlightValue={handleHover}
      chartHeight={210}
      chartWrapper={(chartNode) => (
        <div className="overflow-x-auto select-custom-scroll pb-2">
          <div className="min-w-[750px]">{chartNode}</div>
        </div>
      )}
      registerModules={registerOnce}
      ariaLabel={title}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        {yearSelectorVariant === "segmented" ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-medium">Year:</span>
            <SegmentedControl
              options={availableYears.map((y) => ({ value: y, label: y }))}
              value={selectedYear}
              onChange={handleYearChange}
            />
          </div>
        ) : (
          <label className="flex items-center gap-2 text-xs font-medium text-foreground">
            <span className="text-muted-foreground">Year:</span>
            <select
              aria-label="Calendar year"
              value={selectedYear}
              onChange={(e) => handleYearChange(e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2.5 text-xs font-medium shadow-xs focus:ring-1 focus:ring-ring text-foreground cursor-pointer"
            >
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
    </BaseChart>
  );
}

export default CalendarHeatmapChart;
