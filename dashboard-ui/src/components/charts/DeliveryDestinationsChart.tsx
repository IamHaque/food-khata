import * as React from "react";
import * as echarts from "echarts/core";
import { BarChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  AriaComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsCoreOption } from "echarts/core";
import { Info } from "lucide-react";

import { ChartCard } from "@/components/dashboard/ChartCard";
import { SegmentedControl } from "@/components/ui/segmented-control";
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
import {
  computeDestinationsTakeaway,
  formatRupees,
  type DestinationLabelLike,
} from "@/lib/captions";
import { subscribeTheme } from "@/app/theme";
import { useFilters } from "@/app/FilterContext";
import { registerChart, emitHighlight, emitClear } from "@/lib/highlight-bus";

export type DestinationMetric = "spend" | "orders";

export interface DestinationItem extends DestinationLabelLike {
  label: string;
  city: string;
  orders: number;
  spend: number;
  fee: number;
}

export interface NormalizedDestinationItem extends DestinationItem {
  key: string;
  displayName: string;
  aov: number;
}

export interface ActiveFiltersParam {
  localities?: string[];
  cities?: string[];
}

export interface BuildDeliveryDestinationsOptionOptions {
  theme?: ChartTheme;
  activeFilters?: ActiveFiltersParam;
  metric?: DestinationMetric;
  prefersReducedMotion?: boolean;
  maxItems?: number;
}

export interface DeliveryDestinationsChartProps {
  data?: unknown;
  labels?: readonly (DestinationLabelLike | null | undefined)[] | null;
  items?: readonly (DestinationLabelLike | null | undefined)[] | null;
  unsupported_reason?: string | null;
  unsupportedReason?: string | null;
  metric?: DestinationMetric;
  defaultMetric?: DestinationMetric;
  onMetricChange?: (metric: DestinationMetric) => void;
  maxItems?: number;
  title?: string;
  subtitle?: string;
  caption?: string;
  isLoading?: boolean;
  isEmpty?: boolean;
  emptyReason?: string;
  error?: Error | string | null;
  onRetry?: () => void;
  onDestinationClick?: (destination: NormalizedDestinationItem) => void;
  showTable?: boolean;
  onShowTableChange?: (value: boolean) => void;
  fullscreen?: boolean;
  onFullscreenChange?: (value: boolean) => void;
  className?: string;
}

let echartsRegistered = false;
function registerDeliveryDestinationsModules() {
  if (echartsRegistered) return;
  echarts.use([
    BarChart,
    GridComponent,
    TooltipComponent,
    AriaComponent,
    CanvasRenderer,
  ]);
  echartsRegistered = true;
}
registerDeliveryDestinationsModules();

function useOptionalFilters() {
  try {
    return useFilters();
  } catch {
    return null;
  }
}

/**
 * Normalizes raw destination labels, aggregates duplicates by label and city,
 * computes average order values, and sorts descending by spend or orders.
 */
