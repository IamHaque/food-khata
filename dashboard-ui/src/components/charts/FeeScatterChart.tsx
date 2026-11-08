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
import { useNavigate, useLocation } from "react-router-dom";

import { ChartCard } from "../dashboard/ChartCard";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import {
  getCurrentChartTheme,
  buildBaseChartOption,
  resolveChartTheme,
  type ChartTheme,
} from "../../lib/chart-theme";
import {
  computeFeeScatterTakeaway,
  formatRupees,
  type FeeScatterItemLike,
} from "../../lib/captions";
import { subscribeTheme } from "../../app/theme";

export interface FeeScatterDatum extends FeeScatterItemLike {
  amount: number;
  fees: number;
  fee_percent: number | null;
  order_id?: string | number | null;
}

export interface TrendlineResult {
  slope: number;
  intercept: number;
  points: [number, number][];
  rSquared?: number;
}

export interface BuildFeeScatterOptionParams {
  data?: readonly FeeScatterDatum[] | null;
  theme?: ChartTheme;
  prefersReducedMotion?: boolean;
}

export interface FeeScatterChartProps {
  data?: readonly FeeScatterDatum[] | null;
  isLoading?: boolean;
  isEmpty?: boolean;
  emptyReason?: string;
  error?: Error | string | null;
  onRetry?: () => void;
  className?: string;
  title?: string;
  subtitle?: string;
  caption?: string;
  onPointClick?: (point: FeeScatterDatum) => void;
  showTable?: boolean;
  onShowTableChange?: (value: boolean) => void;
  fullscreen?: boolean;
  onFullscreenChange?: (value: boolean) => void;
}

