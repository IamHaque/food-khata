import { getPatterns } from "../../app/theme";
import * as React from "react";
import * as echarts from "echarts/core";
import {
  ScatterChart,
  LineChart,
  type ScatterSeriesOption,
  type LineSeriesOption,
} from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  AriaComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsCoreOption } from "echarts/core";
import { Info } from "lucide-react";

import { ChartCard } from "@/components/dashboard/ChartCard";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  getCurrentChartTheme,
  buildBaseChartOption,
  resolveChartTheme,
  type ChartTheme,
} from "@/lib/chart-theme";
import {
  computeDistanceVsFeeTakeaway,
  formatRupees,
  type DistanceItemLike,
} from "@/lib/captions";
import { subscribeTheme } from "@/app/theme";

export interface DistanceDatum extends DistanceItemLike {
  distance_km: number;
  fee: number;
  restaurant?: string | null;
}

export interface DistanceTrendlineResult {
  slope: number;
  intercept: number;
  points: [number, number][];
  rSquared?: number;
}

export interface BuildDistanceVsFeeOptionOptions {
  data?: readonly DistanceDatum[] | null;
  theme?: ChartTheme;
  prefersReducedMotion?: boolean;
}

export interface DistanceVsFeeChartProps {
  data?: readonly DistanceDatum[] | null;
  distances?: readonly DistanceDatum[] | null;
  distance_unavailable_reason?: string | null;
  isLoading?: boolean;
  isEmpty?: boolean;
  emptyReason?: string;
  error?: Error | string | null;
  onRetry?: () => void;
  className?: string;
  title?: string;
  subtitle?: string;
  caption?: string;
  onPointClick?: (point: DistanceDatum) => void;
  showTable?: boolean;
  onShowTableChange?: (value: boolean) => void;
  fullscreen?: boolean;
  onFullscreenChange?: (value: boolean) => void;
}

let echartsRegistered = false;
export function registerDistanceVsFeeModules() {
  if (echartsRegistered) return;
  echarts.use([
    ScatterChart,
    LineChart,
    GridComponent,
    TooltipComponent,
    LegendComponent,
    AriaComponent,
    CanvasRenderer,
  ]);
  echartsRegistered = true;
}
registerDistanceVsFeeModules();

/**
 * Computes ordinary least squares linear regression trendline (y = mx + c)
 * for delivery fee against distance (km).
 * Returns null if fewer than 2 valid points exist or if all x values are identical.
 */
export function computeDistanceTrendline(
  points: readonly { distance_km: number; fee: number }[]
): DistanceTrendlineResult | null {
  const valid = (points ?? []).filter(
    (p) =>
      p &&
      typeof p.distance_km === "number" &&
      Number.isFinite(p.distance_km) &&
      p.distance_km >= 0 &&
      typeof p.fee === "number" &&
      Number.isFinite(p.fee) &&
      p.fee >= 0
  );

  if (valid.length < 2) return null;

  const n = valid.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  let minX = Infinity;
  let maxX = -Infinity;

  for (const p of valid) {
    const x = p.distance_km;
    const y = p.fee;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
  }

  const denominator = n * sumX2 - sumX * sumX;
  if (Math.abs(denominator) < 1e-9) {
    return null;
  }

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;

  const meanY = sumY / n;
  let ssTot = 0;
  let ssRes = 0;
  for (const p of valid) {
    const y = p.fee;
    const predY = slope * p.distance_km + intercept;
    ssTot += (y - meanY) ** 2;
    ssRes += (y - predY) ** 2;
  }
  const rSquared = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 1;

  const startY = slope * minX + intercept;
  const endY = slope * maxX + intercept;

  return {
    slope,
    intercept,
    points: [
      [minX, Number(startY.toFixed(2))],
      [maxX, Number(endY.toFixed(2))],
    ],
    rSquared: Number(rSquared.toFixed(3)),
  };
}

/**
 * Formats rich HTML tooltip for distance vs fee scatter points and trendline.
 * Shows Restaurant name (or "Delivery order" fallback), Distance (X.XX km),
 * and Net delivery fee (formatRupees(fee)).
 */
