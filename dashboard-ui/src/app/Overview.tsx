import { useDashboard, useDashboardCompare } from '../hooks/api';
import { useFilters } from './FilterContext';
import { ScopeNotice } from './SyncStatusPanel';
import { InsightStrip, OverviewKpis, PageLoading, PageError, PageEmpty } from '@/components/dashboard';
import { PageHeader } from '@/components/ui/page-header';
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
      <PageHeader title="Overview" description="Your total spend, how it trends month by month, and who you order from." />

      <ScopeNotice />

      {query.isPending ? (
        <PageLoading label="Loading overview" />
      ) : query.isError ? (
        <PageError what="Overview" onRetry={() => void query.refetch()} />
      ) : !data || !data.kpis?.orders ? (
        <PageEmpty onClear={clear} />
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