let echartsRegistered = false;
function registerFeeScatterModules() {
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
registerFeeScatterModules();

function useOptionalNavigate() {
  try {
    return useNavigate();
  } catch {
    return null;
  }
}

function useOptionalLocation() {
  try {
    return useLocation();
  } catch {
    return null;
  }
}

/**
 * Dynamically scales symbol size proportional to order amount,
 * clamped between minSize and maxSize (defaults: 6px to 22px).
 */
export function computeSymbolSize(
  amount: number,
  minAmount: number,
  maxAmount: number,
  minSize = 6,
  maxSize = 22
): number {
  if (!Number.isFinite(amount) || maxAmount <= minAmount) {
    return Math.round((minSize + maxSize) / 2);
  }
  const clamped = Math.max(minAmount, Math.min(maxAmount, amount));
  const ratio = (clamped - minAmount) / (maxAmount - minAmount);
  return Math.round(minSize + (maxSize - minSize) * ratio);
}

/**
 * Computes ordinary least squares linear regression trendline (y = mx + b).
 * Returns null if fewer than 2 valid points exist or if all x values are identical.
 */
export function computeTrendline(
  points: readonly { amount: number; fee_percent: number | null }[]
): TrendlineResult | null {
  const valid = (points ?? []).filter(
    (p) =>
      p &&
      typeof p.amount === "number" &&
      Number.isFinite(p.amount) &&
      p.amount > 0 &&
      typeof p.fee_percent === "number" &&
      Number.isFinite(p.fee_percent)
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
    const x = p.amount;
    const y = p.fee_percent!;
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
    const y = p.fee_percent!;
    const predY = slope * p.amount + intercept;
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

export function formatFeeScatterTooltip(
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
            <span style="color: ${theme.mutedColor};">Order value:</span>
            <span style="font-weight: 600; color: ${theme.textColor};">${formatRupees(val[0])}</span>
          </div>
          <div style="display: flex; justify-content: space-between; gap: 8px;">
            <span style="color: ${theme.mutedColor};">Predicted fee burden:</span>
            <span style="font-weight: 600; color: ${theme.textColor};">${Number(val[1]).toFixed(1)}%</span>
          </div>
        </div>
      `.trim();
    }
    return `<div style="font-size: 12px; color: ${theme.textColor};">Trendline</div>`;
  }

  const val = anyItem.value;
  if (!Array.isArray(val) || val.length < 2) return "";

  const amount = val[0];
  const feePercent = val[1];
  const fees = val[2] !== undefined ? val[2] : (amount * feePercent) / 100;

  return `
    <div style="font-family: inherit; font-size: 12px; line-height: 1.5; min-width: 180px;">
      <div style="font-weight: 600; margin-bottom: 6px; color: ${theme.textColor}; border-bottom: 1px solid ${theme.border}; padding-bottom: 4px;">
        Order Fee Burden
      </div>
      <div style="display: flex; justify-content: space-between; gap: 12px; margin-bottom: 3px;">
        <span style="color: ${theme.mutedColor};">Order value:</span>
        <span style="font-weight: 600; color: ${theme.textColor};">${formatRupees(amount)}</span>
      </div>
      <div style="display: flex; justify-content: space-between; gap: 12px; margin-bottom: 3px;">
        <span style="color: ${theme.mutedColor};">Total fees:</span>
        <span style="font-weight: 600; color: ${theme.textColor};">${formatRupees(fees)}</span>
      </div>
      <div style="display: flex; justify-content: space-between; gap: 12px; border-top: 1px solid ${theme.border}; padding-top: 4px;">
        <span style="color: ${theme.mutedColor}; font-weight: 500;">Fee burden:</span>
        <span style="font-weight: 700; color: ${theme.textColor};">${Number(feePercent).toFixed(1)}%</span>
      </div>
    </div>
  `.trim();
}

/**
 * Pure option builder (CC-11):
 * Data in, ECharts Core Option out.
 */
export function buildFeeScatterOption({
  data,
  theme,
  prefersReducedMotion = false,
}: BuildFeeScatterOptionParams): EChartsCoreOption {
  const currentTheme = theme ?? resolveChartTheme("light", "emerald");
  const items = data ?? [];

  const validPoints = items.filter(
    (d) =>
      d &&
      typeof d.amount === "number" &&
      Number.isFinite(d.amount) &&
      d.amount > 0 &&
      typeof d.fee_percent === "number" &&
      Number.isFinite(d.fee_percent)
  );

  let minAmount = Infinity;
  let maxAmount = -Infinity;
  for (const p of validPoints) {
    if (p.amount < minAmount) minAmount = p.amount;
    if (p.amount > maxAmount) maxAmount = p.amount;
  }
  if (!Number.isFinite(minAmount)) {
    minAmount = 0;
    maxAmount = 1;
  }

  const primaryColor = currentTheme.colors[0];
  const trendlineColor = currentTheme.colors[1] ?? currentTheme.mutedColor;

  const trendline = computeTrendline(validPoints);

  const scatterSeries: ScatterSeriesOption = {
    name: "Orders",
    type: "scatter",
    data: validPoints.map((d) => [d.amount, d.fee_percent, d.fees]),
    symbolSize: (val: any) => {
      const amt = Array.isArray(val) ? val[0] : typeof val === "number" ? val : 0;
      return computeSymbolSize(amt, minAmount, maxAmount);
    },
    itemStyle: {
      color: primaryColor,
      opacity: 0.75,
      borderColor: primaryColor,
      borderWidth: 1.5,
    },
    emphasis: {
      itemStyle: {
        borderColor: primaryColor,
        borderWidth: 2.5,
        shadowBlur: 8,
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
      decal: { show: true },
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
      formatter: (params: unknown) => formatFeeScatterTooltip(params, currentTheme),
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
      data: trendline ? ["Orders", "Trendline"] : ["Orders"],
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
      name: "Order amount",
      nameLocation: "middle",
      nameGap: 28,
      nameTextStyle: {
        color: currentTheme.mutedColor,
        fontSize: 11,
        fontFamily: '"Inter Variable", sans-serif',
      },
      axisLabel: {
        color: currentTheme.mutedColor,
        fontSize: 10,
        fontFamily: '"Inter Variable", sans-serif',
        formatter: (val: number) => formatRupees(val),
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
      name: "Fee (%)",
      nameLocation: "end",
      nameTextStyle: {
        color: currentTheme.mutedColor,
        fontSize: 11,
        fontFamily: '"Inter Variable", sans-serif',
      },
      axisLabel: {
        color: currentTheme.mutedColor,
        fontSize: 10,
        fontFamily: '"Inter Variable", sans-serif',
        formatter: (val: number) => `${val}%`,
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
    animation: !prefersReducedMotion,
    animationDuration: prefersReducedMotion ? 0 : 600,
    animationDurationUpdate: prefersReducedMotion ? 0 : 250,
    animationEasing: "cubicOut",
  };
}

export function FeeScatterChart({
  data,
  isLoading,
  isEmpty: isEmptyProp,
  emptyReason,
  error,
  onRetry,
  className,
  title = "Fee burden vs order value",
  subtitle = "Observed fee percentage relative to order amount with trendline",
  caption: captionProp,
  onPointClick,
  showTable,
  onShowTableChange,
  fullscreen,
  onFullscreenChange,
}: FeeScatterChartProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const chartRef = React.useRef<echarts.ECharts | null>(null);
  const navigate = useOptionalNavigate();
  const location = useOptionalLocation();

  const validPoints = React.useMemo(() => {
    return (data ?? []).filter(
      (d) =>
        d &&
        typeof d.amount === "number" &&
        Number.isFinite(d.amount) &&
        d.amount > 0 &&
        typeof d.fee_percent === "number" &&
        Number.isFinite(d.fee_percent)
    );
  }, [data]);

  const excludedCount = (data ?? []).length - validPoints.length;

  const computedCaption = React.useMemo(() => {
    return captionProp ?? (computeFeeScatterTakeaway(validPoints) ?? undefined);
  }, [captionProp, validPoints]);

  const isEmpty =
    isEmptyProp ?? (!isLoading && (!data || data.length === 0 || validPoints.length === 0));
  const resolvedEmptyReason =
    emptyReason ?? "No fee scatter data available for the selected filters";

  const tableData = React.useMemo(() => {
    if (!validPoints || validPoints.length === 0) return undefined;
    return validPoints.map((d) => {
      const amt = d.amount;
      const fees = Number.isFinite(d.fees) ? d.fees : (amt * (d.fee_percent ?? 0)) / 100;
      const feePct = d.fee_percent != null ? Number(d.fee_percent.toFixed(1)) : 0;
      return {
        "Order amount": formatRupees(amt),
        Fees: formatRupees(fees),
        "Fee %": `${feePct}%`,
      };
    });
  }, [validPoints]);

  const ariaDescription = React.useMemo(() => {
    if (validPoints.length === 0) {
      return "Fee burden vs order value scatter plot with no valid data points";
    }
    const trendline = computeTrendline(validPoints);
    const trendStr = trendline
      ? ` with linear regression slope of ${trendline.slope >= 0 ? "+" : ""}${trendline.slope.toFixed(4)}`
      : "";
    return `Scatter plot displaying ${validPoints.length} orders plotting fee percentage against order amount${trendStr}. Point size is scaled by order value.`;
  }, [validPoints]);

  const handlePointClick = React.useCallback(
    (point: FeeScatterDatum) => {
      if (onPointClick) {
        onPointClick(point);
        return;
      }
      if (point.order_id != null && navigate) {
        const search = location?.search ?? "";
        const params = new URLSearchParams(search);
        params.set("order", String(point.order_id));
        const searchStr = params.toString();
        navigate({
          pathname: "/orders",
          search: searchStr ? `?${searchStr}` : "",
        });
        return;
      }
      // Scenario: Click / DEC-044
      // If no order id exists in the data, navigate to Orders filtered by amount
      if (navigate && Number.isFinite(point.amount)) {
        const search = location?.search ?? "";
        const params = new URLSearchParams(search);
        const minAmount = Math.floor(point.amount);
        const maxAmount = Math.ceil(point.amount);
        params.set("amount_min", String(minAmount));
        params.set("amount_max", String(maxAmount));
        const searchStr = params.toString();
        navigate({
          pathname: "/orders",
          search: searchStr ? `?${searchStr}` : "",
        });
      }
    },
    [onPointClick, navigate, location]
  );

  React.useEffect(() => {
    const node = containerRef.current;
    if (!node || isEmpty || isLoading || error) return;

    registerFeeScatterModules();

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
  }, [isEmpty, isLoading, error, validPoints, handlePointClick]);

  React.useEffect(() => {
    function applyUpdate() {
      const chart = chartRef.current;
      if (!chart || chart.isDisposed()) return;
      const theme = getCurrentChartTheme();
      const prefersReducedMotion =
        typeof window !== "undefined" &&
        window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      const opt = buildFeeScatterOption({
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

  const infoPopover = (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Fee burden scatter information"
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
          <p className="font-semibold text-foreground text-sm">Fee Burden vs Order Value</p>
          <p className="text-muted-foreground mt-0.5 leading-relaxed">
            Plots the fee percentage of order value against total order amount, showing how delivery, packaging, and platform fees impact orders of different sizes.
          </p>
        </div>
        <div className="space-y-1.5 pt-1 border-t border-border/50">
          <p className="font-medium text-foreground">Point Sizing & Fee Calculation</p>
          <p className="text-muted-foreground leading-relaxed">
            Fee percentage is calculated as total fees divided by order amount. Point bubble size is dynamically scaled from 6px to 22px proportional to order value.
          </p>
        </div>
        <div className="space-y-1.5 pt-1 border-t border-border/50">
          <p className="font-medium text-foreground">Linear Trendline Regression</p>
          <p className="text-muted-foreground leading-relaxed">
            The dashed line illustrates ordinary least squares linear regression (y = mx + b) across valid orders, highlighting overall fee burden trajectory.
          </p>
        </div>
        <div className="space-y-1.5 pt-1 border-t border-border/50">
          <p className="font-medium text-foreground">Interactive Filtering (DEC-044)</p>
          <p className="text-muted-foreground leading-relaxed">
            Clicking any point navigates to Orders with an amount filter bracketing the clicked order value while preserving active global filters.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );

  return (
    <ChartCard
      title={title}
      subtitle={subtitle}
      caption={computedCaption}
      infoPopover={infoPopover}
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
        aria-label={title}
        aria-description={ariaDescription}
        style={{ height: 320, width: "100%" }}
      />
      {excludedCount > 0 && (
        <p className="text-xs text-muted-foreground mt-2">
          {`${excludedCount} ${excludedCount === 1 ? "order" : "orders"} with undefined fee ratios excluded.`}
        </p>
      )}
    </ChartCard>
  );
}

export default FeeScatterChart;
