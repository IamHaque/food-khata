import { useDashboard, useDashboardCompare } from '../hooks/api';
import { useFilters } from './FilterContext';
import { ScopeNotice } from './SyncStatusPanel';
import { InsightStrip, OverviewKpis } from '@/components/dashboard';
import { MonthlyTrendChart } from '@/components/charts/MonthlyTrendChart';
import { PlatformSplitChart } from '@/components/charts/PlatformSplitChart';
import { CalendarHeatmapChart } from '@/components/charts/CalendarHeatmapChart';
import { TopRestaurantsDishesChart } from '@/components/charts/TopRestaurantsDishesChart';
import '../styles/overview.css';

export function Overview() {
  const { filters, update, clear } = useFilters();
  const query = useDashboard(filters);
  const compareQuery = useDashboardCompare(filters);
  const data = query.data;
  const compareData = compareQuery.data;

  return (
    <section aria-busy={query.isFetching} className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Overview</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Financial KPIs, monthly trends, and spending composition for the active scope
          </p>
        </div>
      </div>

      <ScopeNotice />

      {query.isPending ? (
        <section
          className="page-panel overview-loading rounded-xl border bg-card p-8 shadow-xs text-center"
          role="status"
          aria-label="Loading overview"
        >
          <div className="flex flex-col items-center justify-center gap-3">
            <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            <p className="text-sm font-medium text-muted-foreground">Loading overview analytics…</p>
          </div>
        </section>
      ) : query.isError ? (
        <section className="page-panel rounded-xl border border-destructive/20 bg-destructive/10 p-6" role="alert">
          <p className="text-sm font-medium text-destructive">Overview could not load.</p>
          <button
            onClick={() => void query.refetch()}
            className="mt-3 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium shadow-xs hover:bg-accent"
          >
            Retry
          </button>
        </section>
      ) : !data || !data.kpis?.orders ? (
        <div className="page-panel rounded-xl border bg-card p-8 text-center shadow-xs space-y-3">
          <p className="text-base font-semibold text-foreground">No orders match these filters.</p>
          <p className="text-xs text-muted-foreground">Try clearing date restrictions, account filters, or search terms.</p>
          <button
            onClick={clear}
            className="rounded-md border border-input bg-background px-4 py-2 text-xs font-semibold shadow-xs hover:bg-accent transition-colors"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <>
          <InsightStrip
            insights={data.charts?.insights}
            onApplyFilterPatch={(patch) => update(patch)}
          />

          <OverviewKpis
            data={data}
            kpis={data.kpis}
            comparison={data.comparison}
            isLoading={query.isLoading}
          />

          {/* Primary Charts Grid */}
          <div className="space-y-4">
            {/* Row 1 */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-8">
                <MonthlyTrendChart
                  data={data.charts?.monthly}
                  compareData={compareData}
                  isLoading={query.isLoading}
                />
              </div>
              <div className="lg:col-span-4">
                <PlatformSplitChart
                  data={data.charts?.platforms}
                  totalSpend={data.kpis?.spend}
                  isLoading={query.isLoading}
                />
              </div>
            </div>

            {/* Row 2 */}
            <CalendarHeatmapChart
              data={data.charts?.calendar}
              isLoading={query.isLoading}
            />

            {/* Row 3 */}
            <TopRestaurantsDishesChart
              restaurants={data.charts?.top_restaurants}
              dishes={data.charts?.top_dishes}
              isLoading={query.isLoading}
            />
          </div>
        </>
      )}
    </section>
  );
}

export default Overview;
