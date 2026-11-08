import { SpendingDetails } from './SpendingDetails';
import { FoodLeaders } from './FoodLeaders';
import { useDashboard } from '../hooks/api';
import { useFilters } from './FilterContext';
import { Chart } from './Chart';
import { CuisineTreemapChart, NewVsRepeatChart, LoyaltyParetoChart, DietSplitTrendChart, DishRankingChart } from '../components/charts';

export function AnalyticsPage({ page }: { page: 'Food' | 'Spending' | 'Habits' }) {
  const { filters, clear } = useFilters();
  const query = useDashboard(filters);
  const data = query.data;

  if (!data)
    return (
      <section
        className="page-panel rounded-xl border bg-card p-8 text-center text-xs text-muted-foreground shadow-xs animate-pulse"
        role={query.isError ? 'alert' : 'status'}
      >
        {query.isError ? (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-destructive">{page} could not load.</p>
            <button
              onClick={() => void query.refetch()}
              className="rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium shadow-xs hover:bg-accent"
            >
              Retry
            </button>
          </div>
        ) : (
          'Loading…'
        )}
      </section>
    );

  const food = data.charts.food;
  const spending = data.charts.spending;

  const spendingPanels = [
    {
      title: 'Daily spend',
      subtitle: 'Daily provider-paid expenditure',
      labels: spending.daily.map(x => x.date),
      values: spending.daily.map(x => x.spend),
    },
    {
      title: 'Rolling 30-day spend',
      subtitle: 'Trailing 30-day expenditure sum (not a daily average)',
      labels: spending.daily.map(x => x.date),
      values: spending.daily.map(x => x.rolling_30),
    },
  ];

  return (
    <section aria-busy={query.isFetching} className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{page}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {page === 'Food'
              ? 'Cuisine breakdown, dish trends, dietary distribution, and restaurant loyalty'
              : 'Cumulative expenditure, moving averages, fee patterns, and yearly comparisons'}
          </p>
        </div>
      </div>

      {query.isError && (
        <p role="alert" className="text-xs font-medium text-destructive flex items-center gap-2">
          <span>Refresh failed.</span>
          <button
            onClick={() => void query.refetch()}
            className="rounded border border-input px-2 py-0.5 bg-background shadow-2xs hover:bg-accent"
          >
            Retry
          </button>
        </p>
      )}

      {!data.kpis.orders ? (
        <div className="page-panel rounded-xl border bg-card p-8 text-center shadow-xs space-y-2">
          <p className="font-semibold text-foreground text-sm">No orders match these filters.</p>
          <button
            onClick={clear}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium shadow-xs hover:bg-accent"
          >
            Clear filters
          </button>
        </div>
      ) : page === 'Food' ? (
        <div className="space-y-6">
          {/* Row 1: Cuisine spending and New vs Repeat restaurants */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* S-050 Cuisine treemap with restaurant drilldown */}
            <CuisineTreemapChart
              cuisines={food.cuisines}
              loyalty={food.loyalty}
              cuisine_unavailable_reason={food.cuisine_unavailable_reason}
            />

            {/* S-051 New vs repeat restaurants stacked area chart */}
            <NewVsRepeatChart
              data={food.new_repeat}
            />
          </div>

          {/* Row 2: Restaurant Loyalty and Diet item quantities */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* S-052 Restaurant Loyalty Pareto Chart */}
            <LoyaltyParetoChart
              data={food.loyalty}
            />

            {/* S-053 Dietary classification split and trend chart */}
            <DietSplitTrendChart
              diet={food.diet}
              diet_monthly={food.diet_monthly}
              diet_unavailable_reason={food.diet_unavailable_reason}
            />
          </div>

          {/* Row 3: S-054 Dish ranking leaderboard */}
          <DishRankingChart
            data={data.charts.top_dishes}
          />

          {/* Leaders section with independent pagination */}
          <FoodLeaders />
        </div>
      ) : (
        /* Spending page view */
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {spendingPanels.map(panel => (
              <div className="page-panel rounded-xl border bg-card p-5 shadow-xs space-y-3" key={panel.title}>
                <div>
                  <h2 className="text-base font-semibold text-foreground">{panel.title}</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">{panel.subtitle}</p>
                </div>
                <Chart
                  summary={panel.title}
                  headers={['Period or group', panel.title]}
                  rows={panel.labels.map((label, i) => [label, panel.values[i]])}
                  option={{
                    tooltip: {
                      trigger: 'axis',
                      renderMode: 'richText',
                      valueFormatter: (val: unknown) =>
                        val != null ? `₹${Number(val).toLocaleString('en-IN')}` : 'Unknown',
                    },
                    grid: { left: 80, right: 25, bottom: 75, top: 20 },
                    xAxis: {
                      type: 'category',
                      data: panel.labels,
                      axisLabel: { hideOverlap: true, fontSize: 11 },
                    },
                    yAxis: {
                      type: 'value',
                      name: 'Spend (₹)',
                      axisLabel: {
                        formatter: (v: number) => `₹${v.toLocaleString('en-IN')}`,
                      },
                    },
                    series: [
                      {
                        name: panel.title,
                        type: 'line',
                        itemStyle: { borderRadius: [4, 4, 0, 0] },
                        data: panel.values,
                      },
                    ],
                  }}
                />
              </div>
            ))}
          </div>

          <details className="page-panel rounded-xl border bg-card p-5 shadow-xs space-y-3 group">
            <summary className="cursor-pointer text-sm font-semibold text-foreground flex items-center justify-between min-h-[44px]">
              <div className="flex items-center gap-2">
                <span>Cumulative spend trajectory</span>
                <span className="text-xs text-muted-foreground font-normal">(Click to expand)</span>
              </div>
              <span className="text-xs text-muted-foreground group-open:rotate-180 transition-transform">▼</span>
            </summary>
            <p className="text-xs text-muted-foreground">
              Accumulation starts at the beginning of the applied scope window (
              {filters.date_from ?? 'earliest recorded order'}). Does not represent total account history when date filters
              are restricted.
            </p>
            <Chart
              summary="Cumulative spend trajectory"
              headers={['Date', 'Cumulative spend']}
              rows={spending.daily.map(x => [x.date, x.cumulative])}
              option={{
                tooltip: {
                  trigger: 'axis',
                  renderMode: 'richText',
                  valueFormatter: (val: unknown) =>
                    val != null ? `₹${Number(val).toLocaleString('en-IN')}` : 'Unknown',
                },
                grid: { left: 80, right: 25, bottom: 65, top: 20 },
                xAxis: {
                  type: 'category',
                  data: spending.daily.map(x => x.date),
                  axisLabel: { hideOverlap: true, fontSize: 11 },
                },
                yAxis: {
                  type: 'value',
                  name: 'Spend (₹)',
                  axisLabel: {
                    formatter: (v: number) => `₹${v.toLocaleString('en-IN')}`,
                  },
                },
                series: [
                  {
                    name: 'Cumulative spend',
                    type: 'line',
                    data: spending.daily.map(x => x.cumulative),
                  },
                ],
              }}
            />
          </details>

          <SpendingDetails charts={data.charts} />
        </div>
      )}
    </section>
  );
}