export function normalizeDestinationsData(
  data?: unknown,
  metric: DestinationMetric = "spend",
  maxItems = 15,
): NormalizedDestinationItem[] {
  let rawList: unknown[] = [];

  if (Array.isArray(data)) {
    rawList = data;
  } else if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    const candidate =
      obj.labels ??
      obj.destinations ??
      obj.places ??
      obj.items ??
      obj.data;

    if (Array.isArray(candidate)) {
      rawList = candidate;
    } else if (candidate && typeof candidate === "object") {
      const nested = candidate as Record<string, unknown>;
      if (Array.isArray(nested.labels)) {
        rawList = nested.labels;
      }
    }
  }

  const totals = new Map<
    string,
    { label: string; city: string; orders: number; spend: number; fee: number }
  >();

  for (const raw of rawList) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const rawLabel = String(item.label ?? item.name ?? item.destination ?? "").trim();
    const rawCity = String(item.city ?? "").trim();

    if (!rawLabel && !rawCity) continue;

    const label = rawLabel || rawCity;
    const city = rawCity;

    const ord = Number(item.orders ?? item.count ?? item.qty ?? 0);
    const orders = Number.isFinite(ord) && ord > 0 ? ord : 0;

    const sp = Number(item.spend ?? item.amount ?? item.total ?? 0);
    const spend = Number.isFinite(sp) && sp > 0 ? sp : 0;

    const fe = Number(item.fee ?? item.fees ?? item.net_delivery ?? 0);
    const fee = Number.isFinite(fe) && fe > 0 ? fe : 0;

    const key = city ? `${label}:::${city}` : label;
    const existing = totals.get(key);
    if (existing) {
      existing.orders += orders;
      existing.spend += spend;
      existing.fee += fee;
    } else {
      totals.set(key, { label, city, orders, spend, fee });
    }
  }

  const items: NormalizedDestinationItem[] = [];
  for (const [key, entry] of totals.entries()) {
    if (entry.orders <= 0 && entry.spend <= 0) continue;

    const displayName =
      entry.city && !entry.label.toLowerCase().includes(entry.city.toLowerCase())
        ? `${entry.label} (${entry.city})`
        : entry.label;

    const aov = entry.orders > 0 ? Math.round(entry.spend / entry.orders) : 0;

    items.push({
      key,
      label: entry.label,
      city: entry.city,
      displayName,
      orders: entry.orders,
      spend: entry.spend,
      fee: entry.fee,
      aov,
    });
  }

  if (metric === "orders") {
    items.sort(
      (a, b) => b.orders - a.orders || b.spend - a.spend || a.label.localeCompare(b.label),
    );
  } else {
    items.sort(
      (a, b) => b.spend - a.spend || b.orders - a.orders || a.label.localeCompare(b.label),
    );
  }

  return maxItems > 0 ? items.slice(0, maxItems) : items;
}

/**
 * Determines whether a destination item matches active locality or city filters.
 */
export function isDestinationSelected(
  item: { label?: string; city?: string },
  activeFilters?: ActiveFiltersParam | null,
): boolean {
  if (!activeFilters) return false;
  const localities = activeFilters.localities ?? [];
  const cities = activeFilters.cities ?? [];
  const hasLocalities = localities.length > 0;
  const hasCities = cities.length > 0;

  if (!hasLocalities && !hasCities) return false;

  const matchLocality = hasLocalities && item.label ? localities.includes(item.label) : false;
  const matchCity = hasCities && item.city ? cities.includes(item.city) : false;

  return matchLocality || matchCity;
}

/**
 * Checks if any destination matches the currently active filters.
 */
export function hasAnySelection(
  items: readonly NormalizedDestinationItem[],
  activeFilters?: ActiveFiltersParam | null,
): boolean {
  if (!activeFilters) return false;
  const localities = activeFilters.localities ?? [];
  const cities = activeFilters.cities ?? [];
  if (localities.length === 0 && cities.length === 0) return false;
  return items.some((item) => isDestinationSelected(item, activeFilters));
}

/**
 * Formats rich HTML tooltip for delivery destinations.
 * Shows Destination, City, Total spend in ₹ INR, Order count, and Net delivery fees.
 */
