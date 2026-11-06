import { Link } from 'react-router-dom';
import { useDashboard, useHealth } from '../hooks/api';
import { serializeFilters } from '../lib/filters';
import { useFilters } from './FilterContext';
import { Chart } from './Chart';
import { ShieldCheck, ExternalLink } from 'lucide-react';

function Bars({ title, rows }: { title: string; rows: [string, number][] }) {
  return (
    <div className="page-panel rounded-xl border bg-card p-5 shadow-xs space-y-3">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <Chart
        summary={title}
        headers={['Group', 'Value']}
        rows={rows}
        option={{
          tooltip: { trigger: 'axis', renderMode: 'richText' },
          grid: { left: 70, right: 25, bottom: 65, top: 20 },
          xAxis: { type: 'category', data: rows.map(x => x[0]), axisLabel: { hideOverlap: true, fontSize: 11 } },
          yAxis: { type: 'value' },
          series: [
            {
              type: 'bar',
              itemStyle: { borderRadius: [4, 4, 0, 0] },
              data: rows.map(x => x[1]),
            },
          ],
        }}
      />
    </div>
  );
}

export function DataPage({ page }: { page: 'Behavior' | 'Places' }) {
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
              Retry {page}
            </button>
          </div>
        ) : (
          'Loading…'
        )}
      </section>
    );

  const b = data.charts.behavior;
  const p = data.charts.places;
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <section aria-busy={query.isFetching} className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{page}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {page === 'Behavior'
              ? 'Ordering rhythm, temporal habits, and basket sizes'
              : 'Delivery destinations, delivery fees, and distance patterns'}
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
          <p className="font-semibold text-foreground text-sm">No matching orders.</p>
          <button
            onClick={clear}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium shadow-xs hover:bg-accent"
          >
            Clear filters
          </button>
        </div>
      ) : page === 'Behavior' ? (
        <>
          <div className="page-panel rounded-xl border bg-card p-4 shadow-xs">
            <h2 className="text-base font-semibold text-foreground mb-2">Ordering rhythm</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3 rounded-lg border bg-muted/20">
                <span className="text-muted-foreground block text-[11px]">Orders / week</span>
                <strong className="text-lg font-bold font-mono text-foreground">
                  {b.orders_per_week ?? 'Unknown'}
                </strong>
              </div>
              <div className="p-3 rounded-lg border bg-muted/20">
                <span className="text-muted-foreground block text-[11px]">Longest streak</span>
                <strong className="text-lg font-bold font-mono text-foreground">
                  {b.longest_streak != null ? `${b.longest_streak} days` : 'Unknown'}
                </strong>
              </div>
              <div className="p-3 rounded-lg border bg-muted/20">
                <span className="text-muted-foreground block text-[11px]">Longest gap</span>
                <strong className="text-lg font-bold font-mono text-foreground">
                  {b.longest_gap != null ? `${b.longest_gap} days` : 'Unknown'}
                </strong>
              </div>
            </div>
          </div>

          {b.timing_unavailable_reason ? (
            <p className="text-xs text-muted-foreground p-4 rounded-lg border bg-muted/20">{b.timing_unavailable_reason}</p>
          ) : (
            <>
              <div className="page-panel rounded-xl border bg-card p-5 shadow-xs space-y-3">
                <h2 className="text-base font-semibold text-foreground">Hour and weekday</h2>
                <Chart
                  summary="Order count by hour and weekday"
                  headers={['Day and hour', 'Orders']}
                  rows={b.hour_weekday.map(x => [
                    `${days[Math.floor(Number(x.key) / 24)]} ${Number(x.key) % 24}:00`,
                    x.orders,
                  ])}
                  option={{
                    tooltip: { renderMode: 'richText' },
                    grid: { left: 50, right: 25, bottom: 60, top: 20 },
                    xAxis: { type: 'category', data: Array.from({ length: 24 }, (_, i) => `${i}:00`) },
                    yAxis: { type: 'category', data: days },
                    visualMap: {
                      min: 0,
                      max: Math.max(1, ...b.hour_weekday.map(x => x.orders)),
                      orient: 'horizontal',
                      bottom: 0,
                      left: 'center',
                    },
                    series: [
                      {
                        type: 'heatmap',
                        data: b.hour_weekday.map(x => [
                          Number(x.key) % 24,
                          Math.floor(Number(x.key) / 24),
                          x.orders,
                        ]),
                      },
                    ],
                  }}
                />
              </div>
              <Bars title="Meal slots" rows={b.meals.map(x => [x.key, x.orders])} />
            </>
          )}

          {b.date_unavailable_reason ? (
            <p className="text-xs text-muted-foreground p-4 rounded-lg border bg-muted/20">{b.date_unavailable_reason}</p>
          ) : (
            <>
              <Bars title="Weekday and weekend" rows={b.day_type.map(x => [x.key, x.orders])} />
              <Bars title="Days between orders" rows={b.gaps.map(x => [String(x.days), x.orders])} />
            </>
          )}

          <Bars title="Order value distribution" rows={b.aov_histogram.map(x => [x.key, x.orders])} />
        </>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">Only address labels and cities are shown.</p>
          {p.unsupported_reason && (
            <p className="text-xs text-muted-foreground p-3 rounded-lg border bg-muted/20">{p.unsupported_reason}</p>
          )}
          <Bars title="Spend by delivery label" rows={p.labels.map(x => [`${x.label} · ${x.city}`, x.spend])} />
          {p.distance_unavailable_reason ? (
            <p className="text-xs text-muted-foreground p-3 rounded-lg border bg-muted/20">{p.distance_unavailable_reason}</p>
          ) : (
            <div className="page-panel rounded-xl border bg-card p-5 shadow-xs space-y-3">
              <h2 className="text-base font-semibold text-foreground">Distance and delivery fee</h2>
              <Chart
                summary="Restaurant distance versus net delivery fee"
                headers={['Distance km', 'Delivery fee']}
                rows={p.distances.map(x => [x.distance_km, x.fee])}
                option={{
                  tooltip: { renderMode: 'richText' },
                  grid: { left: 60, right: 25, bottom: 50, top: 20 },
                  xAxis: { type: 'value', name: 'km' },
                  yAxis: { type: 'value', name: 'Fee' },
                  series: [{ type: 'scatter', data: p.distances.map(x => [x.distance_km, x.fee]) }],
                }}
              />
            </div>
          )}
        </>
      )}
    </section>
  );
}