export function formatDistanceVsFeeTooltip(
  params: unknown,
  theme: ChartTheme
): string {
  const item = Array.isArray(params) ? params[0] : params;
  if (!item) return "";

  const anyItem = item as any;
  if (anyItem.seriesName === "Trendline" || anyItem.seriesType === "line") {
    const val = anyItem.value;
    if (Array.isArray(val) && val.length >= 2) {
      return `
        <div style="font-family: inherit; font-size: 12px; line-height: 1.5; min-width: 160px;">
          <div style="font-weight: 600; color: ${theme.textColor}; margin-bottom: 4px;">Trendline (Linear fit)</div>
          <div style="display: flex; justify-content: space-between; gap: 8px;">
            <span style="color: ${theme.mutedColor};">Distance:</span>
            <span style="font-weight: 600; color: ${theme.textColor};">${Number(val[0]).toFixed(2)} km</span>
          </div>
          <div style="display: flex; justify-content: space-between; gap: 8px;">
            <span style="color: ${theme.mutedColor};">Predicted fee:</span>
            <span style="font-weight: 600; color: ${theme.textColor};">${formatRupees(val[1])}</span>
          </div>
        </div>
      `.trim();
    }
    return `<div style="font-size: 12px; color: ${theme.textColor};">Trendline</div>`;
  }

  const val = anyItem.value;
  if (!Array.isArray(val) || val.length < 2) return "";

  const distance = Number(val[0]);
  const fee = Number(val[1]);
  const restaurantName = val[2] && String(val[2]).trim() ? String(val[2]).trim() : "Delivery order";

  return `
    <div style="font-family: inherit; font-size: 12px; line-height: 1.5; min-width: 180px;">
      <div style="font-weight: 600; margin-bottom: 6px; color: ${theme.textColor}; border-bottom: 1px solid ${theme.border}; padding-bottom: 4px;">
        ${restaurantName}
      </div>
      <div style="display: flex; justify-content: space-between; gap: 12px; margin-bottom: 3px;">
        <span style="color: ${theme.mutedColor};">Distance:</span>
        <span style="font-weight: 600; color: ${theme.textColor};">${distance.toFixed(2)} km</span>
      </div>
      <div style="display: flex; justify-content: space-between; gap: 12px; border-top: 1px solid ${theme.border}; padding-top: 4px;">
        <span style="color: ${theme.mutedColor}; font-weight: 500;">Net delivery fee:</span>
        <span style="font-weight: 700; color: ${theme.textColor};">${formatRupees(fee)}</span>
      </div>
    </div>
  `.trim();
}

/**
 * Pure, exported option builder (CC-11):
 * Converts distance vs fee data into an ECharts Core Option with scatter points and trendline.
 */