export function formatDestinationsTooltip(
  params: unknown,
  displayed: readonly NormalizedDestinationItem[],
  theme: ChartTheme,
): string {
  if (!params) return "";
  const items = Array.isArray(params) ? params : [params];
  if (items.length === 0) return "";

  const p = items[0] as {
    dataIndex?: number;
    name?: string;
    data?: { destination?: NormalizedDestinationItem; value?: number };
  };

  const idx = typeof p.dataIndex === "number" ? p.dataIndex : 0;
  const row = p.data?.destination ?? displayed[idx];
  if (!row) return "";

  const rank = idx + 1;
  const label = row.label || p.name || "Unknown";
  const city = row.city;
  const orders = row.orders;
  const spend = row.spend;
  const fee = row.fee;

  const formattedSpend = formatRupees(spend);
  const formattedFee = formatRupees(fee);
  const orderText = `${orders} ${orders === 1 ? "order" : "orders"}`;

  return `
    <div style="font-family: inherit; font-size: 12px; line-height: 1.5; min-width: 200px;">
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px; border-bottom: 1px solid ${theme.border}; padding-bottom: 4px;">
        <span style="font-weight: 600; color: ${theme.textColor};">${label}</span>
        <span style="font-size: 10px; font-weight: 700; background: ${theme.border}; color: ${theme.textColor}; padding: 1px 6px; border-radius: 4px;">#${rank}</span>
      </div>
      ${
        city
          ? `
      <div style="display: flex; justify-content: space-between; gap: 12px; margin-bottom: 3px;">
        <span style="color: ${theme.mutedColor};">City:</span>
        <strong style="color: ${theme.textColor};">${city}</strong>
      </div>`
          : ""
      }
      <div style="display: flex; justify-content: space-between; gap: 12px; margin-bottom: 3px;">
        <span style="color: ${theme.mutedColor};">Total spend:</span>
        <strong style="color: ${theme.textColor}; font-family: monospace;">${formattedSpend}</strong>
      </div>
      <div style="display: flex; justify-content: space-between; gap: 12px; margin-bottom: 3px;">
        <span style="color: ${theme.mutedColor};">Orders:</span>
        <strong style="color: ${theme.textColor}; font-family: monospace;">${orderText}</strong>
      </div>
      <div style="display: flex; justify-content: space-between; gap: 12px;">
        <span style="color: ${theme.mutedColor};">Net delivery fees:</span>
        <strong style="color: ${theme.textColor}; font-family: monospace;">${formattedFee}</strong>
      </div>
    </div>
  `.trim();
}

/**
 * Handles cross-filter clicking on a destination bar.
 * Toggles locality or city filter via filters.update().
 */
export function handleDestinationClick(
  destinationOrParams: unknown,
  filters?: {
    filters?: { localities?: string[]; cities?: string[] };
    update: (patch: { localities?: string[]; cities?: string[] }) => void;
  } | null,
  target: "locality" | "city" = "locality",
  onDestinationClick?: (item: NormalizedDestinationItem) => void,
  dataset?: readonly NormalizedDestinationItem[],
): NormalizedDestinationItem | null {
  let item: NormalizedDestinationItem | null = null;
  const p = destinationOrParams as any;

  if (p && typeof p === "object") {
    if ("label" in p || "city" in p) {
      item = p as NormalizedDestinationItem;
    } else if (p.data?.destination) {
      item = p.data.destination;
    } else if (typeof p.dataIndex === "number" && dataset && dataset[p.dataIndex]) {
      item = dataset[p.dataIndex];
    } else if (typeof p.name === "string" && dataset) {
      item =
        dataset.find((d) => d.displayName === p.name || d.label === p.name) ??
        null;
    }
  }

  if (!item) return null;

  if (target === "city" || (!item.label && item.city)) {
    const currentCities = filters?.filters?.cities ?? [];
    const isSelected = Boolean(item.city && currentCities.includes(item.city));
    const nextCities = isSelected
      ? currentCities.filter((c) => c !== item.city)
      : item.city
        ? [item.city]
        : [];
    filters?.update({ cities: nextCities });
  } else {
    const currentLocalities = filters?.filters?.localities ?? [];
    const isSelected = Boolean(item.label && currentLocalities.includes(item.label));
    const nextLocalities = isSelected
      ? currentLocalities.filter((l) => l !== item.label)
      : item.label
        ? [item.label]
        : [];
    filters?.update({ localities: nextLocalities });
  }

  onDestinationClick?.(item);
  return item;
}

/**
 * Generates screen reader table headers, rows, and export data.
 */
export function buildDestinationsTableRows(
  items: readonly NormalizedDestinationItem[],
) {
  const tableHeaders = [
    "Destination",
    "City",
    "Orders",
    "Spend",
    "Delivery Fees",
  ];
  const tableRows = items.map((d) => [
    d.label,
    d.city || "—",
    d.orders,
    formatRupees(d.spend),
    formatRupees(d.fee),
  ] as [string, string, number, string, string]);

  const tableData = items.map((d) => ({
    Destination: d.label,
    City: d.city || "—",
    Orders: d.orders,
    Spend: formatRupees(d.spend),
    "Delivery Fees": formatRupees(d.fee),
  }));

  return { tableHeaders, tableRows, tableData };
}

