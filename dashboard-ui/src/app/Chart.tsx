import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, HeatmapChart, ScatterChart, PieChart } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  VisualMapComponent,
  CalendarComponent,
  AriaComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsCoreOption } from 'echarts/core';
import { Table, TableHead, TableHeader, TableRow, TableBody, TableCell } from '../components/ui/table';

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

function getChartTheme() {
  if (typeof window === 'undefined') {
    return {
      colors: ['#087448', '#3565b0', '#a1467c', '#986100', '#6d28d9'],
      textColor: '#162b23',
      mutedColor: '#4b5563',
      borderColor: '#e5e7eb',
      prefersReducedMotion: false,
    };
  }
  const css = getComputedStyle(document.documentElement);
  const isDark =
    document.documentElement.classList.contains('dark') ||
    document.documentElement.getAttribute('data-v2theme') === 'dark';

  const chart1 =
    css.getPropertyValue('--chart-1').trim() ||
    css.getPropertyValue('--primary').trim() ||
    css.getPropertyValue('--v2-primary').trim() ||
    (isDark ? '#70d9a4' : '#087448');
  const chart2 =
    css.getPropertyValue('--chart-2').trim() ||
    css.getPropertyValue('--v2-chart-2').trim() ||
    (isDark ? '#60a5fa' : '#3565b0');
  const chart3 =
    css.getPropertyValue('--chart-3').trim() ||
    css.getPropertyValue('--v2-chart-3').trim() ||
    (isDark ? '#f472b6' : '#a1467c');
  const chart4 =
    css.getPropertyValue('--chart-4').trim() ||
    css.getPropertyValue('--v2-chart-4').trim() ||
    (isDark ? '#fbbf24' : '#986100');
  const chart5 =
    css.getPropertyValue('--chart-5').trim() ||
    (isDark ? '#a78bfa' : '#6d28d9');

  const textColor =
    css.getPropertyValue('--foreground').trim() ||
    css.getPropertyValue('--v2-foreground').trim() ||
    (isDark ? '#f0fdf4' : '#162b23');

  const mutedColor =
    css.getPropertyValue('--muted-foreground').trim() ||
    (isDark ? '#aec2b4' : '#3d5045');

  const borderColor =
    css.getPropertyValue('--border').trim() ||
    (isDark ? '#1e382b' : '#e5e7eb');

  const prefersReducedMotion =
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return {
    colors: [chart1, chart2, chart3, chart4, chart5],
    textColor,
    mutedColor,
    borderColor,
    prefersReducedMotion,
  };
}

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

  // Initialize and update chart instance without unnecessary recreation (resolves F13)
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    if (!chartRef.current) {
      chartRef.current = echarts.init(node);
    }
    const chart = chartRef.current;

    function applyOptions() {
      if (!chart || chart.isDisposed()) return;
      const theme = getChartTheme();
      const baseOption: EChartsCoreOption = {
        color: theme.colors,
        textStyle: {
          fontSize: 11,
          fontFamily: '"Inter Variable", sans-serif',
          color: theme.mutedColor,
        },
        aria: {
          enabled: true,
          decal: { show: true },
        },
        animation: !theme.prefersReducedMotion,
        animationDuration: theme.prefersReducedMotion ? 0 : 400,
        animationDurationUpdate: theme.prefersReducedMotion ? 0 : 250,
      };

      chart.setOption(
        {
          ...baseOption,
          ...option,
        },
        { notMerge: false, lazyUpdate: true }
      );
    }

    applyOptions();

    const resizeObserver = new ResizeObserver(() => {
      if (chart && !chart.isDisposed()) {
        chart.resize();
      }
    });
    resizeObserver.observe(node);

    const themeObserver = new MutationObserver(() => {
      applyOptions();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-v2theme', 'class'],
    });

    return () => {
      themeObserver.disconnect();
      resizeObserver.disconnect();
    };
  }, [option]);

  // Clean up instance on unmount
  useEffect(() => {
    return () => {
      if (chartRef.current) {
        chartRef.current.dispose();
        chartRef.current = null;
      }
    };
  }, []);

  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        role="img"
        aria-label={summary}
        style={{ height: 320, width: '100%' }}
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
                {headers.map(h => (
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
                        {cell ?? 'Unknown'}
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
