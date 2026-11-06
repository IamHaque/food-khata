import { Link } from 'react-router-dom';
import { useDashboard, useHealth } from '../hooks/api';
import { serializeFilters } from '../lib/filters';
import { useFilters } from './FilterContext';
import { Chart } from './Chart';
import { ShieldCheck, ExternalLink } from 'lucide-react';

const MEAL_ORDER = ['breakfast', 'lunch', 'snack', 'dinner', 'late_night'];
const MEAL_LABELS: Record<string, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  snack: 'Snack',
  dinner: 'Dinner',
  late_night: 'Late night',
};

function BarsPanel({
  title,
  subtitle,
  yName,
  rows,
  valueFormatter,
}: {
  title: string;
  subtitle?: string;
  yName: string;
  rows: [string, number][];
  valueFormatter?: (v: number) => string;
}) {
  return (
    <div className="page-panel rounded-xl border bg-card p-5 shadow-xs space-y-3">
      <div>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      <Chart
        summary={title}
        headers={['Category', yName]}
        rows={rows.map(([k, v]) => [k, valueFormatter ? valueFormatter(v) : v])}
        option={{
          tooltip: {
            trigger: 'axis',
            renderMode: 'richText',
            valueFormatter: (val: unknown) =>
              val != null ? (valueFormatter ? valueFormatter(Number(val)) : Number(val).toLocaleString('en-IN')) : 'Unknown',
          },
          grid: { left: 70, right: 25, bottom: 65, top: 20 },
          xAxis: {
            type: 'category',
            data: rows.map(x => x[0]),
            axisLabel: { hideOverlap: true, fontSize: 11 },
          },
          yAxis: {
            type: 'value',
            name: yName,
            axisLabel: {
              formatter: (v: number) => (valueFormatter ? valueFormatter(v) : v.toLocaleString('en-IN')),
            },
          },
          series: [
            {
              name: yName,
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

  // Behavior data transformations
  const sortedMeals = [...b.meals]
    .sort((a, b) => {
      const idxA = MEAL_ORDER.indexOf(a.key.toLowerCase());
      const idxB = MEAL_ORDER.indexOf(b.key.toLowerCase());
      return (idxA !== -1 ? idxA : 99) - (idxB !== -1 ? idxB : 99);
    })
    .map(x => [MEAL_LABELS[x.key.toLowerCase()] ?? x.key, x.orders] as [string, number]);

  const sortedGaps = [...b.gaps]
    .sort((a, b) => a.days - b.days)
    .map(x => [`${x.days} ${x.days === 1 ? 'day' : 'days'}`, x.orders] as [string, number]);

  const sortedPlaces = [...p.labels].sort((a, b) => b.spend - a.spend);

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
            <p className="text-xs text-muted-foreground p-4 rounded-lg border bg-muted/20">
              {b.timing_unavailable_reason}
            </p>
          ) : (
            <>
              <div className="page-panel rounded-xl border bg-card p-5 shadow-xs space-y-3">
                <div>
                  <h2 className="text-base font-semibold text-foreground">Hour and weekday</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Order distribution by time of day and day of week. Unplotted slots indicate 0 recorded orders.
                  </p>
                </div>
                <Chart
                  summary="Order count by hour and weekday"
                  headers={['Day and hour', 'Orders']}
                  rows={b.hour_weekday.map(x => [
                    `${days[Math.floor(Number(x.key) / 24)]} ${String(Number(x.key) % 24).padStart(2, '0')}:00`,
                    x.orders,
                  ])}
                  option={{
                    tooltip: {
                      renderMode: 'richText',
                      formatter: (params: unknown) => {
                        const item = params as { value: [number, number, number] };
                        const day = days[item.value[1]];
                        const hour = String(item.value[0]).padStart(2, '0');
                        return `${day} ${hour}:00 - ${hour}:59<br/>Orders: <b>${item.value[2]}</b>`;
                      },
                    },
                    grid: { left: 50, right: 25, bottom: 60, top: 20 },
                    xAxis: {
                      type: 'category',
                      data: Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`),
                      axisLabel: { hideOverlap: true, fontSize: 11 },
                    },
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
                        name: 'Orders',
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

              <BarsPanel
                title="Meal slots"
                subtitle="Order volume grouped by standard meal windows"
                yName="Orders"
                rows={sortedMeals}
              />
            </>
          )}

          {b.date_unavailable_reason ? (
            <p className="text-xs text-muted-foreground p-4 rounded-lg border bg-muted/20">
              {b.date_unavailable_reason}
            </p>
          ) : (
            <>
              <BarsPanel
                title="Weekday vs weekend orders"
                subtitle="5 weekdays vs 2 weekend days per calendar week. Actual order counts are shown without preference normalization."
                yName="Orders"
                rows={b.day_type.map(x => [x.key.charAt(0).toUpperCase() + x.key.slice(1), x.orders])}
              />

              <BarsPanel
                title="Days between orders"
                subtitle="Frequency distribution of gap lengths between consecutive orders"
                yName="Orders"
                rows={sortedGaps}
              />
            </>
          )}

          <BarsPanel
            title="Order value distribution"
            subtitle="Frequency distribution of order total amounts across defined brackets"
            yName="Orders"
            rows={b.aov_histogram.map(x => [x.key, x.orders])}
          />
        </>
      ) : (
        /* Places page */
        <>
          <div className="p-3 rounded-lg border bg-muted/20 text-xs text-muted-foreground">
            <strong>Privacy notice:</strong> Only delivery labels and city names are displayed. Street addresses and
            geographic coordinates are intentionally excluded to protect privacy.
          </div>

          {p.unsupported_reason && (
            <p className="text-xs text-muted-foreground p-3 rounded-lg border bg-muted/20">{p.unsupported_reason}</p>
          )}

          {/* Destination spending (Ranked horizontal bars) */}
          <div className="page-panel rounded-xl border bg-card p-5 shadow-xs space-y-3">
            <div>
              <h2 className="text-base font-semibold text-foreground">Spend by delivery destination</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Total expenditure across approved delivery labels and cities
              </p>
            </div>

            {!sortedPlaces.length ? (
              <p className="text-xs text-muted-foreground p-4 text-center">No destination data available.</p>
            ) : (
              <Chart
                summary="Spend by delivery destination"
                headers={['Destination', 'City', 'Orders', 'Spend', 'Delivery fees']}
                rows={sortedPlaces.map(x => [
                  x.label,
                  x.city,
                  x.orders,
                  `₹${Math.round(x.spend).toLocaleString('en-IN')}`,
                  `₹${Math.round(x.fee).toLocaleString('en-IN')}`,
                ])}
                option={{
                  tooltip: {
                    trigger: 'axis',
                    renderMode: 'richText',
                    axisPointer: { type: 'shadow' },
                    valueFormatter: (val: unknown) =>
                      val != null ? `₹${Number(val).toLocaleString('en-IN')}` : 'Unknown',
                  },
                  grid: { left: 120, right: 30, bottom: 40, top: 15 },
                  xAxis: {
                    type: 'value',
                    name: 'Spend (₹)',
                    axisLabel: {
                      formatter: (v: number) => `₹${v.toLocaleString('en-IN')}`,
                    },
                  },
                  yAxis: {
                    type: 'category',
                    data: sortedPlaces.map(x => `${x.label} (${x.city})`).reverse(),
                    axisLabel: { fontSize: 11 },
                  },
                  series: [
                    {
                      name: 'Spend',
                      type: 'bar',
                      itemStyle: { borderRadius: [0, 4, 4, 0] },
                      data: sortedPlaces.map(x => x.spend).reverse(),
                    },
                  ],
                }}
              />
            )}
          </div>

          {/* Distance vs delivery fee */}
          {p.distance_unavailable_reason ? (
            <p className="text-xs text-muted-foreground p-3 rounded-lg border bg-muted/20">
              {p.distance_unavailable_reason}
            </p>
          ) : (
            <div className="page-panel rounded-xl border bg-card p-5 shadow-xs space-y-3">
              <div>
                <h2 className="text-base font-semibold text-foreground">Distance and delivery fee</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Observed net delivery fee relative to distance (km). Does not imply a causal relationship; delivery fees
                  depend on platform, time, surge, and promotions.
                </p>
              </div>

              <Chart
                summary="Restaurant distance versus net delivery fee"
                headers={['Distance (km)', 'Delivery fee (₹)']}
                rows={p.distances.map(x => [`${x.distance_km} km`, `₹${x.fee.toLocaleString('en-IN')}`])}
                option={{
                  tooltip: {
                    renderMode: 'richText',
                    formatter: (params: unknown) => {
                      const item = params as { value: [number, number] };
                      return `Distance: <b>${item.value[0]} km</b><br/>Net fee: <b>₹${item.value[1]}</b>`;
                    },
                  },
                  grid: { left: 70, right: 25, bottom: 50, top: 20 },
                  xAxis: { type: 'value', name: 'Distance (km)' },
                  yAxis: {
                    type: 'value',
                    name: 'Delivery fee (₹)',
                    axisLabel: {
                      formatter: (v: number) => `₹${v.toLocaleString('en-IN')}`,
                    },
                  },
                  series: [
                    {
                      name: 'Delivery fee',
                      type: 'scatter',
                      data: p.distances.map(x => [x.distance_km, x.fee]),
                    },
                  ],
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

  const nullRateLabels: Record<string, string> = {
    user_rating: 'User rating',
    food_discount: 'Food discount',
    delivery_fee_discount: 'Delivery discount',
    other_charges: 'Other charges',
    restaurant_name: 'Restaurant name',
    address_label: 'Address label',
    city: 'City',
    items_summary: 'Items summary',
    item_subtotal: 'Item subtotal',
    total_discount: 'Total discount',
    reported_savings: 'Reported savings',
    delivery_fee: 'Delivery fee',
    packaging_fee: 'Packaging fee',
    platform_fee: 'Platform fee',
    total_tax: 'Total tax',
    tip: 'Tip',
    refund_amount: 'Refund amount',
  };

  const nullRateRows = h
    ? Object.entries(h.null_rates)
        .filter((x): x is [string, number] => x[1] !== null)
        .map(([k, v]) => [nullRateLabels[k] ?? k, v] as [string, number])
        .sort((a, b) => b[1] - a[1])
    : [];

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
                <span className="text-muted-foreground block text-[11px]">History Coverage</span>
                <strong className="font-semibold text-foreground">
                  {h.history_complete ? 'Complete' : 'Partial scope'}
                </strong>
              </div>
              <div className="p-3 rounded-lg border bg-muted/20">
                <span className="text-muted-foreground block text-[11px]">Details Coverage</span>
                <strong className="font-semibold text-foreground">
                  {h.details_complete ? 'Complete' : 'Partial scope'}
                </strong>
              </div>
              <div className="p-3 rounded-lg border bg-muted/20">
                <span className="text-muted-foreground block text-[11px]">Verified Rate</span>
                <strong className="font-semibold text-foreground">
                  {h.verified_percent != null ? `${h.verified_percent}%` : 'Unknown'}
                </strong>
              </div>
              <div className="p-3 rounded-lg border bg-muted/20">
                <span className="text-muted-foreground block text-[11px]">Reconciliation Anomalies</span>
                <strong className="font-semibold text-foreground">{h.reconciliation_anomalies}</strong>
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground">
              Note: Lifetime coverage indicates whether the entire historical account record was imported. Partial scope
              is normal and expected when filtering by date or accounts without full historical imports.
            </p>

            <Link
              to={{ pathname: '/ledger', search: serializeFilters({ ...filters, anomaly: 'review' }).toString() }}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline pt-2 min-h-[44px]"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span>Review unverified and anomalous orders</span>
            </Link>
          </div>

          <BarsPanel
            title="Missing field rates (%)"
            subtitle="Percentage of orders with null or missing data values across optional fields"
            yName="Missing rate (%)"
            rows={nullRateRows}
            valueFormatter={(v: number) => `${v.toFixed(1)}%`}
          />

          <div className="page-panel rounded-xl border bg-card p-5 shadow-xs space-y-3">
            <div>
              <h2 className="text-base font-semibold text-foreground">Import coverage</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Sync and detail coverage status by account and platform
              </p>
            </div>
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
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-foreground border">
                          {x.history_complete ? 'Complete' : 'Partial scope'}
                        </span>
                      </td>
                      <td className="p-2.5 text-center font-sans">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-foreground border">
                          {x.details_complete ? 'Complete' : 'Partial scope'}
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
