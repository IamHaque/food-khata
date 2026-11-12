import { getPatterns } from "../../app/theme";
import { compactInr } from "../../lib/chart-kit";
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
import { useNavigate, useLocation } from "react-router-dom";
import { Info } from "lucide-react";

import { ChartCard } from "../dashboard/ChartCard";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import {
  getCurrentChartTheme,
  buildBaseChartOption,
  resolveChartTheme,
  type ChartTheme,
} from "../../lib/chart-theme";
import {
  computeBillWaterfallTakeaway,
  formatRupees,
  type WaterfallStepLike,
  type CostWaterfallLike,
} from "../../lib/captions";
import { subscribeTheme } from "../../app/theme";

export interface WaterfallStep {
  label: string;
  amount: number;
  baseline: number;
  height: number;
  direction: "up" | "down" | "total";
}

export interface CostWaterfallData {
  subtotal: number;
  food_discount: number;
  net_delivery: number;
  packaging: number;
  platform: number;
  tax: number;
  tip: number;
  other: number;
  residual: number;
  provider_paid: number;
  refunds: number;
}

export interface BuildBillWaterfallOptionParams {
  steps?: readonly WaterfallStep[] | null;
  costWaterfall?: CostWaterfallData | null;
  theme?: ChartTheme;
  prefersReducedMotion?: boolean;
  compact?: boolean;
}

export interface BillWaterfallChartProps {
  steps?: WaterfallStep[] | null;
  costWaterfall?: CostWaterfallData | null;
  data?: {
    waterfall_steps?: WaterfallStep[];
    cost_waterfall?: CostWaterfallData;
  } | null;
  isLoading?: boolean;
  isEmpty?: boolean;
  emptyReason?: string;
  error?: Error | string | null;
  onRetry?: () => void;
  className?: string;
  title?: string;
  subtitle?: string;
  caption?: string;
  onStepClick?: (step: WaterfallStep) => void;
  showTable?: boolean;
  onShowTableChange?: (value: boolean) => void;
  fullscreen?: boolean;
  onFullscreenChange?: (value: boolean) => void;
}

let echartsRegistered = false;
function registerWaterfallModules() {
  if (echartsRegistered) return;
  echarts.use([
    BarChart,
    GridComponent,
    TooltipComponent,
    LegendComponent,
    AriaComponent,
    CanvasRenderer,
  ]);
  echartsRegistered = true;
}
registerWaterfallModules();

export function humanizeLabel(raw: string): string {
  const norm = raw.trim().toLowerCase().replace(/_/g, " ");
  if (norm === "subtotal") return "Subtotal";
  if (norm === "food discount") return "Food discount";
  if (norm === "net delivery" || norm === "delivery") return "Net delivery";
  if (norm === "packaging") return "Packaging";
  if (norm === "platform") return "Platform fee";
  if (norm === "tax" || norm === "taxes") return "Taxes";
  if (norm === "tip") return "Tip";
  if (norm === "other") return "Other charges";
  if (norm === "residual") return "Residual / Rounding";
  if (norm === "provider paid" || norm === "final paid") return "Final paid";
  return norm.charAt(0).toUpperCase() + norm.slice(1);
}

/**
 * Derives waterfall steps from costWaterfall object if steps are not directly provided (CC-1).
 */
export function deriveWaterfallSteps(costWaterfall: CostWaterfallData): WaterfallStep[] {
  const steps: WaterfallStep[] = [];
  let running = 0;
  const order: (keyof CostWaterfallData)[] = [
    "subtotal",
    "food_discount",
    "net_delivery",
    "packaging",
    "platform",
    "tax",
    "tip",
    "other",
    "residual",
  ];

  for (const key of order) {
    const val = costWaterfall[key];
    const amount = typeof val === "number" && Number.isFinite(val) ? val : 0;
    if (amount === 0 && key !== "subtotal") continue;

    const endpoint = Math.round((running + amount) * 100) / 100;
    steps.push({
      label: key.replace(/_/g, " "),
      amount,
      baseline: Math.min(running, endpoint),
      height: Math.abs(amount),
      direction: amount >= 0 ? "up" : "down",
    });
    running = endpoint;
  }

  const providerPaid =
    typeof costWaterfall.provider_paid === "number" && Number.isFinite(costWaterfall.provider_paid)
      ? costWaterfall.provider_paid
      : running;

  steps.push({
    label: "Final paid",
    amount: providerPaid,
    baseline: Math.min(0, providerPaid),
    height: Math.abs(providerPaid),
    direction: "total",
  });

  return steps;
}