/**
 * Pure option builder for delivery destinations horizontal ranking bar chart.
 * - Y-axis: Category axis with inverse: true (#1 rank at top).
 * - X-axis: Value axis (Spend in ₹ INR, or toggleable with Orders).
 * - Bars: Themed color theme.colors[0], with 600ms cubicOut entry animation.
 * - Active selection: Highlights matching bar and dims unselected bars to opacity 0.35.
 * - Tooltip: Rich HTML detailing spend, orders, city, and delivery fees.
 */
export function buildDeliveryDestinationsOption(
  data: unknown,
  themeOrOpts?: ChartTheme | BuildDeliveryDestinationsOptionOptions,
  activeFiltersArg?: ActiveFiltersParam,
  metricArg?: DestinationMetric,
  prefersReducedMotionArg?: boolean,
  maxItemsArg?: number,
): EChartsCoreOption {
  let theme: ChartTheme | undefined;
  let activeFilters: ActiveFiltersParam = {};
  let metric: DestinationMetric = "spend";
  let prefersReducedMotion = false;
  let maxItems = 15;

  if (themeOrOpts) {
    if ("colors" in themeOrOpts || "mode" in themeOrOpts) {
      theme = themeOrOpts as ChartTheme;
      if (activeFiltersArg) activeFilters = activeFiltersArg;
      if (metricArg) metric = metricArg;
      if (typeof prefersReducedMotionArg === "boolean") {
        prefersReducedMotion = prefersReducedMotionArg;
      }
      if (typeof maxItemsArg === "number") maxItems = maxItemsArg;
    } else {
      const opts = themeOrOpts as BuildDeliveryDestinationsOptionOptions;
      if (opts.theme) theme = opts.theme;
      if (opts.activeFilters) activeFilters = opts.activeFilters;
      if (opts.metric) metric = opts.metric;
      if (typeof opts.prefersReducedMotion === "boolean") {
        prefersReducedMotion = opts.prefersReducedMotion;
      }
      if (typeof opts.maxItems === "number") maxItems = opts.maxItems;
    }
  }

  if (!theme) {
    theme =
      typeof document === "undefined"
        ? resolveChartTheme("light", "emerald")
        : getCurrentChartTheme();
  }

  const items = normalizeDestinationsData(data, metric, maxItems);
  const base = buildBaseChartOption(theme, prefersReducedMotion);

  if (items.length === 0) {
    return {
      ...base,
      xAxis: { type: "value", show: false },
      yAxis: { type: "category", show: false },
      series: [],
    };
  }

  const hasFilterActive = Boolean(
    (activeFilters.localities && activeFilters.localities.length > 0) ||
      (activeFilters.cities && activeFilters.cities.length > 0),
  );

  const isSpend = metric === "spend";
  const primaryColor = theme.colors[0];

  const seriesData = items.map((d) => {
    const isSelected = hasFilterActive
      ? isDestinationSelected(d, activeFilters)
      : true;

    return {
      name: d.displayName,
      value: isSpend ? d.spend : d.orders,
      itemStyle: {
        color: primaryColor,
        opacity: isSelected ? 1 : 0.35,
        borderRadius: [0, 4, 4, 0],
      },
      destination: d,
    };
  });

  const option: EChartsCoreOption = {
    ...base,
    animation: !prefersReducedMotion,
    animationDuration: prefersReducedMotion ? 0 : 600,
    animationDurationUpdate: prefersReducedMotion ? 0 : 300,
    animationEasing: "cubicOut",
    grid: {
      top: 15,
      right: isSpend ? 85 : 75,
      bottom: 25,
      left: 12,
      containLabel: true,
    },
    tooltip: {
      trigger: "item",
      backgroundColor: theme.tooltipBg,
      borderColor: theme.tooltipBorder,
      textStyle: { color: theme.tooltipText },
      formatter: (params: unknown) =>
        formatDestinationsTooltip(params, items, theme),
    },
    xAxis: {
      type: "value",
      name: isSpend ? "Spend (₹)" : "Orders",
      nameTextStyle: {
        color: theme.mutedColor,
        fontSize: 11,
        align: "right",
      },
      minInterval: isSpend ? undefined : 1,
      splitLine: {
        show: true,
        lineStyle: {
          color: theme.splitLine,
          width: 0.5,
        },
      },
      axisLine: {
        lineStyle: {
          color: theme.axisLine,
        },
      },
      axisLabel: {
        color: theme.mutedColor,
        fontSize: 11,
        formatter: (val: number) =>
          isSpend ? formatRupees(val) : String(val),
      },
    },
    yAxis: {
      type: "category",
      inverse: true, // Rank #1 at top
      data: items.map((d) => d.displayName),
      axisLabel: {
        color: theme.textColor,
        fontSize: 11,
        width: 130,
        overflow: "truncate",
        ellipsis: "...",
      },
      axisTick: { show: false },
      axisLine: {
        lineStyle: {
          color: theme.axisLine,
        },
      },
    },
    series: [
      {
        name: isSpend ? "Spend" : "Orders",
        type: "bar",
        data: seriesData,
        barMaxWidth: 24,
        label: {
          show: true,
          position: "right",
          distance: 6,
          color: theme.mutedColor,
          fontSize: 11,
          formatter: (params: any) => {
            const item = params?.data?.destination as
              | NormalizedDestinationItem
              | undefined;
            if (!item) return "";
            if (isSpend) {
              return `${item.orders} ${item.orders === 1 ? "order" : "orders"}`;
            }
            return formatRupees(item.spend);
          },
        },
      },
    ],
  };

  return option;
}

