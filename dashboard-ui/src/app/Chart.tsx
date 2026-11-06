import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, HeatmapChart, ScatterChart, PieChart } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  VisualMapComponent,
  CalendarComponent,
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
  CanvasRenderer,
]);

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
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    let chart: echarts.ECharts;

    function render() {
      chart?.dispose();
      const css = getComputedStyle(document.documentElement);
      chart = echarts.init(node);
      chart.setOption({
        color: [
          css.getPropertyValue('--v2-primary').trim() || '#087448',
          css.getPropertyValue('--v2-chart-2').trim() || '#3565b0',
          css.getPropertyValue('--v2-chart-3').trim() || '#a1467c',
          css.getPropertyValue('--v2-chart-4').trim() || '#986100',
        ],
        textStyle: {
          fontSize: 11,
          fontFamily: '"Inter Variable", sans-serif',
          color: css.getPropertyValue('--v2-foreground').trim() || '#162b23',
        },
        animation: !matchMedia('(prefers-reduced-motion: reduce)').matches,
        ...option,
      });
    }

    render();
    const resize = new ResizeObserver(() => chart?.resize());
    resize.observe(node);
    const theme = new MutationObserver(render);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-v2theme', 'class'] });

    return () => {
      theme.disconnect();
      resize.disconnect();
      chart?.dispose();
    };
  }, [option]);

  return (
    <div className="space-y-2">
      <div ref={ref} role="img" aria-label={summary} style={{ height: 320, width: '100%' }} />
      <details className="group border-t pt-2">
        <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground select-none inline-flex items-center gap-1.5 py-1">
          <span>View as table</span>
        </summary>
        <div
          className="overview-scroll mt-2 rounded-lg border overflow-auto max-h-56 bg-card"
          tabIndex={0}
          role="region"
          aria-label={`${summary} table`}
        >
          <Table>
            <TableHeader className="bg-muted/40 sticky top-0 z-10">
              <TableRow className="border-b">
                {headers.map(h => (
                  <TableHead key={h} className="text-xs font-semibold uppercase tracking-wider py-2 px-3">
                    {h}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y font-mono">
              {rows.map((row, i) => (
                <TableRow key={i} className="hover:bg-muted/30">
                  {row.map((cell, j) => (
                    <TableCell key={j} className="text-xs py-2 px-3">
                      {cell ?? 'Unknown'}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </details>
    </div>
  );
}