export function formatWaterfallTooltip(
  step: WaterfallStep,
  theme: ChartTheme,
): string {
  const dirSymbol = step.direction === "down" ? "-" : step.direction === "total" ? "=" : "+";
  const dirLabel =
    step.direction === "down"
      ? "Reduction / Discount"
      : step.direction === "total"
      ? "Final Paid Total"
      : "Addition / Fee";

  const runningBal =
    step.direction === "total"
      ? step.amount
      : step.baseline + (step.direction === "down" ? -step.height : step.height);

  const formattedAmount = `${step.amount < 0 ? "-" : ""}${formatRupees(Math.abs(step.amount))}`;

  return `
    <div style="font-family: inherit; font-size: 12px; line-height: 1.5; min-width: 170px;">
      <div style="font-weight: 600; margin-bottom: 6px; border-bottom: 1px solid ${theme.border}; padding-bottom: 4px;">
        ${humanizeLabel(step.label)}
      </div>
      <div style="display: flex; justify-content: space-between; gap: 12px; margin-bottom: 2px;">
        <span style="color: ${theme.mutedColor};">Type:</span>
        <span style="font-weight: 600;">${dirSymbol} ${dirLabel}</span>
      </div>
      <div style="display: flex; justify-content: space-between; gap: 12px; margin-bottom: 2px;">
        <span style="color: ${theme.mutedColor};">Amount:</span>
        <span style="font-weight: 600;">${formattedAmount}</span>
      </div>
      <div style="display: flex; justify-content: space-between; gap: 12px;">
        <span style="color: ${theme.mutedColor};">Running Balance:</span>
        <span style="font-weight: 600;">${formatRupees(runningBal)}</span>
      </div>
    </div>
  `.trim();
}

/**
 * Pure option builder (CC-11):
 * Data in, ECharts Core Option out.
 */
export function buildBillWaterfallOption({
  steps,
  costWaterfall,
  theme,
  prefersReducedMotion = false,
  compact = false,
}: BuildBillWaterfallOptionParams): EChartsCoreOption {
  const currentTheme = theme ?? resolveChartTheme("light", "emerald");

  let resolvedSteps: WaterfallStep[] = [];
  if (steps && steps.length > 0) {
    resolvedSteps = [...steps];
  } else if (costWaterfall) {
    resolvedSteps = deriveWaterfallSteps(costWaterfall);
  }

  const baseOption = buildBaseChartOption(currentTheme, prefersReducedMotion);
  const labels = resolvedSteps.map((s) => humanizeLabel(s.label));
  const baselines = resolvedSteps.map((s) => s.baseline);

  const seriesData = resolvedSteps.map((s) => {
    let barColor = currentTheme.colors[1] ?? currentTheme.colors[0]; // up / additions
    if (s.direction === "down") {
      barColor = currentTheme.success ?? currentTheme.colors[0]; // reductions / discounts
    } else if (s.direction === "total") {
      barColor = currentTheme.primary ?? currentTheme.colors[0]; // final total
    }

    return {
      name: humanizeLabel(s.label),
      value: s.height,
      step: s,
      itemStyle: {
        color: barColor,
        borderRadius: s.direction === "total" ? [4, 4, 0, 0] : 3,
      },
    };
  });

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
        fontSize: 12,
        fontFamily: '"Inter Variable", sans-serif',
      },
      formatter: (params: unknown) => {
        if (!Array.isArray(params) || params.length === 0) return "";
        const p = params.find((item: any) => item.seriesIndex === 1) || params[0];
        const idx = (p as any).dataIndex ?? 0;
        const step = resolvedSteps[idx];
        if (!step) return "";
        return formatWaterfallTooltip(step, currentTheme);
      },
    },
    grid: {
      left: 16,
      right: 16,
      top: 28,
      bottom: 8,
      containLabel: true,
    },
    // Wide: steps run left to right with wrapped (never rotated) labels. Narrow: steps run top to bottom.
    [compact ? "yAxis" : "xAxis"]: {
      type: "category",
      data: labels,
      inverse: compact,
      axisLabel: {
        color: currentTheme.mutedColor,
        fontSize: 11,
        fontFamily: '"Inter Variable", sans-serif',
        interval: 0,
        rotate: 0,
        width: compact ? 96 : 72,
        overflow: "break",
      },
      axisLine: {
        lineStyle: {
          color: currentTheme.axisLine,
        },
      },
      axisTick: {
        alignWithLabel: true,
      },
    },
    [compact ? "xAxis" : "yAxis"]: {
      type: "value",
      axisLabel: {
        color: currentTheme.mutedColor,
        fontSize: 11,
        fontFamily: '"Inter Variable", sans-serif',
        formatter: (val: number) => compactInr(val),
      },
      splitLine: {
        lineStyle: {
          color: currentTheme.splitLine,
        },
      },
    },
    series: [
      {
        name: "Baseline",
        type: "bar",
        stack: "waterfall",
        itemStyle: {
          borderColor: "transparent",
          color: "transparent",
        },
        emphasis: {
          itemStyle: {
            borderColor: "transparent",
            color: "transparent",
          },
        },
        data: baselines,
        silent: true,
      },
      {
        name: "Amount",
        type: "bar",
        stack: "waterfall",
        barMaxWidth: 38,
        label: {
          show: true,
          position: compact ? "right" : "top",
          formatter: (p: any) => {
            const step = resolvedSteps[p.dataIndex];
            if (!step) return "";
            const sign = step.direction === "down" ? "-" : step.direction === "total" ? "=" : "+";
            return `${sign}${formatRupees(Math.abs(step.amount))}`;
          },
          fontSize: 11,
          color: currentTheme.textColor,
          fontFamily: '"Inter Variable", sans-serif',
        },
        data: seriesData,
        animationDelay: (idx: number) => (prefersReducedMotion ? 0 : idx * 60),
      },
    ],
    animation: !prefersReducedMotion,
    animationDuration: prefersReducedMotion ? 0 : 600,
    animationDurationUpdate: prefersReducedMotion ? 0 : 250,
    animationEasing: "cubicOut",
  };
}

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