export function DeliveryDestinationsChart({
  data: dataProp,
  labels: labelsProp,
  items: itemsProp,
  unsupported_reason,
  unsupportedReason: unsupportedReasonProp,
  metric: controlledMetric,
  defaultMetric = "spend",
  onMetricChange,
  maxItems = 15,
  title = "Delivery destinations",
  subtitle = "Spend and order volume ranked across delivery localities",
  caption: captionProp,
  isLoading,
  isEmpty: isEmptyProp,
  emptyReason,
  error,
  onRetry,
  onDestinationClick,
  showTable,
  onShowTableChange,
  fullscreen,
  onFullscreenChange,
  className,
}: DeliveryDestinationsChartProps) {
  const [internalMetric, setInternalMetric] =
    React.useState<DestinationMetric>(defaultMetric);
  const activeMetric = controlledMetric ?? internalMetric;

  const rawData = dataProp ?? labelsProp ?? itemsProp;
  const unsupportedMsg = unsupportedReasonProp ?? unsupported_reason ?? null;

  const filters = useOptionalFilters();
  const activeFilters = React.useMemo<ActiveFiltersParam>(() => {
    return {
      localities: filters?.filters?.localities ?? [],
      cities: filters?.filters?.cities ?? [],
    };
  }, [filters?.filters?.localities, filters?.filters?.cities]);

  const displayedItems = React.useMemo(() => {
    return normalizeDestinationsData(rawData, activeMetric, maxItems);
  }, [rawData, activeMetric, maxItems]);

  const { tableHeaders, tableRows, tableData } = React.useMemo(() => {
    return buildDestinationsTableRows(displayedItems);
  }, [displayedItems]);

  const dynamicCaption = React.useMemo(() => {
    return computeDestinationsTakeaway(displayedItems);
  }, [displayedItems]);

  const resolvedCaption = captionProp ?? dynamicCaption ?? undefined;

  const empty =
    isEmptyProp ||
    Boolean(unsupportedMsg) ||
    (!isLoading && !error && displayedItems.length === 0);

  const resolvedEmptyReason =
    unsupportedMsg || emptyReason || "No delivery destination data recorded";

  const containerRef = React.useRef<HTMLDivElement>(null);
  const chartInstanceRef = React.useRef<echarts.ECharts | null>(null);
  const chartIdRef = React.useRef(
    `delivery-destinations-${Math.random().toString(36).slice(2, 9)}`,
  );

  const handleMetricChange = React.useCallback(
    (newMetric: DestinationMetric) => {
      setInternalMetric(newMetric);
      onMetricChange?.(newMetric);
    },
    [onMetricChange],
  );

  // Initialize ECharts instance and listeners
  React.useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    registerDeliveryDestinationsModules();

    if (!chartInstanceRef.current) {
      chartInstanceRef.current = echarts.init(node);
    }
    const chart = chartInstanceRef.current;
    const unregister = registerChart(chartIdRef.current, chart, {
      dimension: "locality",
    });

    const onChartClick = (params: unknown) => {
      handleDestinationClick(
        params,
        filters,
        "locality",
        onDestinationClick,
        displayedItems,
      );
    };

    const onChartOver = (params: any) => {
      const item = params?.data?.destination as NormalizedDestinationItem | undefined;
      if (item?.label) {
        emitHighlight(chartIdRef.current, "locality", item.label);
      }
    };

    const onChartOut = () => emitClear(chartIdRef.current);

    chart.on("click", onChartClick);
    chart.on("mouseover", onChartOver);
    chart.on("mouseout", onChartOut);

    const ro = new ResizeObserver(() => {
      if (chart && !chart.isDisposed()) {
        chart.resize();
      }
    });
    ro.observe(node);

    return () => {
      chart.off("click", onChartClick);
      chart.off("mouseover", onChartOver);
      chart.off("mouseout", onChartOut);
      unregister();
      ro.disconnect();
      if (chartInstanceRef.current) {
        chartInstanceRef.current.dispose();
        chartInstanceRef.current = null;
      }
    };
  }, [displayedItems, filters, onDestinationClick]);

  // Apply chart options when data, theme, or active filters change
  React.useEffect(() => {
    const chart = chartInstanceRef.current;
    if (!chart || chart.isDisposed() || empty || isLoading || error) return;

    const applyOption = () => {
      const theme = getCurrentChartTheme();
      const prefersReducedMotion =
        typeof window !== "undefined" &&
        window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      const option = buildDeliveryDestinationsOption(
        displayedItems,
        theme,
        activeFilters,
        activeMetric,
        prefersReducedMotion,
        maxItems,
      );

      chart.setOption(option, { notMerge: true, lazyUpdate: true });
    };

    applyOption();

    const unsubTheme = subscribeTheme(() => {
      applyOption();
    });

    return () => {
      unsubTheme();
    };
  }, [displayedItems, activeFilters, activeMetric, empty, isLoading, error, maxItems]);

  const infoPopover = (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Delivery destinations information"
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
            Delivery Destinations Ranking
          </p>
          <p className="text-muted-foreground mt-0.5 leading-relaxed">
            Ranks your delivery localities and cities by total expenditure and order
            volume across all recorded deliveries.
          </p>
        </div>
        <div className="space-y-1.5 pt-1 border-t border-border/50">
          <p className="font-medium text-foreground">
            Spend & Order Volume Callouts
          </p>
          <p className="text-muted-foreground leading-relaxed">
            View total spend alongside order counts on bar end labels. Switch between{" "}
            <strong>Spend</strong> and <strong>Orders</strong> to analyze spending
            distribution versus ordering frequency.
          </p>
        </div>
        <div className="space-y-1.5 pt-1 border-t border-border/50">
          <p className="font-medium text-foreground">
            Click to Filter by Locality / City
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Click any destination bar to toggle filtering by that delivery locality
            or city. Active destinations stay highlighted while unselected bars dim.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );

  return (
    <ChartCard
      title={title}
      subtitle={subtitle}
      caption={resolvedCaption}
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
      <div className="flex flex-col space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            {displayedItems.length}{" "}
            {displayedItems.length === 1 ? "destination" : "destinations"} ranked
          </span>
          <SegmentedControl
            value={activeMetric}
            onChange={(val) => handleMetricChange(val as DestinationMetric)}
            options={[
              { value: "spend", label: "Spend" },
              { value: "orders", label: "Orders" },
            ]}
          />
        </div>
        <div
          ref={containerRef}
          className="h-[360px] w-full"
          role="img"
          aria-label={`${title}: ${subtitle}`}
        />
      </div>
    </ChartCard>
  );
}
export default DeliveryDestinationsChart;
