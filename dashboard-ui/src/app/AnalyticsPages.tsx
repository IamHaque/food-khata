import { SpendingDetails } from './SpendingDetails';
import { FoodLeaders } from './FoodLeaders';
import { useDashboard } from '../hooks/api';
import { useFilters } from './FilterContext';
import { Chart } from './Chart';

export function AnalyticsPage({ page }: { page: 'Food' | 'Spending' }) {
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
  const panels =
    page === 'Food'
      ? [
          {
            title: 'Cuisine spend',
            labels: food.cuisines.map(x => x.name),
            values: food.cuisines.map(x => x.spend),
            reason: food.cuisine_unavailable_reason,
          },
          {
            title: 'Restaurant loyalty',
            labels: food.loyalty.map(x => x.name),
            values: food.loyalty.map(x => x.orders),
          },
          {
            title: 'Diet item quantities',
            labels: food.diet.map(x => x.diet),
            values: food.diet.map(x => x.quantity),
            reason: food.diet_unavailable_reason,
          },
          {
            title: 'New restaurant orders',
            labels: food.new_repeat.map(x => x.month),
            values: food.new_repeat.map(x => x.new_orders),
          },
          {
            title: 'Repeat restaurant orders',
            labels: food.new_repeat.map(x => x.month),
            values: food.new_repeat.map(x => x.repeat_orders),
          },
        ]
      : [
          {
            title: 'Daily spend',
            labels: spending.daily.map(x => x.date),
            values: spending.daily.map(x => x.spend),
          },
          {
            title: 'Cumulative spend',
            labels: spending.daily.map(x => x.date),
            values: spending.daily.map(x => x.cumulative),
          },
          {
            title: 'Rolling 30-day spend',
            labels: spending.daily.map(x => x.date),
            values: spending.daily.map(x => x.rolling_30),
          },
          {
            title: 'Monthly fees',
            labels: data.charts.monthly_fee_components.map(x => x.month ?? 'Unknown'),
            values: data.charts.monthly_fee_components.map(x => x.total_fees),
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
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {panels.map(panel => (
            <div className="page-panel rounded-xl border bg-card p-5 shadow-xs space-y-3" key={panel.title}>
              <h2 className="text-base font-semibold text-foreground">{panel.title}</h2>
              {'reason' in panel && panel.reason ? (
                <p className="text-xs text-muted-foreground p-3 rounded-lg border bg-muted/20">{panel.reason}</p>
              ) : (
                <Chart
                  summary={panel.title}
                  headers={['Period or group', panel.title]}
                  rows={panel.labels.map((label, i) => [label, panel.values[i]])}
                  option={{
                    tooltip: { trigger: 'axis', renderMode: 'richText' },
                    grid: { left: 80, right: 25, bottom: 75, top: 20 },
                    xAxis: {
                      type: 'category',
                      data: panel.labels,
                      axisLabel: { hideOverlap: true, fontSize: 11 },
                    },
                    yAxis: { type: 'value' },
                    series: [
                      {
                        name: panel.title,
                        type: page === 'Spending' ? 'line' : 'bar',
                        itemStyle: { borderRadius: [4, 4, 0, 0] },
                        data: panel.values,
                      },
                    ],
                  }}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {data.kpis.orders > 0 &&
        (page === 'Food' ? (
          <div className="space-y-6 pt-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="page-panel rounded-xl border bg-card p-5 shadow-xs space-y-3">
                <h2 className="text-base font-semibold text-foreground">Cuisine share</h2>
                <Chart
                  summary="Provider-paid spend by cuisine"
                  headers={['Cuisine', 'Spend']}
                  rows={food.cuisines.map(x => [x.name, x.spend])}
                  option={{
                    tooltip: { renderMode: 'richText' },
                    series: [
                      {
                        type: 'pie',
                        radius: ['40%', '70%'],
                        label: { show: false },
                        data: food.cuisines.map(x => ({ name: x.name, value: x.spend })),
                      },
                    ],
                  }}
                />
              </div>

              <div className="page-panel rounded-xl border bg-card p-5 shadow-xs space-y-3">
                <h2 className="text-base font-semibold text-foreground">Diet quantities over time</h2>
                {food.diet_unavailable_reason ? (
                  <p className="text-xs text-muted-foreground p-3 rounded-lg border bg-muted/20">
                    {food.diet_unavailable_reason}
                  </p>
                ) : (
                  <Chart
                    summary="Monthly veg, non-veg and unknown item quantities"
                    headers={['Month', 'Veg', 'Non-veg', 'Unknown']}
                    rows={food.diet_monthly.map(x => [x.month, x.veg, x.non_veg, x.unknown])}
                    option={{
                      tooltip: { trigger: 'axis', renderMode: 'richText' },
                      legend: { top: 0 },
                      grid: { left: 50, right: 25, bottom: 60, top: 40 },
                      xAxis: { type: 'category', data: food.diet_monthly.map(x => x.month) },
                      yAxis: { type: 'value' },
                      series: ([['veg', 'Veg'], ['non_veg', 'Non-veg'], ['unknown', 'Unknown']] as const).map(
                        ([key, name]) => ({
                          name,
                          type: 'bar',
                          stack: 'diet',
                          data: food.diet_monthly.map(x => x[key]),
                        })
                      ),
                    }}
                  />
                )}
              </div>
            </div>

            <div className="page-panel rounded-xl border bg-card p-5 shadow-xs space-y-3">
              <h2 className="text-base font-semibold text-foreground">Restaurant loyalty</h2>
              <Chart
                summary="Restaurant order count versus average order value"
                headers={['Restaurant', 'Orders', 'AOV']}
                rows={food.loyalty.map(x => [x.name, x.orders, x.aov])}
                option={{
                  tooltip: { renderMode: 'richText' },
                  grid: { left: 60, right: 25, bottom: 50, top: 20 },
                  xAxis: { type: 'value', name: 'Orders' },
                  yAxis: { type: 'value', name: 'AOV' },
                  series: [{ type: 'scatter', data: food.loyalty.map(x => ({ name: x.name, value: [x.orders, x.aov] })) }],
                }}
              />
            </div>

            <FoodLeaders />
          </div>
        ) : (
          <SpendingDetails charts={data.charts} />
        ))}
    </section>
  );
}
