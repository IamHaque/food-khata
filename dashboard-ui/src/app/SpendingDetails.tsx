import type { components } from '../types/api';
import { BillWaterfallChart } from '../components/charts/BillWaterfallChart';
import { DiscountBreakdownChart } from '../components/charts/DiscountBreakdownChart';
import { YearOverYearChart } from '../components/charts/YearOverYearChart';
import { DailySpendCalendarChart } from '../components/charts/DailySpendCalendarChart';
import { FeeComponentsChart } from '../components/charts/FeeComponentsChart';
import { FeeScatterChart } from '../components/charts/FeeScatterChart';
import { CumulativeSpendChart } from '../components/charts/CumulativeSpendChart';
import { OrderValueDistributionChart } from '../components/charts/OrderValueDistributionChart';


const money = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const num = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });


export function SpendingDetails({ charts }: { charts: components['schemas']['Charts'] }) {


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


      {/* 3. Daily spend calendar heatmap (S-047) */}
      <DailySpendCalendarChart
        data={charts.spending.daily}
        calendar={charts.calendar}
        unallocatedSpend={charts.spending.unallocated_spend}
      />

      {/* 4. Monthly fee components: Stacked area chart (S-043) */}
      <FeeComponentsChart data={charts.monthly_fee_components} />


      {/* 5. Fee burden vs order value: Scatter plot (S-044) */}
      <FeeScatterChart data={charts.spending.fee_scatter} />

      {/* 6. Cumulative spend: Running total line with milestone markers (S-045) */}
      <CumulativeSpendChart data={charts.monthly} />

      {/* 7. Order value distribution: Histogram with mean & median mark lines (S-046) */}
      <OrderValueDistributionChart aov_histogram={charts.behavior?.aov_histogram} />

      {/* 8. Platform comparison table */}
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
