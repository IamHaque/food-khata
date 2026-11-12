import * as React from "react";
import * as echarts from "echarts/core";
import type { EChartsCoreOption } from "echarts/core";

import { ChartCard, type ChartCardProps } from "./ChartCard";
import { getCurrentChartTheme, type ChartTheme } from "../../lib/chart-theme";
import {
  registerChart,
  emitHighlight,
  emitClear,
  type HighlightMatcher,
  type ChartRegistrationOptions,
} from "../../lib/highlight-bus";
import { useFilters } from "../../app/FilterContext";
import { getPatterns, subscribeTheme } from "../../app/theme";
import type { CrossFilterDimension } from "../../lib/crossfilter";

export function useOptionalFilters() {
  try {
    return useFilters();
  } catch {
    return null;
  }
}

export interface BaseChartSpecContext {
  prefersReducedMotion: boolean;
  theme: ChartTheme;
  container: HTMLDivElement | null;
  chart: echarts.ECharts | null;
}

export type BaseChartSpec<TData = any> =
  | EChartsCoreOption
  | ((theme: ChartTheme, context: BaseChartSpecContext) => EChartsCoreOption)
  | ((data: TData, theme: ChartTheme, context: BaseChartSpecContext) => EChartsCoreOption);

export interface BaseChartProps<TData = any>
  extends Omit<ChartCardProps, "children"> {
  // Data and Option Spec
  data?: TData;
  spec: BaseChartSpec<TData>;

  // Selection / Click / Cross-filtering
  onSelect?: (value: any, isMulti?: boolean, params?: any) => void;
  onClick?: (params: any, chart: echarts.ECharts) => void;
  crossFilterDimension?: CrossFilterDimension | string;
  getCrossFilterValue?: (params: any) => string | undefined;

  // Highlight bus / linked hover
  chartId?: string;
  highlightDimension?: string;
  getHighlightValue?: (params: any) => string | undefined;
  highlightMatcher?: HighlightMatcher | ChartRegistrationOptions;
  onHover?: (params: any, chart: echarts.ECharts) => void;
  onHoverOut?: (chart: echarts.ECharts) => void;

  // ECharts lifecycle options
  notMerge?: boolean;
  lazyUpdate?: boolean;
  registerModules?: () => void;
  onChartReady?: (chart: echarts.ECharts) => void;
  chartInstanceRef?: React.MutableRefObject<echarts.ECharts | null>;

  // Visual container and accessibility
  chartHeight?: number | string;
  chartWidth?: number | string;
  chartMinHeight?: number | string;
  chartStyle?: React.CSSProperties;
  chartClassName?: string;
  ariaLabel?: string | ((data?: TData) => string);
  ariaDescription?: string | ((data?: TData) => string);
  tabIndex?: number;

  // Header / Footer / Custom Controls inside CardContent
  headerControls?: React.ReactNode;
  footerControls?: React.ReactNode;
  children?: React.ReactNode;
  chartWrapper?: (chartNode: React.ReactNode) => React.ReactNode;
}

