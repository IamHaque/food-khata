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
import { Info } from "lucide-react";

import { BaseChart, useOptionalFilters } from "@/components/dashboard/BaseChart";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  getCurrentChartTheme,
  buildBaseChartOption,
  resolveChartTheme,
  type ChartTheme,
  sequentialRamp,
} from "@/lib/chart-theme";
import {
  computeDailySpendTakeaway,
  formatRupees,
  type DailySpendDatumLike,
} from "@/lib/captions";

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

export interface DailySpendRow {
  date: string;
  spend: number;
  orders: number;
  cumulative?: number;
  rolling_30?: number;
}

export interface BuildDailySpendCalendarOptionInput {
  data?: readonly (DailySpendDatumLike | DailySpendRow)[] | null;
  calendar?: readonly (DailySpendDatumLike | DailySpendRow)[] | null;
  year?: string | number;
  theme?: ChartTheme;
  reducedMotion?: boolean;
}

export function mergeDailySpendData(
  dailyData?: readonly (DailySpendDatumLike | null | undefined)[] | null,
  calendarData?: readonly (DailySpendDatumLike | null | undefined)[] | null,
): DailySpendRow[] {
  const map = new Map<string, DailySpendRow>();

  if (dailyData) {
    for (const d of dailyData) {
      if (!d || !d.date) continue;
      const dateStr = String(d.date).trim();
      if (!/^\d{4}-\d{2}-\d{2}/.test(dateStr)) continue;
      const normalizedDate = dateStr.slice(0, 10);
      const spend = Number(d.spend ?? d.amount ?? 0);
      const orders = Number(d.orders ?? 0);
      map.set(normalizedDate, {
        date: normalizedDate,
        spend: Number.isFinite(spend) ? spend : 0,
        orders: Number.isFinite(orders) ? orders : 0,
        cumulative: d.cumulative != null ? Number(d.cumulative) : undefined,
        rolling_30: d.rolling_30 != null ? Number(d.rolling_30) : undefined,
      });
    }
  }

  if (calendarData) {
    for (const c of calendarData) {
      if (!c || !c.date) continue;
      const dateStr = String(c.date).trim();
      if (!/^\d{4}-\d{2}-\d{2}/.test(dateStr)) continue;
      const normalizedDate = dateStr.slice(0, 10);
      const existing = map.get(normalizedDate);
      const cOrders = Number(c.orders ?? 0);
      const cSpend = Number(c.spend ?? c.amount ?? 0);

      if (existing) {
        if (existing.orders === 0 && Number.isFinite(cOrders) && cOrders > 0) {
          existing.orders = cOrders;
        }
        if (existing.spend === 0 && Number.isFinite(cSpend) && cSpend > 0) {
          existing.spend = cSpend;
        }
      } else {
        map.set(normalizedDate, {
          date: normalizedDate,
          spend: Number.isFinite(cSpend) ? cSpend : 0,
          orders: Number.isFinite(cOrders) ? cOrders : 0,
        });
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export function extractDailySpendAvailableYears(
  rows: readonly { date?: string | null }[] | null | undefined,
): string[] {
  const set = new Set<string>();
  if (rows) {
    for (const r of rows) {
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

export function handleDailySpendDayClick(
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

export function buildDailySpendCalendarOption(
  inputOrData?:
    | BuildDailySpendCalendarOptionInput
    | readonly (DailySpendDatumLike | DailySpendRow)[]
    | null,
  yearOrOpts?:
    | string
    | number
    | { year?: string | number; theme?: ChartTheme; reducedMotion?: boolean },
  themeArg?: ChartTheme,
): EChartsCoreOption {
  let dailyData: readonly DailySpendDatumLike[] | undefined;
  let calendarData: readonly DailySpendDatumLike[] | undefined;
  let year: string | undefined;
  let theme = themeArg;
  let reducedMotion = false;

  if (
    inputOrData &&
    typeof inputOrData === "object" &&
    !Array.isArray(inputOrData)
  ) {
    const input = inputOrData as BuildDailySpendCalendarOptionInput;
    dailyData = input.data ?? undefined;
    calendarData = input.calendar ?? undefined;
    if (input.year != null) year = String(input.year);
    if (input.theme) theme = input.theme;
    if (typeof input.reducedMotion === "boolean") reducedMotion = input.reducedMotion;
  } else if (Array.isArray(inputOrData)) {
    dailyData = inputOrData;
    if (typeof yearOrOpts === "string" || typeof yearOrOpts === "number") {
      year = String(yearOrOpts);
    } else if (yearOrOpts && typeof yearOrOpts === "object") {
      if (yearOrOpts.year != null) year = String(yearOrOpts.year);
      if (yearOrOpts.theme) theme = yearOrOpts.theme;
      if (typeof yearOrOpts.reducedMotion === "boolean") reducedMotion = yearOrOpts.reducedMotion;
    }
  }

  if (!theme) {
    theme = typeof document === "undefined"
      ? resolveChartTheme("light", "emerald")
      : getCurrentChartTheme();
  }

  const allRows = mergeDailySpendData(dailyData, calendarData);

  if (!year) {
    const years = extractDailySpendAvailableYears(allRows);
    year = years[years.length - 1];
  }

  const yearRows = allRows.filter((r) => r.date.startsWith(year));
  const maxSpend = Math.max(1, ...yearRows.map((r) => r.spend));

  const dateMap = new Map<string, DailySpendRow>();
  for (const r of yearRows) {
    dateMap.set(r.date, r);
  }

  const seriesData = yearRows.map((r) => [r.date, r.spend, r.orders]);

  const base = buildBaseChartOption(theme, reducedMotion);

  const inRangeColors = sequentialRamp(theme, 5);

  const option: EChartsCoreOption = {
    ...base,
    animation: !reducedMotion,
    animationDuration: reducedMotion ? 0 : 600,
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
        let spend = 0;
        let orders = 0;

        if (Array.isArray(p?.value)) {
          dateStr = String(p.value[0] ?? "");
          spend = Number(p.value[1] ?? 0);
          orders = Number(p.value[2] ?? 0);
        } else if (Array.isArray(p?.data)) {
          dateStr = String(p.data[0] ?? "");
          spend = Number(p.data[1] ?? 0);
          orders = Number(p.data[2] ?? 0);
        } else if (p?.name) {
          dateStr = String(p.name);
        }

        if (dateStr && dateMap.has(dateStr)) {
          const item = dateMap.get(dateStr)!;
          spend = item.spend;
          orders = item.orders;
        }

        if (!dateStr) return "";

        const formattedSpend = formatRupees(spend);
        const formattedOrders = `${Number(orders).toLocaleString("en-IN")} ${Number(orders) === 1 ? "order" : "orders"}`;

        return [
          `<div class="font-bold text-xs mb-1">${dateStr}</div>`,
          `<div class="flex justify-between gap-3 text-xs"><span>Spend:</span> <strong>${formattedSpend}</strong></div>`,
          `<div class="flex justify-between gap-3 text-xs"><span>Orders:</span> <strong>${formattedOrders}</strong></div>`,
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
        color: theme.surface, // days without orders: the card colour, not ECharts' default white
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
        fontSize: 11,
      },
      monthLabel: {
        nameMap: "en",
        color: theme.mutedColor,
        fontSize: 11,
      },
    },
    visualMap: {
      min: 0,
      max: maxSpend,
      type: "continuous",
      calculable: false,
      orient: "horizontal",
      left: "center",
      bottom: 0,
      dimension: 1,
      text: ["High", "₹0"],
      inRange: {
        color: inRangeColors,
      },
      textStyle: {
        color: theme.mutedColor,
        fontSize: 11,
      },
      formatter: (val: number) => formatRupees(Math.round(val)),
    },
    series: [
      {
        name: "Daily spend",
        type: "heatmap",
        coordinateSystem: "calendar",
        data: seriesData,
      },
    ],
  };

  return option;
}


export interface DailySpendCalendarChartProps {
  data?: readonly DailySpendDatumLike[] | null;
  calendar?: readonly DailySpendDatumLike[] | null;
  unallocatedSpend?: number | null;
  title?: string;
  subtitle?: string;
  caption?: string;
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
  showTable?: boolean;
  onShowTableChange?: (show: boolean) => void;
  fullscreen?: boolean;
  onFullscreenChange?: (fullscreen: boolean) => void;
}

export function DailySpendCalendarChart({
  data,
  calendar,
  unallocatedSpend,
  title = "Daily spend calendar",
  subtitle = "Daily expenditure heatmap across active calendar dates",
  caption: captionProp,
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
  showTable,
  onShowTableChange,
  fullscreen,
  onFullscreenChange,
}: DailySpendCalendarChartProps) {
  const filters = useOptionalFilters();
  const allRows = React.useMemo(() => mergeDailySpendData(data, calendar), [data, calendar]);
  const availableYears = React.useMemo(() => extractDailySpendAvailableYears(allRows), [allRows]);
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

  const yearRows = React.useMemo(
    () => allRows.filter((r) => r.date.startsWith(selectedYear)),
    [allRows, selectedYear],
  );

  const tableData = React.useMemo(
    () =>
      yearRows.map((r) => ({
        Date: r.date,
        Spend: r.spend,
        Orders: r.orders,
      })),
    [yearRows],
  );

  const effectiveCaption =
    captionProp !== undefined
      ? captionProp
      : computeDailySpendTakeaway(allRows, selectedYear);

  const empty = isEmpty || (allRows.length === 0 && !isLoading && !error);

  const handleClick = React.useCallback(
    (params: unknown) => {
      handleDailySpendDayClick(
        params,
        filters,
        onDayClick,
      );
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

  const infoPopover = (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Daily spend calendar information"
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
            Daily Spend Calendar
          </p>
          <p className="text-muted-foreground mt-0.5 leading-relaxed">
            Daily expenditure heatmap across active calendar dates.
          </p>
        </div>
        <div className="space-y-1.5 text-muted-foreground leading-relaxed">
          <p>
            <strong className="text-foreground">Daily Spend Heatmap:</strong>{" "}
            Displays daily expenditure across calendar dates, with cell color intensity proportional to the amount spent.
          </p>
          <p>
            <strong className="text-foreground">Year Navigator:</strong>{" "}
            Switch between calendar years using the year selector to view daily trends across different timeframes.
          </p>
          <p>
            <strong className="text-foreground">Day Filter:</strong>{" "}
            Clicking a date cell sets the active filter range to that date.
          </p>
          <p>
            <strong className="text-foreground">Unallocated Spend:</strong>{" "}
            Orders without a parseable or recorded date are excluded from the calendar heatmap and accounted for in the unallocated spend total below.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );

  return (
    <BaseChart
      title={title}
      subtitle={subtitle}
      caption={effectiveCaption ?? undefined}
      infoPopover={infoPopover}
      isLoading={isLoading}
      isEmpty={empty}
      emptyReason={emptyReason}
      error={error}
      onRetry={onRetry}
      tableData={tableData}
      showTable={showTable}
      onShowTableChange={onShowTableChange}
      fullscreen={fullscreen}
      onFullscreenChange={onFullscreenChange}
      className={className}
      data={{ data, calendar, selectedYear }}
      spec={(_d, theme, { prefersReducedMotion }) =>
        buildDailySpendCalendarOption({
          data,
          calendar,
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
      ariaLabel={`${title}: ${subtitle} for ${selectedYear}`}
      ariaDescription={
        effectiveCaption || `Daily spend calendar heatmap for ${selectedYear}`
      }
      headerControls={
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
      }
      footerControls={
        unallocatedSpend != null ? (
          <p
            data-testid="unallocated-spend-note"
            className="text-xs text-muted-foreground pt-1 border-t border-border/40"
          >
            {`Spend without a valid recorded date: ${formatRupees(unallocatedSpend)} (orders without a parseable date are excluded from the calendar heatmap).`}
          </p>
        ) : undefined
      }
    />
  );
}

export default DailySpendCalendarChart;
