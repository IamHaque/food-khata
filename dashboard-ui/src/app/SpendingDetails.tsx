import { useState, useMemo } from 'react';
import type { components } from '../types/api';
import { Chart } from './Chart';
import { tokenAlpha } from '../lib/tokens';
import { BillWaterfallChart } from '../components/charts/BillWaterfallChart';


const money = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const num = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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

  // Ranked horizontal bars for explicit discounts
  const discountData = useMemo(() => {
    const sorted = [...charts.spending.discount_breakdown].sort((a, b) => b.amount - a.amount);
    return {
      labels: sorted.map(x => x.label),
      amounts: sorted.map(x => x.amount),
    };
  }, [charts.spending.discount_breakdown]);

  // Year-over-year line series with gaps for incomplete years and no smoothing
  const yearlyData = useMemo(() => {
    const distinctYears = [...new Set(charts.spending.years.map(x => x.year))].sort();
    return {
      distinctYears,
      series: distinctYears.map(y => ({
        name: String(y),
        type: 'line' as const,
        smooth: false,
        data: Array.from({ length: 12 }, (_, i) => {
          const match = charts.spending.years.find(x => x.year === y && x.month === i + 1);
          return match?.spend ?? null;
        }),
      })),
    };
  }, [charts.spending.years]);

  // Filter valid fee scatter data
  const feeScatterValid = useMemo(
    () =>
      charts.spending.fee_scatter.filter(
        x => x.fee_percent !== null && Number.isFinite(x.fee_percent) && Number.isFinite(x.amount)
      ),
    [charts.spending.fee_scatter]
  );
  const feeScatterExcluded = charts.spending.fee_scatter.length - feeScatterValid.length;

  return (
    <div className="space-y-6">
      {/* 0. Bill waterfall breakdown */}
      <BillWaterfallChart
        steps={charts.waterfall_steps}
        costWaterfall={charts.cost_waterfall}
      />

      {/* 1. Explicit discount breakdown: Ranked horizontal bars */}
      <div className="page-panel rounded-xl border bg-card p-5 shadow-xs space-y-3">
        <div className="border-b pb-2">
          <h2 className="text-base font-semibold text-foreground">Explicit discount breakdown</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Explicit bill deductions by component; advertised savings (strikethrough list prices) are excluded
          </p>
        </div>
        <Chart
          summary="Explicit discount components breakdown"
          headers={['Discount type', 'Amount']}
          rows={discountData.labels.map((l, i) => [l, money.format(discountData.amounts[i])])}
          option={{
            tooltip: {
              trigger: 'axis' as const,
              formatter: (params: unknown) => {
                if (!Array.isArray(params) || !params[0]) return '';
                const p = params[0] as { name: string; value: number };
                return `<div class="text-xs"><strong>${p.name}:</strong> ${money.format(p.value)}</div>`;
              },
            },
            grid: { left: 140, right: 30, bottom: 40, top: 20 },
            xAxis: {
              type: 'value' as const,
              name: 'Explicit discount (₹)',
              axisLabel: {
                formatter: (v: number) => `₹${v}`,
                fontSize: 10,
              },
            },
            yAxis: {
              type: 'category' as const,
              data: discountData.labels,
              axisLabel: { fontSize: 11 },
            },
            series: [
              {
                name: 'Explicit discount (₹)',
                type: 'bar',
                itemStyle: { borderRadius: [0, 4, 4, 0] },
                data: discountData.amounts,
              },
            ],
          }}
        />
      </div>

      {/* 2. Year-over-year spend: Line series by year, Jan-Dec axis */}
      <div className="page-panel rounded-xl border bg-card p-5 shadow-xs space-y-3">
        <div className="border-b pb-2">
          <h2 className="text-base font-semibold text-foreground">Year-over-year spend comparison</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Monthly spend trajectories across calendar years on a common Jan–Dec axis
          </p>
        </div>
        <Chart
          summary="Monthly spend by calendar year"
          headers={['Month', ...yearlyData.distinctYears.map(String)]}
          rows={MONTH_NAMES.map((m, i) => [
            m,
            ...yearlyData.distinctYears.map(y => {
              const match = charts.spending.years.find(x => x.year === y && x.month === i + 1);
              return match ? money.format(match.spend) : '—';
            }),
          ])}
          option={{
            tooltip: {
              trigger: 'axis' as const,
              formatter: (params: unknown) => {
                if (!Array.isArray(params)) return '';
                const month = (params[0] as { axisValueLabel?: string })?.axisValueLabel ?? '';
                let res = `<div class="font-bold text-xs mb-1">${month}</div>`;
                for (const item of params as { seriesName: string; value: number | null }[]) {
                  const val = item.value !== null ? money.format(item.value) : 'No data';
                  res += `<div class="flex justify-between gap-3 text-xs"><span>${item.seriesName}:</span> <strong>${val}</strong></div>`;
                }
                return res;
              },
            },
            legend: { top: 0, textStyle: { fontSize: 11 } },
            grid: { left: 65, right: 25, bottom: 40, top: 35 },
            xAxis: {
              type: 'category' as const,
              data: MONTH_NAMES,
              axisLabel: { fontSize: 11 },
            },
            yAxis: {
              type: 'value' as const,
              name: 'Spend (₹)',
              axisLabel: {
                formatter: (v: number) => `₹${v}`,
                fontSize: 10,
              },
            },
            series: yearlyData.series,
          }}
        />
      </div>

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

      {/* 4. Monthly fee components: One stacked chart consolidating redundant views (F08) */}
      <div className="page-panel rounded-xl border bg-card p-5 shadow-xs space-y-3">
        <div className="border-b pb-2">
          <h2 className="text-base font-semibold text-foreground">Monthly fee components</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Consolidated breakdown of monthly delivery, packaging, and platform fees. Taxes are categorized separately and shown alongside fees for complete billing transparency.
          </p>
        </div>
        <Chart
          summary="Monthly net delivery, packaging, platform and tax fees"
          headers={['Month', 'Net delivery', 'Packaging', 'Platform', 'Tax']}
          rows={charts.monthly_fee_components.map(x => [
            x.month,
            money.format(x.net_delivery),
            money.format(x.packaging),
            money.format(x.platform),
            money.format(x.tax),
          ])}
          option={{
            tooltip: {
              trigger: 'axis' as const,
              formatter: (params: unknown) => {
                if (!Array.isArray(params)) return '';
                const month = (params[0] as { axisValueLabel?: string })?.axisValueLabel ?? '';
                let total = 0;
                let res = `<div class="font-bold text-xs mb-1">${month}</div>`;
                for (const item of params as { seriesName: string; value: number }[]) {
                  total += item.value;
                  res += `<div class="flex justify-between gap-3 text-xs"><span>${item.seriesName}:</span> <strong>${money.format(item.value)}</strong></div>`;
                }
                res += `<div class="border-t pt-1 mt-1 flex justify-between gap-3 text-xs font-bold"><span>Total Fees + Tax:</span> <strong>${money.format(total)}</strong></div>`;
                return res;
              },
            },
            legend: { top: 0, textStyle: { fontSize: 11 } },
            grid: { left: 65, right: 25, bottom: 40, top: 35 },
            xAxis: {
              type: 'category' as const,
              data: charts.monthly_fee_components.map(x => x.month ?? 'Unknown'),
              axisLabel: { fontSize: 11 },
            },
            yAxis: {
              type: 'value' as const,
              name: 'Amount (₹)',
              axisLabel: {
                formatter: (v: number) => `₹${v}`,
                fontSize: 10,
              },
            },
            series: (
              [
                ['net_delivery', 'Net delivery'],
                ['packaging', 'Packaging'],
                ['platform', 'Platform'],
                ['tax', 'Tax'],
              ] as const
            ).map(([key, name]) => ({
              name,
              type: 'bar',
              stack: 'fees',
              data: charts.monthly_fee_components.map(x => x[key]),
            })),
          }}
        />
      </div>

      {/* 5. Fee burden vs order value: Scatter plot */}
      <div className="page-panel rounded-xl border bg-card p-5 shadow-xs space-y-3">
        <div className="border-b pb-2">
          <h2 className="text-base font-semibold text-foreground">Fee burden vs order value</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Observed percentage fee burden relative to order value across individual orders
          </p>
        </div>
        <Chart
          summary="Fees percentage versus provider-paid order amount"
          headers={['Order amount', 'Fees', 'Fee %']}
          rows={feeScatterValid.map(x => [money.format(x.amount), money.format(x.fees), `${num.format(x.fee_percent!)}%`])}
          option={{
            tooltip: {
              formatter: (params: unknown) => {
                const p = params as { value: [number, number] };
                if (!p || !Array.isArray(p.value)) return '';
                const [amt, pct] = p.value;
                return `<div class="text-xs"><div>Order: <strong>${money.format(amt)}</strong></div><div>Fee burden: <strong>${num.format(pct)}%</strong></div></div>`;
              },
            },
            grid: { left: 65, right: 30, bottom: 45, top: 25 },
            xAxis: {
              type: 'value' as const,
              name: 'Order amount (₹)',
              axisLabel: {
                formatter: (v: number) => `₹${v}`,
                fontSize: 10,
              },
            },
            yAxis: {
              type: 'value' as const,
              name: 'Fees (%)',
              axisLabel: {
                formatter: (v: number) => `${v}%`,
                fontSize: 10,
              },
            },
            series: [
              {
                type: 'scatter',
                data: feeScatterValid.map(x => [x.amount, x.fee_percent]),
                symbolSize: 7,
              },
            ],
          }}
        />
        <p className="text-xs text-muted-foreground">
          {feeScatterExcluded > 0 && `${feeScatterExcluded} orders with undefined fee ratios are excluded. `}
          Scatter represents observed billing ratios and does not imply a direct causal relationship.
        </p>
      </div>

      {/* 6. Platform comparison table */}
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
