import { SpendingDetails } from './SpendingDetails';
import { FoodLeaders } from './FoodLeaders';
import { useDashboard } from '../hooks/api';
import { useFilters } from './FilterContext';
import { Chart } from './Chart';
import { CuisineTreemapChart, NewVsRepeatChart } from '../components/charts';

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

  const sortedLoyalty = [...food.loyalty].sort((a, b) => b.orders - a.orders);

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
            {/* Consolidated Restaurant Loyalty (Ranked horizontal bars with AOV and Spend) */}
            <div className="page-panel rounded-xl border bg-card p-5 shadow-xs space-y-3">
              <div>
                <h2 className="text-base font-semibold text-foreground">Restaurant loyalty</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Order counts by vendor with average order value (AOV) and total spend
                </p>
              </div>

              {!sortedLoyalty.length ? (
                <p className="text-xs text-muted-foreground p-4 text-center">No loyalty data available.</p>
              ) : (
                <Chart
                  summary="Restaurant order count and average order value"
                  headers={['Restaurant', 'Orders', 'Spend', 'AOV']}
                  rows={sortedLoyalty.map(x => [
                    x.name,
                    x.orders,
                    `₹${Math.round(x.spend).toLocaleString('en-IN')}`,
                    `₹${Math.round(x.aov).toLocaleString('en-IN')}`,
                  ])}
                  option={{
                    tooltip: {
                      trigger: 'axis',
                      renderMode: 'richText',
                      axisPointer: { type: 'shadow' },
                    },
                    grid: { left: 110, right: 30, bottom: 40, top: 15 },
                    xAxis: { type: 'value', name: 'Orders' },
                    yAxis: {
                      type: 'category',
                      data: sortedLoyalty.map(x => x.name).reverse(),
                      axisLabel: { fontSize: 11 },
                    },
                    series: [
                      {
                        name: 'Orders',
                        type: 'bar',
                        itemStyle: { borderRadius: [0, 4, 4, 0] },
                        data: sortedLoyalty.map(x => x.orders).reverse(),
                      },
                    ],
                  }}
                />
              )}
            </div>

            {/* Diet item quantities (Ranked bars for totals, stacked columns for monthly history) */}
            <div className="page-panel rounded-xl border bg-card p-5 shadow-xs space-y-3">
              <div>
                <h2 className="text-base font-semibold text-foreground">Diet item quantities</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Item quantities across dietary categories. Note: Reflects individual item quantities, not order count.
                </p>
              </div>

              {food.diet_unavailable_reason ? (
                <p className="text-xs text-muted-foreground p-3 rounded-lg border bg-muted/20">
                  {food.diet_unavailable_reason}
                </p>
              ) : !food.diet.length ? (
                <p className="text-xs text-muted-foreground p-4 text-center">No dietary item data available.</p>
              ) : (
                <div className="space-y-4">
                  <Chart
                    summary="Current item quantities by diet category"
                    headers={['Diet category', 'Item quantity', 'Item lines', 'Line total']}
                    rows={food.diet.map(x => [
                      x.diet,
                      x.quantity,
                      x.item_lines,
                      `₹${Math.round(x.line_total).toLocaleString('en-IN')}`,
                    ])}
                    option={{
                      tooltip: {
                        trigger: 'axis',
                        renderMode: 'richText',
                        axisPointer: { type: 'shadow' },
                      },
                      grid: { left: 80, right: 30, bottom: 40, top: 15 },
                      xAxis: {
                        type: 'category',
                        data: food.diet.map(x => x.diet),
                        axisLabel: { fontSize: 11 },
                      },
                      yAxis: { type: 'value', name: 'Item quantity' },
                      series: [
                        {
                          name: 'Item quantity',
                          type: 'bar',
                          itemStyle: { borderRadius: [4, 4, 0, 0] },
                          data: food.diet.map(x => x.quantity),
                        },
                      ],
                    }}
                  />

                  {food.diet_monthly.length > 0 && (
                    <details className="border-t pt-3 group">
                      <summary className="cursor-pointer text-xs font-semibold text-foreground flex items-center justify-between min-h-[44px]">
                        <span>Monthly diet quantities history</span>
                        <span className="text-xs text-muted-foreground group-open:rotate-180 transition-transform">
                          ▼
                        </span>
                      </summary>
                      <div className="pt-2">
                        <Chart
                          summary="Monthly veg, non-veg and unknown item quantities"
                          headers={['Month', 'Veg', 'Non-veg', 'Unknown']}
                          rows={food.diet_monthly.map(x => [x.month, x.veg, x.non_veg, x.unknown])}
                          option={{
                            tooltip: { trigger: 'axis', renderMode: 'richText' },
                            legend: { top: 0 },
                            grid: { left: 50, right: 25, bottom: 50, top: 35 },
                            xAxis: {
                              type: 'category',
                              data: food.diet_monthly.map(x => x.month),
                              axisLabel: { hideOverlap: true, fontSize: 11 },
                            },
                            yAxis: { type: 'value', name: 'Item quantity' },
                            series: (
                              [
                                ['veg', 'Veg'],
                                ['non_veg', 'Non-veg'],
                                ['unknown', 'Unknown'],
                              ] as const
                            ).map(([key, name]) => ({
                              name,
                              type: 'bar',
                              stack: 'diet',
                              data: food.diet_monthly.map(x => x[key]),
                            })),
                          }}
                        />
                      </div>
                    </details>
                  )}
                </div>
              )}
            </div>
          </div>

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