export function buildDistanceVsFeeOption(
  dataOrOptions?: readonly DistanceDatum[] | null | BuildDistanceVsFeeOptionOptions,
  themeParam?: ChartTheme,
  prefersReducedMotionParam = false
): EChartsCoreOption {
  let data: readonly DistanceDatum[] | null | undefined;
  let theme: ChartTheme | undefined;
  let prefersReducedMotion = prefersReducedMotionParam;

  if (
    dataOrOptions &&
    typeof dataOrOptions === "object" &&
    !Array.isArray(dataOrOptions) &&
    ("data" in dataOrOptions || "theme" in dataOrOptions || "prefersReducedMotion" in dataOrOptions)
  ) {
    const opts = dataOrOptions as BuildDistanceVsFeeOptionOptions;
    data = opts.data;
    theme = opts.theme;
    prefersReducedMotion = opts.prefersReducedMotion ?? false;
  } else {
    data = dataOrOptions as readonly DistanceDatum[] | null | undefined;
    theme = themeParam;
  }

  const currentTheme = theme ?? resolveChartTheme("light", "emerald");
  const items = data ?? [];

  const validPoints = items.filter(
    (d) =>
      d &&
      typeof d.distance_km === "number" &&
      Number.isFinite(d.distance_km) &&
      d.distance_km >= 0 &&
      typeof d.fee === "number" &&
      Number.isFinite(d.fee) &&
      d.fee >= 0
  );

  const primaryColor = currentTheme.colors[0];
  const trendlineColor = currentTheme.colors[1] ?? currentTheme.mutedColor;

  const trendline = computeDistanceTrendline(validPoints);

  const scatterSeries: ScatterSeriesOption = {
    name: "Delivery orders",
    type: "scatter",
    data: validPoints.map((d) => [d.distance_km, d.fee, d.restaurant ?? ""]),
    symbolSize: 8,
    itemStyle: {
      color: primaryColor,
      opacity: 0.75,
      borderColor: primaryColor,
      borderWidth: 1,
    },
    emphasis: {
      itemStyle: {
        borderColor: primaryColor,
        borderWidth: 2,
        shadowBlur: 6,
        shadowColor: primaryColor,
      },
    },
    animationDelay: (idx: number) => (prefersReducedMotion ? 0 : Math.min(idx * 10, 400)),
  };

  const series: Array<ScatterSeriesOption | LineSeriesOption> = [scatterSeries];

  if (trendline) {
    const trendlineSeries: LineSeriesOption = {
      name: "Trendline",
      type: "line",
      data: trendline.points,
      lineStyle: {
        type: "dashed",
        color: trendlineColor,
        width: 2,
      },
      smooth: false,
      showSymbol: false,
      animationDelay: prefersReducedMotion ? 0 : 300,
    };
    series.push(trendlineSeries);
  }

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
        fontSize: 12,
        fontFamily: '"Inter Variable", sans-serif',
      },
      formatter: (params: unknown) => formatDistanceVsFeeTooltip(params, currentTheme),
    },
    legend: {
      show: true,
      top: 8,
      right: 16,
      textStyle: {
        color: currentTheme.mutedColor,
        fontSize: 11,
        fontFamily: '"Inter Variable", sans-serif',
      },
      icon: "roundRect",
      data: trendline ? ["Delivery orders", "Trendline"] : ["Delivery orders"],
    },
    grid: {
      left: 20,
      right: 24,
      top: 44,
      bottom: 28,
      containLabel: true,
    },
    xAxis: {
      type: "value",
      name: "Distance (km)",
      nameLocation: "middle",
      nameGap: 28,
      nameTextStyle: {
        color: currentTheme.mutedColor,
        fontSize: 11,
        fontFamily: '"Inter Variable", sans-serif',
      },
      axisLabel: {
        color: currentTheme.mutedColor,
        fontSize: 11,
        fontFamily: '"Inter Variable", sans-serif',
        formatter: (val: number) => `${val} km`,
      },
      axisLine: {
        lineStyle: {
          color: currentTheme.axisLine,
        },
      },
      splitLine: {
        lineStyle: {
          color: currentTheme.splitLine,
        },
      },
    },
    yAxis: {
      type: "value",
      name: "Delivery fee (₹)",
      nameLocation: "end",
      nameTextStyle: {
        color: currentTheme.mutedColor,
        fontSize: 11,
        fontFamily: '"Inter Variable", sans-serif',
      },
      axisLabel: {
        color: currentTheme.mutedColor,
        fontSize: 11,
        fontFamily: '"Inter Variable", sans-serif',
        formatter: (val: number) => `₹${val}`,
      },
      axisLine: {
        lineStyle: {
          color: currentTheme.axisLine,
        },
      },
      splitLine: {
        lineStyle: {
          color: currentTheme.splitLine,
        },
      },
    },
    series,
  };
}

export function DistanceVsFeeInfoContent() {
  return (
    <div className="space-y-2.5">
      <div>
        <p className="font-semibold text-foreground text-sm">Distance vs Delivery Fee</p>
        <p className="text-muted-foreground mt-0.5 leading-relaxed">
          Plots restaurant delivery distance against net delivery fee to observe how delivery fees scale with trip length.
        </p>
      </div>
      <div className="space-y-1.5 pt-1 border-t border-border/50">
        <p className="font-medium text-foreground">Scatter Points</p>
        <p className="text-muted-foreground leading-relaxed">
          Each point represents a delivered order with known coordinates, plotting distance in kilometers against the net delivery fee paid.
        </p>
      </div>
      <div className="space-y-1.5 pt-1 border-t border-border/50">
        <p className="font-medium text-foreground">OLS Linear Regression Trendline & Slope</p>
        <p className="text-muted-foreground leading-relaxed">
          The dashed line shows an ordinary least squares (OLS) linear regression fit (y = mx + c), highlighting the estimated base fee and incremental delivery fee slope per kilometer.
        </p>
      </div>
      <div className="space-y-1.5 pt-1 border-t border-border/50">
        <p className="font-medium text-foreground">Coordinate Availability Threshold</p>
        <p className="text-muted-foreground leading-relaxed">
          Accurate distance calculation requires valid geographic coordinates for both the restaurant and delivery address. If more than 80% of delivered orders lack coordinates, distance analytics are marked unavailable.
        </p>
      </div>
    </div>
  );
}

export function DistanceVsFeeInfoPopover() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Distance vs delivery fee information"
          className="text-muted-foreground hover:text-foreground inline-flex items-center justify-center p-0.5 rounded cursor-pointer transition-colors"
        >
          <Info className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 text-xs space-y-2.5 p-3.5 bg-popover text-popover-foreground shadow-md rounded-md border border-border"
        align="start"
      >
        <DistanceVsFeeInfoContent />
      </PopoverContent>
    </Popover>
  );
}