export function BillWaterfallChart({
  steps: stepsProp,
  costWaterfall: costWaterfallProp,
  data: dataProp,
  isLoading,
  isEmpty: isEmptyProp,
  emptyReason,
  error,
  onRetry,
  className,
  title = "Bill waterfall",
  subtitle = "Step-by-step breakdown from item subtotal to final paid",
  caption: captionProp,
  onStepClick,
  showTable,
  onShowTableChange,
  fullscreen,
  onFullscreenChange,
}: BillWaterfallChartProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const chartRef = React.useRef<echarts.ECharts | null>(null);
  const [compact, setCompact] = React.useState(false);

  const navigate = useOptionalNavigate();
  const location = useOptionalLocation();

  const resolvedSteps = React.useMemo(() => {
    if (stepsProp && stepsProp.length > 0) return stepsProp;
    if (dataProp?.waterfall_steps && dataProp.waterfall_steps.length > 0) {
      return dataProp.waterfall_steps;
    }
    const cw = costWaterfallProp ?? dataProp?.cost_waterfall;
    if (cw) return deriveWaterfallSteps(cw);
    return [];
  }, [stepsProp, dataProp, costWaterfallProp]);

  const resolvedCostWaterfall = costWaterfallProp ?? dataProp?.cost_waterfall ?? null;

  const providerPaid = React.useMemo(() => {
    if (
      resolvedCostWaterfall &&
      typeof resolvedCostWaterfall.provider_paid === "number" &&
      Number.isFinite(resolvedCostWaterfall.provider_paid)
    ) {
      return resolvedCostWaterfall.provider_paid;
    }
    const totalStep = resolvedSteps.find((s) => s.direction === "total");
    if (totalStep && Number.isFinite(totalStep.amount)) {
      return totalStep.amount;
    }
    return null;
  }, [resolvedCostWaterfall, resolvedSteps]);

  const computedCaption = React.useMemo(() => {
    return (
      captionProp ??
      (computeBillWaterfallTakeaway(
        resolvedSteps as readonly WaterfallStepLike[],
        resolvedCostWaterfall as CostWaterfallLike,
      ) ??
        undefined)
    );
  }, [captionProp, resolvedSteps, resolvedCostWaterfall]);

  const isEmpty = isEmptyProp ?? (!isLoading && resolvedSteps.length === 0);
  const resolvedEmptyReason =
    emptyReason ?? "No waterfall bill breakdown data available for the selected filters";

  const tableData = React.useMemo(() => {
    if (!resolvedSteps || resolvedSteps.length === 0) return undefined;
    return resolvedSteps.map((s) => {
      const directionIndicator =
        s.direction === "up" ? "+ Addition" : s.direction === "down" ? "- Reduction" : "= Total";
      const runningBalance =
        s.direction === "total"
          ? s.amount
          : s.baseline + (s.direction === "down" ? -s.height : s.height);
      const formattedAmount =
        s.direction === "down"
          ? `-₹${Math.abs(s.amount).toLocaleString("en-IN")}`
          : s.direction === "total"
          ? `₹${s.amount.toLocaleString("en-IN")}`
          : `+₹${Math.abs(s.amount).toLocaleString("en-IN")}`;

      return {
        Step: humanizeLabel(s.label),
        "Type/Direction": directionIndicator,
        Amount: formattedAmount,
        "Running balance": `₹${Math.round(runningBalance).toLocaleString("en-IN")}`,
      };
    });
  }, [resolvedSteps]);

  const ariaDescription = React.useMemo(() => {
    if (!resolvedSteps || resolvedSteps.length === 0) {
      return "Bill waterfall chart with no data";
    }
    const stepSummary = resolvedSteps
      .map((s) => {
        const sign = s.direction === "down" ? "-" : s.direction === "total" ? "=" : "+";
        return `${humanizeLabel(s.label)} (${sign}₹${Math.abs(s.amount).toLocaleString("en-IN")})`;
      })
      .join(", ");
    const paidStr = providerPaid != null ? ` Final paid total: ${formatRupees(providerPaid)}.` : "";
    return `Bill waterfall chart showing breakdown from subtotal to final paid: ${stepSummary}.${paidStr}`;
  }, [resolvedSteps, providerPaid]);

  const handleStepClick = React.useCallback(
    (step: WaterfallStep) => {
      if (onStepClick) {
        onStepClick(step);
        return;
      }
      if (navigate) {
        const search = location?.search ?? "";
        const params = new URLSearchParams(search);
        if (step.label.toLowerCase().includes("residual")) {
          params.set("anomaly", "review");
        }
        const searchStr = params.toString();
        navigate({
          pathname: "/orders",
          search: searchStr ? `?${searchStr}` : "",
        });
      }
    },
    [onStepClick, navigate, location],
  );

  React.useEffect(() => {
    const node = containerRef.current;
    if (!node || isEmpty || isLoading || error) return;

    registerWaterfallModules();

    if (!chartRef.current) {
      chartRef.current = echarts.init(node);
    }
    const chart = chartRef.current;

    const handleClick = (params: unknown) => {
      const p = params as { dataIndex?: number };
      if (p && typeof p.dataIndex === "number" && resolvedSteps[p.dataIndex]) {
        handleStepClick(resolvedSteps[p.dataIndex]);
      }
    };

    chart.on("click", handleClick);

    const resizeObserver = new ResizeObserver(() => {
      if (chart && !chart.isDisposed()) {
        chart.resize();
      }
      setCompact(node.clientWidth < 560);
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
  }, [isEmpty, isLoading, error, resolvedSteps, handleStepClick]);

  React.useEffect(() => {
    function applyUpdate() {
      const chart = chartRef.current;
      if (!chart || chart.isDisposed()) return;
      const theme = getCurrentChartTheme();
      const prefersReducedMotion =
        typeof window !== "undefined" &&
        window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      const opt = buildBillWaterfallOption({
        steps: resolvedSteps,
        costWaterfall: resolvedCostWaterfall,
        theme,
        prefersReducedMotion,
        compact,
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
  }, [resolvedSteps, resolvedCostWaterfall, compact, isEmpty, isLoading, error, handleStepClick]);

  const infoPopover = (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Bill waterfall breakdown information and provider reconciliation"
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
          <p className="font-semibold text-foreground text-sm">Bill Waterfall Breakdown</p>
          <p className="text-muted-foreground mt-0.5 leading-relaxed">
            Shows how your final paid amount is composed step-by-step from raw food item subtotal.
          </p>
        </div>
        <div className="space-y-1.5 pt-1 border-t border-border/50">
          <p className="font-medium text-foreground">Components & Fees</p>
          <p className="text-muted-foreground leading-relaxed">
            Food discounts reduce the bill (<span className="text-success font-medium">-</span>), while
            delivery, packaging, platform fees, taxes, and tips add to it (<span className="text-primary font-medium">+</span>).
          </p>
        </div>
        <div className="space-y-1.5 pt-1 border-t border-border/50">
          <p className="font-medium text-foreground">Residual & Rounding</p>
          <p className="text-muted-foreground leading-relaxed">
            Discrepancies between itemized charges and provider final charge are tracked separately as residual.
          </p>
        </div>
        <div className="space-y-1.5 pt-1 border-t border-border/50">
          <p className="font-medium text-foreground">Provider Reconciliation</p>
          <p className="text-muted-foreground leading-relaxed">
            Provider-paid total is recorded by platform (Swiggy / Zomato); bill components may not reconcile mathematically.
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
      <div className="space-y-3">
        {providerPaid != null && (
          <div
            data-testid="provider-paid-callout"
            className="rounded-lg border bg-muted px-3.5 py-2.5 text-sm flex flex-wrap items-center justify-between gap-2"
          >
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground font-medium">Provider-paid total:</span>
              <span className="font-semibold text-foreground text-sm tabular-nums">
                {formatRupees(providerPaid)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground leading-normal max-w-lg">
              Provider-paid total is recorded by platform; bill components may not reconcile mathematically (residual is tracked separately).
            </p>
          </div>
        )}

        <div
          ref={containerRef}
          role="img"
          aria-label={ariaDescription}
          tabIndex={0}
          style={{ height: compact ? 460 : 350, width: "100%", minHeight: 300 }}
          className="cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring rounded-md"
        />
      </div>
    </ChartCard>
  );
}

export default BillWaterfallChart;
