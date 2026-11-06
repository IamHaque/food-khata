import { useState } from 'react';
import type { components } from '../types/api';
import { Chart } from './Chart';

export function SpendingDetails({ charts }: { charts: components['schemas']['Charts'] }) {
  const years = [...new Set(charts.calendar.flatMap(x => (x.date ? [x.date.slice(0, 4)] : [])))].sort();
  const [selected, setSelected] = useState('');
  const year = years.includes(selected) ? selected : years.at(-1);
  const calendar = charts.calendar.filter(x => x.date?.startsWith(year ?? ''));

  return (
    <div className="space-y-4">
      {/* Explicit discount breakdown */}
      <div className="page-panel rounded-xl border bg-card p-5 shadow-xs space-y-3">
        <h2 className="text-base font-semibold text-foreground">Explicit discount breakdown</h2>
        <Chart
          summary="Explicit discount components, excluding advertised savings"
          headers={['Type', 'Discount']}
          rows={charts.spending.discount_breakdown.map(x => [x.label, x.amount])}
          option={{
            tooltip: { trigger: 'axis', renderMode: 'richText' },
            grid: { left: 80, right: 25, bottom: 60, top: 20 },
            xAxis: { type: 'category', data: charts.spending.discount_breakdown.map(x => x.label) },
            yAxis: { type: 'value' },
            series: [
              {
                type: 'bar',
                itemStyle: { borderRadius: [4, 4, 0, 0] },
                data: charts.spending.discount_breakdown.map(x => x.amount),
              },
            ],
          }}
        />
      </div>

      {/* Year-over-year spend */}
      <div className="page-panel rounded-xl border bg-card p-5 shadow-xs space-y-3">
        <h2 className="text-base font-semibold text-foreground">Year-over-year spend</h2>
        <Chart
          summary="Monthly spend by year"
          headers={['Year', 'Month', 'Spend']}
          rows={charts.spending.years.map(x => [x.year, x.month, x.spend])}
          option={{
            tooltip: { trigger: 'axis', renderMode: 'richText' },
            legend: { top: 0 },
            grid: { left: 60, right: 25, bottom: 50, top: 40 },
            xAxis: { type: 'category', data: Array.from({ length: 12 }, (_, i) => i + 1) },
            yAxis: { type: 'value' },
            series: [...new Set(charts.spending.years.map(x => x.year))].map(y => ({
              name: String(y),
              type: 'line',
              smooth: true,
              data: Array.from(
                { length: 12 },
                (_, i) => charts.spending.years.find(x => x.year === y && x.month === i + 1)?.spend ?? null
              ),
            })),
          }}
        />
      </div>

      {/* Spend calendar */}
      <div className="page-panel rounded-xl border bg-card p-5 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">Spend calendar</h2>
          <label className="flex items-center gap-2 text-xs font-medium text-foreground">
            <span className="text-muted-foreground">Year:</span>
            <select
              value={year ?? ''}
              onChange={e => setSelected(e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2.5 text-xs font-medium shadow-xs"
            >
              {years.map(y => (
                <option key={y}>{y}</option>
              ))}
            </select>
          </label>
        </div>
        {year ? (
          <Chart
            summary="Daily spend calendar"
            headers={['Date', 'Spend', 'Orders']}
            rows={calendar.map(x => [x.date, x.spend, x.orders])}
            option={{
              tooltip: { renderMode: 'richText' },
              calendar: { range: year, cellSize: ['auto', 16], left: 40, right: 20, top: 40 },
              visualMap: {
                min: 0,
                max: Math.max(1, ...calendar.map(x => x.spend)),
                orient: 'horizontal',
                bottom: 0,
                left: 'center',
              },
              series: [{ type: 'heatmap', coordinateSystem: 'calendar', data: calendar.map(x => [x.date, x.spend]) }],
            }}
          />
        ) : (
          <p className="text-xs text-muted-foreground">No dated orders.</p>
        )}
      </div>

      {/* Monthly fee components */}
      <div className="page-panel rounded-xl border bg-card p-5 shadow-xs space-y-3">
        <h2 className="text-base font-semibold text-foreground">Monthly fee components</h2>
        <Chart
          summary="Monthly net delivery, packaging, platform and tax"
          headers={['Month', 'Net delivery', 'Packaging', 'Platform', 'Tax']}
          rows={charts.monthly_fee_components.map(x => [x.month, x.net_delivery, x.packaging, x.platform, x.tax])}
          option={{
            tooltip: { trigger: 'axis', renderMode: 'richText' },
            legend: { top: 0 },
            grid: { left: 60, right: 25, bottom: 50, top: 40 },
            xAxis: { type: 'category', data: charts.monthly_fee_components.map(x => x.month ?? 'Unknown') },
            yAxis: { type: 'value' },
            series: ([['net_delivery', 'Net delivery'], ['packaging', 'Packaging'], ['platform', 'Platform'], ['tax', 'Tax']] as const).map(
              ([key, name]) => ({
                name,
                type: 'bar',
                stack: 'fees',
                data: charts.monthly_fee_components.map(x => x[key]),
              })
            ),
          }}
        />
      </div>

      {/* Fees percentage and order size */}
      <div className="page-panel rounded-xl border bg-card p-5 shadow-xs space-y-3">
        <h2 className="text-base font-semibold text-foreground">Fees percentage and order size</h2>
        <Chart
          summary="Fees percentage versus provider-paid order amount"
          headers={['Order amount', 'Fees', 'Fees %']}
          rows={charts.spending.fee_scatter.map(x => [x.amount, x.fees, x.fee_percent])}
          option={{
            tooltip: { renderMode: 'richText' },
            grid: { left: 60, right: 25, bottom: 50, top: 20 },
            xAxis: { type: 'value', name: 'Order amount' },
            yAxis: { type: 'value', name: 'Fees %' },
            series: [
              {
                type: 'scatter',
                data: charts.spending.fee_scatter
                  .filter(x => x.fee_percent !== null)
                  .map(x => [x.amount, x.fee_percent]),
              },
            ],
          }}
        />
      </div>

      {/* Platform comparison */}
      <div className="page-panel rounded-xl border bg-card p-5 shadow-xs space-y-3">
        <h2 className="text-base font-semibold text-foreground">Platform comparison</h2>
        <div className="overview-scroll rounded-lg border overflow-x-auto" tabIndex={0}>
          <table className="w-full text-xs">
            <thead className="bg-muted/40 border-b">
              <tr>
                <th className="text-left p-2.5 font-medium">Platform</th>
                <th className="text-right p-2.5 font-medium">Orders</th>
                <th className="text-right p-2.5 font-medium">Spend</th>
                <th className="text-right p-2.5 font-medium">Explicit discounts</th>
                <th className="text-right p-2.5 font-medium">Advertised savings</th>
                <th className="text-right p-2.5 font-medium">Fees</th>
              </tr>
            </thead>
            <tbody className="divide-y font-mono">
              {charts.platforms.map(x => (
                <tr key={x.platform} className="hover:bg-muted/30">
                  <td className="p-2.5 font-sans font-semibold">{x.platform}</td>
                  <td className="p-2.5 text-right">{x.orders}</td>
                  <td className="p-2.5 text-right font-semibold">{x.spend}</td>
                  <td className="p-2.5 text-right text-muted-foreground">{x.discounts}</td>
                  <td className="p-2.5 text-right text-muted-foreground">{x.advertised_savings}</td>
                  <td className="p-2.5 text-right text-muted-foreground">{x.fees}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">Spend without a valid date: {charts.spending.unallocated_spend}</p>
      </div>
    </div>
  );
}