export function BaseChart<TData = any>({
  // ChartCard props
  title,
  subtitle,
  caption,
  infoPopover,
  isLoading,
  isEmpty,
  emptyReason,
  error,
  onRetry,
  tableData,
  tableHeaders,
  tableRows,
  onExportCsv,
  onExportPng,
  showTable,
  onShowTableChange,
  fullscreen,
  onFullscreenChange,
  className,

  // BaseChart specific props
  data,
  spec,
  onSelect,
  onClick,
  crossFilterDimension,
  getCrossFilterValue,
  chartId: chartIdProp,
  highlightDimension,
  getHighlightValue,
  highlightMatcher,
  onHover,
  onHoverOut,
  notMerge = true,
  lazyUpdate = true,
  registerModules,
  onChartReady,
  chartInstanceRef,
  chartHeight = 320,
  chartWidth = "100%",
  chartMinHeight = 280,
  chartStyle,
  chartClassName,
  ariaLabel,
  ariaDescription,
  tabIndex = 0,
  headerControls,
  footerControls,
  children,
  chartWrapper,
}: BaseChartProps<TData>) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const chartRef = React.useRef<echarts.ECharts | null>(null);
  const idRef = React.useRef(
    chartIdProp || `chart-${Math.random().toString(36).slice(2, 9)}`
  );
  const chartId = chartIdProp || idRef.current;

  const filters = useOptionalFilters();

  // Stable callback refs so changes never cause chart recreation
  const onSelectRef = React.useRef(onSelect);
  const onClickRef = React.useRef(onClick);
  const getCrossFilterValueRef = React.useRef(getCrossFilterValue);
  const getHighlightValueRef = React.useRef(getHighlightValue);
  const onHoverRef = React.useRef(onHover);
  const onHoverOutRef = React.useRef(onHoverOut);
  const onChartReadyRef = React.useRef(onChartReady);
  const filtersRef = React.useRef(filters);
  const registerModulesRef = React.useRef(registerModules);

  React.useEffect(() => {
    onSelectRef.current = onSelect;
    onClickRef.current = onClick;
    getCrossFilterValueRef.current = getCrossFilterValue;
    getHighlightValueRef.current = getHighlightValue;
    onHoverRef.current = onHover;
    onHoverOutRef.current = onHoverOut;
    onChartReadyRef.current = onChartReady;
    filtersRef.current = filters;
    registerModulesRef.current = registerModules;
  });

  const computeOption = React.useCallback(
    (theme: ChartTheme, prefersReducedMotion: boolean): EChartsCoreOption => {
      const ctx: BaseChartSpecContext = {
        prefersReducedMotion,
        theme,
        container: containerRef.current,
        chart: chartRef.current,
      };
      if (typeof spec === "function") {
        if (data !== undefined) {
          return (spec as (d: TData, t: ChartTheme, c: BaseChartSpecContext) => EChartsCoreOption)(
            data,
            theme,
            ctx
          );
        }
        if (spec.length === 1) {
          return (spec as (t: ChartTheme, c: BaseChartSpecContext) => EChartsCoreOption)(
            theme,
            ctx
          );
        }
        return (spec as any)(data, theme, ctx);
      }
      return spec;
    },
    [spec, data]
  );

  const applyOption = React.useCallback(() => {
    const chart = chartRef.current;
    if (!chart || chart.isDisposed()) return;
    const theme = getCurrentChartTheme();
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const built = computeOption(theme, prefersReducedMotion) as { aria?: { decal?: unknown } };
    // Every chart honours "Accessible patterns"; a chart that sets its own aria.decal keeps it.
    const option = built.aria?.decal ? built : { ...built, aria: { enabled: true, ...built.aria, decal: { show: getPatterns() } } };
    chart.setOption(option as EChartsCoreOption, {
      notMerge,
      lazyUpdate,
    });
  }, [computeOption, notMerge, lazyUpdate]);

  // Main lifecycle effect: init, event listeners, resize observer, disposal
  React.useEffect(() => {
    const node = containerRef.current;
    if (!node || isEmpty || isLoading || Boolean(error)) return;

    registerModulesRef.current?.();

    if (!chartRef.current || chartRef.current.isDisposed()) {
      chartRef.current = echarts.init(node);
      if (chartInstanceRef) {
        chartInstanceRef.current = chartRef.current;
      }
      onChartReadyRef.current?.(chartRef.current);
    }
    const chart = chartRef.current;

    const resolvedMatcher =
      highlightMatcher ??
      (highlightDimension ? { dimension: highlightDimension } : () => undefined);

    const unregister = registerChart(chartId, chart, resolvedMatcher);

    const handleMouseOver = (params: any) => {
      onHoverRef.current?.(params, chart);
      if (highlightDimension) {
        const val = getHighlightValueRef.current
          ? getHighlightValueRef.current(params)
          : (params?.name ?? (typeof params?.value === "string" ? params?.value : undefined));
        if (val != null) {
          emitHighlight(chartId, highlightDimension, String(val));
        }
      }
    };

    const handleMouseOut = () => {
      onHoverOutRef.current?.(chart);
      if (highlightDimension) {
        emitClear(chartId);
      }
    };

    const handleClick = (params: any) => {
      const isMulti = Boolean(params?.event?.event?.shiftKey);
      const chartInstance = chartRef.current;
      if (!chartInstance) return;

      const val = getCrossFilterValueRef.current
        ? getCrossFilterValueRef.current(params)
        : (params?.name ?? params?.value);

      if (crossFilterDimension && filtersRef.current && val != null) {
        filtersRef.current.applyCrossFilter(
          crossFilterDimension as CrossFilterDimension,
          String(val),
          isMulti
        );
      }

      const selection = val ?? params;
      onSelectRef.current?.(selection, isMulti, params);
      onClickRef.current?.(params, chartInstance);
    };

    chart.on("mouseover", handleMouseOver);
    chart.on("mouseout", handleMouseOut);
    chart.on("globalout", handleMouseOut);
    chart.on("click", handleClick);

    const resizeObserver = new ResizeObserver(() => {
      if (chart && !chart.isDisposed()) {
        chart.resize();
      }
    });
    resizeObserver.observe(node);

    // Initial render of options
    applyOption();

    return () => {
      chart.off("mouseover", handleMouseOver);
      chart.off("mouseout", handleMouseOut);
      chart.off("globalout", handleMouseOut);
      chart.off("click", handleClick);
      unregister();
      resizeObserver.disconnect();
      if (chartRef.current) {
        chartRef.current.dispose();
        chartRef.current = null;
        if (chartInstanceRef) {
          chartInstanceRef.current = null;
        }
      }
    };
  }, [
    chartId,
    isEmpty,
    isLoading,
    Boolean(error),
    highlightDimension,
    crossFilterDimension,
    chartInstanceRef,
    // Note: applyOption is invoked imperatively inside, but we avoid putting
    // applyOption in deps so callback or option updates never dispose/recreate the chart.
  ]);

  // Option updates when spec, data, or settings change (without re-creating chart)
  React.useEffect(() => {
    if (isEmpty || isLoading || Boolean(error)) return;
    applyOption();
  }, [isEmpty, isLoading, Boolean(error), applyOption]);

  // Theme updates subscription & HTML attribute mutations
  React.useEffect(() => {
    if (isEmpty || isLoading || Boolean(error)) return;

    applyOption();

    const unsubscribe = subscribeTheme(() => {
      applyOption();
    });

    const observer = new MutationObserver(() => {
      applyOption();
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
  }, [isEmpty, isLoading, Boolean(error), applyOption]);

  const resolvedAriaLabel =
    typeof ariaLabel === "function"
      ? ariaLabel(data)
      : (ariaLabel ?? title ?? "Chart");

  const resolvedAriaDescription =
    typeof ariaDescription === "function"
      ? ariaDescription(data)
      : ariaDescription;

  const chartContainer = (
    <div
      ref={containerRef}
      role="img"
      aria-label={resolvedAriaLabel}
      aria-description={resolvedAriaDescription}
      tabIndex={tabIndex ?? 0}
      style={{
        height: chartHeight ?? 320,
        width: chartWidth ?? "100%",
        minHeight: chartMinHeight ?? 280,
        ...chartStyle,
      }}
      className={
        chartClassName ??
        "cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring rounded-md"
      }
    />
  );

  const effectiveChartNode = chartWrapper
    ? chartWrapper(chartContainer)
    : chartContainer;

  const content =
    headerControls || children || footerControls ? (
      <div className="flex flex-col gap-3">
        {headerControls && (
          <div className="flex items-center justify-between">
            {headerControls}
          </div>
        )}
        {children}
        {effectiveChartNode}
        {footerControls}
      </div>
    ) : (
      effectiveChartNode
    );

  return (
    <ChartCard
      title={title}
      subtitle={subtitle}
      caption={caption}
      infoPopover={infoPopover}
      isLoading={isLoading}
      isEmpty={isEmpty}
      emptyReason={emptyReason}
      error={error}
      onRetry={onRetry}
      tableData={tableData}
      tableHeaders={tableHeaders}
      tableRows={tableRows}
      onExportCsv={onExportCsv}
      onExportPng={onExportPng}
      showTable={showTable}
      onShowTableChange={onShowTableChange}
      fullscreen={fullscreen}
      onFullscreenChange={onFullscreenChange}
      className={className}
    >
      {content}
    </ChartCard>
  );
}

export default BaseChart;
