import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { BarChart, LineChart, HeatmapChart, ScatterChart, PieChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  VisualMapComponent,
  CalendarComponent,
  AriaComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsCoreOption } from "echarts/core";
import { Table, TableHead, TableHeader, TableRow, TableBody, TableCell } from "../components/ui/table";
import { getCurrentChartTheme, buildBaseChartOption } from "../lib/chart-theme";
import { subscribeTheme } from "./theme";

// Scenario 3: Ensures ECharts core / modules / renderers are registered once, not re-registered per chart instance
let modulesRegistered = false;
function registerEChartsOnce() {
  if (modulesRegistered) return;
  echarts.use([
    BarChart,
    LineChart,
    HeatmapChart,
    ScatterChart,
    PieChart,
    GridComponent,
    TooltipComponent,
    LegendComponent,
    VisualMapComponent,
    CalendarComponent,
    AriaComponent,
    CanvasRenderer,
  ]);
  modulesRegistered = true;
}
registerEChartsOnce();

export function Chart({
  option,
  summary,
  headers,
  rows,
}: {
  option: EChartsCoreOption;
  summary: string;
  headers: string[];
  rows: (string | number | null)[][];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  // Scenario 3: Lifecycle - initialize once, observe container resize, dispose on unmount
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    registerEChartsOnce();

    if (!chartRef.current) {
      chartRef.current = echarts.init(node);
    }
    const chart = chartRef.current;

    const resizeObserver = new ResizeObserver(() => {
      if (chart && !chart.isDisposed()) {
        chart.resize();
      }
    });
    resizeObserver.observe(node);

    return () => {
      resizeObserver.disconnect();
      if (chartRef.current) {
        chartRef.current.dispose();
        chartRef.current = null;
      }
    };
  }, []);

  // Update chart option when option prop changes
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || chart.isDisposed()) return;
    const theme = getCurrentChartTheme();
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const baseOption = buildBaseChartOption(theme, prefersReducedMotion);

    chart.setOption(
      {
        ...baseOption,
        ...option,
      },
      { notMerge: false, lazyUpdate: true }
    );
  }, [option]);

  // Scenario 2: Live re-theme
  // Listen to theme changes (mode & accent from theme.ts and MutationObserver on <html> class and data-accent).
  // When mode or accent changes, call chartInstance.setOption(...) with updated theme colors without remounting or wiping zoom/pan data state.
  useEffect(() => {
    function applyThemeUpdate() {
      const chart = chartRef.current;
      if (!chart || chart.isDisposed()) return;
      const theme = getCurrentChartTheme();
      const prefersReducedMotion =
        typeof window !== "undefined" &&
        window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const themeOption = buildBaseChartOption(theme, prefersReducedMotion);

      // notMerge: false merges updated theme colors without clearing data or zoom/pan state
      chart.setOption(themeOption, { notMerge: false, lazyUpdate: true });
    }

    const unsubscribe = subscribeTheme(() => {
      applyThemeUpdate();
    });

    const observer = new MutationObserver(() => {
      applyThemeUpdate();
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
  }, []);

  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        role="img"
        aria-label={summary}
        style={{ height: 320, width: "100%" }}
      />
      <details className="group border-t pt-1">
        <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground select-none inline-flex items-center gap-1.5 py-2 px-1 min-h-[44px]">
          <span>View data table: {summary}</span>
        </summary>
        <div
          className="overview-scroll mt-2 rounded-lg border overflow-auto max-h-56 bg-card"
          tabIndex={0}
          role="region"
          aria-label={`Data table for ${summary}`}
        >
          <Table>
            <TableHeader className="bg-muted/40 sticky top-0 z-10">
              <TableRow className="border-b">
                {headers.map((h) => (
                  <TableHead
                    key={h}
                    scope="col"
                    className="text-xs font-semibold uppercase tracking-wider py-2 px-3"
                  >
                    {h}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y font-mono">
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={headers.length}
                    className="text-xs text-center py-4 text-muted-foreground"
                  >
                    No data available for this range
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row, i) => (
                  <TableRow key={i} className="hover:bg-muted/30">
                    {row.map((cell, j) => (
                      <TableCell key={j} className="text-xs py-2 px-3">
                        {cell === null || cell === undefined ? "-" : String(cell)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </details>
    </div>
  );
}