export function DistanceVsFeeChart({
  data,
  distances,
  distance_unavailable_reason,
  isLoading = false,
  isEmpty,
  emptyReason,
  error = null,
  onRetry,
  className,
  title = "Distance vs delivery fee",
  subtitle = "Restaurant delivery distance plotted against net delivery fee",
  caption,
  onPointClick,
  showTable,
  onShowTableChange,
  fullscreen,
  onFullscreenChange,
}: DistanceVsFeeChartProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const chartRef = React.useRef<echarts.EChartsType | null>(null);

  const rawData = data ?? distances ?? [];

  const validPoints = React.useMemo(() => {
    return rawData.filter(
      (d): d is DistanceDatum =>
        d != null &&
        typeof d.distance_km === "number" &&
        Number.isFinite(d.distance_km) &&
        d.distance_km >= 0 &&
        typeof d.fee === "number" &&
        Number.isFinite(d.fee) &&
        d.fee >= 0
    );
  }, [rawData]);

  const hasUnavailableReason = Boolean(distance_unavailable_reason);
  const isActuallyEmpty =
    isEmpty ?? (hasUnavailableReason || (!isLoading && validPoints.length === 0));

  const resolvedEmptyReason =
    emptyReason ??
    distance_unavailable_reason ??
    "No distance or delivery fee data available for the selected filters.";

  const computedCaption =
    caption ??
    computeDistanceVsFeeTakeaway(rawData, distance_unavailable_reason) ??
    undefined;

  const tableHeaders = React.useMemo(() => ["Distance (km)", "Delivery fee"], []);
  const tableRows = React.useMemo(() => {
    return validPoints.map((p) => [
      `${p.distance_km} km`,
      formatRupees(p.fee),
    ]);
  }, [validPoints]);

  const handlePointClick = React.useCallback(
    (point: DistanceDatum) => {
      if (onPointClick) {
        onPointClick(point);
      }
    },
    [onPointClick]
  );

  React.useEffect(() => {
    const node = containerRef.current;
    if (!node || isActuallyEmpty || isLoading || error) return;

    registerDistanceVsFeeModules();

    if (!chartRef.current) {
      chartRef.current = echarts.init(node);
    }
    const chart = chartRef.current;

    const handleClick = (params: unknown) => {
      const p = params as { seriesType?: string; dataIndex?: number };
      if (
        p &&
        p.seriesType === "scatter" &&
        typeof p.dataIndex === "number" &&
        validPoints[p.dataIndex]
      ) {
        handlePointClick(validPoints[p.dataIndex]);
      }
    };

    chart.on("click", handleClick);

    const resizeObserver = new ResizeObserver(() => {
      if (chart && !chart.isDisposed()) {
        chart.resize();
      }
    });
    resizeObserver.observe(node);

    return () => {
      chart.off("click", handleClick);
      resizeObserver.disconnect();
      if (chartRef.current) {
        chartRef.current.dispose();
        chartRef.current = null;
      }
    };
  }, [isActuallyEmpty, isLoading, error, validPoints, handlePointClick]);

  React.useEffect(() => {
    function applyUpdate() {
      const chart = chartRef.current;
      if (!chart || chart.isDisposed()) return;
      const theme = getCurrentChartTheme();
      const prefersReducedMotion =
        typeof window !== "undefined" &&
        window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      const opt = buildDistanceVsFeeOption({
        data: validPoints,
        theme,
        prefersReducedMotion,
      });

      chart.setOption(opt, { notMerge: true, lazyUpdate: true });
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
  }, [validPoints]);

  const infoPopover = <DistanceVsFeeInfoPopover />;

  const ariaDescription = `Scatter plot displaying ${validPoints.length} delivery orders with distance and delivery fees.`;

  return (
    <ChartCard
      title={title}
      subtitle={subtitle}
      caption={computedCaption}
      infoPopover={infoPopover}
      isLoading={isLoading}
      isEmpty={isActuallyEmpty}
      emptyReason={resolvedEmptyReason}
      error={error}
      onRetry={onRetry}
      tableHeaders={tableHeaders}
      tableRows={tableRows}
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
        aria-description={ariaDescription}
        style={{ height: 320, width: "100%" }}
      />
    </ChartCard>
  );
}

export default DistanceVsFeeChart;
