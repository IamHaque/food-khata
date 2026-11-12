import { SpendingDetails } from './SpendingDetails';
import { FoodLeaders } from './FoodLeaders';
import { useDashboard } from '../hooks/api';
import { useFilters } from './FilterContext';
import { PageHeader } from '../components/ui/page-header';
import { Button } from '../components/ui/button';
import { PageLoading, PageError, PageEmpty } from '../components/dashboard';
import { Chart } from './Chart';
import { moneyAxis, timeAxis, inrTooltip } from '../lib/chart-kit';
import { CuisineTreemapChart, NewVsRepeatChart, LoyaltyParetoChart, DietSplitTrendChart, DishRankingChart, HourWeekdayHeatmapChart, MealSlotsChart, WeekdayBarsChart, OrderGapsHistogramChart, DeliveryDestinationsChart, DistanceVsFeeChart, StreakTimelineChart, OrdersPerWeekChart } from '../components/charts';

export function AnalyticsPage({ page }: { page: 'Food' | 'Spending' | 'Habits' }) {
  const { filters, clear } = useFilters();
  const query = useDashboard(filters);
  const data = query.data;

  const title = { Spending: 'Spending', Food: 'Food', Habits: 'Habits' }[page];
  const description =
    page === 'Food'
      ? 'Cuisines, dishes, diet and the restaurants you return to.'
      : page === 'Habits'
      ? 'When you order, how often, and where it goes.'
      : 'Where the money goes: daily spend, fees, discounts and year-on-year change.';

  if (!data)
    return (
      <section className="space-y-5" aria-busy={query.isPending}>
        <PageHeader title={title} description={description} />
        {query.isError ? <PageError what={page} onRetry={() => void query.refetch()} /> : <PageLoading label={`Loading ${page}`} />}
      </section>
    );

  const food = data.charts.food;
  const spending = data.charts.spending;

  const spendingPanels = [
    {
      title: 'Daily spend',
      subtitle: 'What you paid each day, after discounts.',
      labels: spending.daily.map(x => x.date),
      values: spending.daily.map(x => x.spend),
    },
    {
      title: 'Rolling 30-day spend',
      subtitle: 'Total spent over the 30 days up to each date. It is a sum, not a daily average.',
      labels: spending.daily.map(x => x.date),
      values: spending.daily.map(x => x.rolling_30),
    },
  ];

  return (
    <section aria-busy={query.isFetching} className="space-y-6">
      <PageHeader title={title} description={description} />

      {query.isError && (
        <p role="alert" className="notice notice-danger items-center">
          <span className="flex-1">Could not refresh this page. The numbers shown may be out of date.</span>
          <Button variant="outline" size="sm" onClick={() => void query.refetch()}>Retry</Button>
        </p>
      )}

      {!data.kpis.orders ? (
        <PageEmpty onClear={clear} />
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
      ) : page === 'Habits' ? (
        /* Habits page view */
        <div className="space-y-6">
          <HourWeekdayHeatmapChart
            data={data.charts.behavior.hour_weekday}
            timing_unavailable_reason={data.charts.behavior.timing_unavailable_reason}
          />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <WeekdayBarsChart
              data={data.charts.behavior.hour_weekday}
              day_type={data.charts.behavior.day_type}
              date_unavailable_reason={data.charts.behavior.date_unavailable_reason}
            />
            <MealSlotsChart
              data={data.charts.behavior.meals}
              timing_unavailable_reason={data.charts.behavior.timing_unavailable_reason}
            />
          </div>
          <OrdersPerWeekChart
            calendar={data.charts.calendar}
            orders_per_week={data.charts.behavior.orders_per_week}
          />
          <OrderGapsHistogramChart
            gaps={data.charts.behavior.gaps}
            longest_gap={data.charts.behavior.longest_gap}
            date_unavailable_reason={data.charts.behavior.date_unavailable_reason}
          />
          <StreakTimelineChart
            calendar={data.charts.calendar}
            longest_streak={data.charts.behavior.longest_streak}
          />
          <DeliveryDestinationsChart
            data={data.charts.places}
            unsupported_reason={data.charts.places.unsupported_reason}
          />
          <DistanceVsFeeChart
            distances={data.charts.places.distances}
            distance_unavailable_reason={data.charts.places.distance_unavailable_reason}
          />
        </div>
      ) : (
        /* Spending page view */
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {spendingPanels.map(panel => (
              <div className="rounded-card border bg-card p-[var(--space-card)] space-y-3" key={panel.title}>
                <div>
                  <h2 className="text-base font-semibold text-foreground">{panel.title}</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">{panel.subtitle}</p>
                </div>
                <Chart
                  summary={panel.title}
                  headers={['Period or group', panel.title]}
                  rows={panel.labels.map((label, i) => [label, panel.values[i]])}
                  option={{
                    tooltip: { trigger: 'axis', renderMode: 'richText', valueFormatter: inrTooltip },
                    grid: { left: 56, right: 16, bottom: 32, top: 16 },
                    xAxis: timeAxis(),
                    yAxis: moneyAxis(),
                    series: [
                      {
                        name: panel.title,
                        type: 'line',
                        showSymbol: false,
                        lineStyle: { width: 1.75 },
                        data: panel.labels.map((label, i) => [label, panel.values[i]]),
                      },
                    ],
                  }}
                />
              </div>
            ))}
          </div>

          <details className="rounded-card border bg-card p-[var(--space-card)] space-y-3 group">
            <summary className="cursor-pointer text-sm font-semibold text-foreground flex items-center justify-between min-h-[44px]">
              <div className="flex items-center gap-2">
                <span>Cumulative spend trajectory</span>
                <span className="text-sm text-muted-foreground font-normal">Show</span>
              </div>
              <span className="text-xs text-muted-foreground group-open:rotate-180 transition-transform">▼</span>
            </summary>
            <p className="text-sm text-muted-foreground">
              Accumulation starts at the beginning of the applied scope window (
              {filters.date_from ?? 'earliest recorded order'}). Does not represent total account history when date filters
              are restricted.
            </p>
            <Chart
              summary="Cumulative spend trajectory"
              headers={['Date', 'Cumulative spend']}
              rows={spending.daily.map(x => [x.date, x.cumulative])}
              option={{
                tooltip: { trigger: 'axis', renderMode: 'richText', valueFormatter: inrTooltip },
                grid: { left: 56, right: 16, bottom: 32, top: 16 },
                xAxis: timeAxis(),
                yAxis: moneyAxis(),
                series: [
                  {
                    name: 'Cumulative spend',
                    type: 'line',
                    showSymbol: false,
                    lineStyle: { width: 1.75 },
                    data: spending.daily.map(x => [x.date, x.cumulative]),
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