export function HealthPage() {
  const { filters } = useFilters();
  const query = useHealth(filters);
  const h = query.data;

  return (
    <section aria-busy={query.isFetching} className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Data health</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Audit coverage, source reconciliation integrity, and import completeness
          </p>
        </div>
      </div>

      {query.isError && (
        <p role="alert" className="text-xs font-medium text-destructive flex items-center gap-2">
          <span>Health could not refresh.</span>
          <button
            onClick={() => void query.refetch()}
            className="rounded border border-input px-2 py-0.5 bg-background shadow-2xs hover:bg-accent"
          >
            Retry
          </button>
        </p>
      )}

      {!h ? (
        <p role="status" className="p-8 text-center text-xs text-muted-foreground animate-pulse">
          Loading health…
        </p>
      ) : (
        <>
          <div className="page-panel rounded-xl border bg-card p-5 shadow-xs space-y-4">
            <div className="flex items-center gap-2 text-primary font-semibold text-sm">
              <ShieldCheck className="h-4 w-4" />
              <span>Scope Integrity Summary</span>
            </div>
            <p className="text-xs text-muted-foreground">{h.note}</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded-lg border bg-muted/20">
                <span className="text-muted-foreground block text-[11px]">History Complete</span>
                <strong className={`font-semibold ${h.history_complete ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {h.history_complete ? 'Complete' : 'Incomplete'}
                </strong>
              </div>
              <div className="p-3 rounded-lg border bg-muted/20">
                <span className="text-muted-foreground block text-[11px]">Details Complete</span>
                <strong className={`font-semibold ${h.details_complete ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {h.details_complete ? 'Complete' : 'Incomplete'}
                </strong>
              </div>
              <div className="p-3 rounded-lg border bg-muted/20">
                <span className="text-muted-foreground block text-[11px]">Verified Rate</span>
                <strong className="font-semibold text-foreground">{h.verified_percent ?? 'Unknown'}%</strong>
              </div>
              <div className="p-3 rounded-lg border bg-muted/20">
                <span className="text-muted-foreground block text-[11px]">Anomalies</span>
                <strong className="font-semibold text-foreground">{h.reconciliation_anomalies}</strong>
              </div>
            </div>

            <Link
              to={{ pathname: '/ledger', search: serializeFilters({ ...filters, anomaly: 'review' }).toString() }}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline pt-2"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span>Review unverified and anomalous orders</span>
            </Link>
          </div>

          <Bars
            title="Missing field rates (%)"
            rows={Object.entries(h.null_rates).filter((x): x is [string, number] => x[1] !== null)}
          />

          <div className="page-panel rounded-xl border bg-card p-5 shadow-xs space-y-3">
            <h2 className="text-base font-semibold text-foreground">Import coverage</h2>
            <div className="overview-scroll rounded-lg border overflow-x-auto" tabIndex={0}>
              <table className="w-full text-xs">
                <thead className="bg-muted/40 border-b">
                  <tr>
                    <th className="text-left p-2.5 font-medium">Account ID</th>
                    <th className="text-left p-2.5 font-medium">Platform</th>
                    <th className="text-center p-2.5 font-medium">History</th>
                    <th className="text-center p-2.5 font-medium">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y font-mono">
                  {h.imports.map(x => (
                    <tr key={`${x.account_id}:${x.platform}`} className="hover:bg-muted/30">
                      <td className="p-2.5">{x.account_id}</td>
                      <td className="p-2.5 font-semibold">{x.platform}</td>
                      <td className="p-2.5 text-center font-sans">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            x.history_complete ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600'
                          }`}
                        >
                          {x.history_complete ? 'Complete' : 'Incomplete'}
                        </span>
                      </td>
                      <td className="p-2.5 text-center font-sans">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            x.details_complete ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600'
                          }`}
                        >
                          {x.details_complete ? 'Complete' : 'Incomplete'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
