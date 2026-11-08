import { useState, useMemo } from 'react';
import type { components } from '../types/api';
import { Chart } from './Chart';
import { tokenAlpha } from '../lib/tokens';
import { BillWaterfallChart } from '../components/charts/BillWaterfallChart';
import { DiscountBreakdownChart } from '../components/charts/DiscountBreakdownChart';
import { YearOverYearChart } from '../components/charts/YearOverYearChart';
import { FeeComponentsChart } from '../components/charts/FeeComponentsChart';
import { FeeScatterChart } from '../components/charts/FeeScatterChart';
import { CumulativeSpendChart } from '../components/charts/CumulativeSpendChart';


const money = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const num = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });


export function SpendingDetails({ charts }: { charts: components['schemas']['Charts'] }) {
  const years = useMemo(
    () => [...new Set(charts.calendar.flatMap(x => (x.date ? [x.date.slice(0, 4)] : [])))].sort(),
    [charts.calendar]
  );
  const [selectedYear, setSelectedYear] = useState('');
  const year = years.includes(selectedYear) ? selectedYear : years.at(-1);
  const calendar = useMemo(
    () => charts.calendar.filter(x => x.date?.startsWith(year ?? '')),
    [charts.calendar, year]
  );


  return (
    <div className="space-y-6">
      {/* 0. Bill waterfall breakdown */}
      <BillWaterfallChart
        steps={charts.waterfall_steps}
        costWaterfall={charts.cost_waterfall}
      />

      {/* 1. Explicit discount breakdown */}
      <DiscountBreakdownChart data={charts.spending.discount_breakdown} />

      {/* 2. Year-over-year spend comparison */}
      <YearOverYearChart data={charts.spending.years} />


      {/* 3. Spend calendar: Calendar heatmap with selected year & local scroll */}
      <div className="page-panel rounded-xl border bg-card p-5 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
          <div>
            <h2 className="text-base font-semibold text-foreground">Daily spend calendar</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Daily expenditure heatmap across active calendar dates
            </p>
          </div>
          <label className="flex items-center gap-2 text-xs font-medium text-foreground">
            <span className="text-muted-foreground">Year:</span>
            <select
              aria-label="Calendar year"
              value={year ?? ''}
              onChange={e => setSelectedYear(e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2.5 text-xs font-medium shadow-xs focus:ring-1 focus:ring-ring text-foreground"
            >
              {years.map(y => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
        </div>
        {year ? (
          <div className="overflow-x-auto select-custom-scroll pb-2">
            <div className="min-w-[700px]">
              <Chart
                summary={`Daily spend calendar for ${year}`}
                headers={['Date', 'Spend', 'Orders']}
                rows={calendar.map(x => [x.date, money.format(x.spend), x.orders])}
                option={{
                  tooltip: {
                    formatter: (params: unknown) => {
                      const p = params as { value: [string, number] };
                      if (!p || !Array.isArray(p.value)) return '';
                      const [d, s] = p.value;
                      return `<div class="text-xs font-medium"><div>${d}</div><strong>Spend: ${money.format(s)}</strong></div>`;
                    },
                  },
                  calendar: {
                    range: year,
                    cellSize: ['auto', 16],
                    left: 45,
                    right: 25,
                    top: 35,
                    itemStyle: { borderWidth: 0.5 },
                  },
                  visualMap: {
                    min: 0,
                    max: Math.max(1, ...calendar.map(x => x.spend)),
                    orient: 'horizontal',
                    bottom: 0,
                    left: 'center',
                    text: ['High', '₹0'],
                    dimension: 1,
                    inRange: {
                      color: [0.25, 0.5, 0.75, 1].map((alpha) => tokenAlpha('--success', alpha)),
                    },
                  },
                  series: [
                    {
                      type: 'heatmap',
                      coordinateSystem: 'calendar',
                      data: calendar.map(x => [x.date, x.spend]),
                    },
                  ],
                }}
              />
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground p-3">No dated orders in this selection.</p>
        )}
      </div>

      {/* 4. Monthly fee components: Stacked area chart (S-043) */}
      <FeeComponentsChart data={charts.monthly_fee_components} />


      {/* 5. Fee burden vs order value: Scatter plot (S-044) */}
      <FeeScatterChart data={charts.spending.fee_scatter} />

      {/* 6. Cumulative spend: Running total line with milestone markers (S-045) */}
      <CumulativeSpendChart data={charts.monthly} />

      {/* 7. Platform comparison table */}
      <div className="page-panel rounded-xl border bg-card p-5 shadow-xs space-y-3">
        <div className="border-b pb-2">
          <h2 className="text-base font-semibold text-foreground">Platform comparison</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Spending, order volumes, explicit discounts, advertised savings, and fees separated by platform
          </p>
        </div>
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
                  <td className="p-2.5 text-right">{num.format(x.orders)}</td>
                  <td className="p-2.5 text-right font-semibold">{money.format(x.spend)}</td>
                  <td className="p-2.5 text-right text-muted-foreground">{money.format(x.discounts)}</td>
                  <td className="p-2.5 text-right text-muted-foreground">{money.format(x.advertised_savings)}</td>
                  <td className="p-2.5 text-right text-muted-foreground">{money.format(x.fees)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">
          Spend without a valid recorded date: {money.format(charts.spending.unallocated_spend)}
        </p>
      </div>
    </div>
  );
}
