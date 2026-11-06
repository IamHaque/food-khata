import { useMemo } from 'react';
import { useDashboard } from '../hooks/api';
import { useFilters } from './FilterContext';
import { Chart } from './Chart';
import {
  TrendingUp,
  ShoppingBag,
  Receipt,
  BadgePercent,
  Percent,
  Info,
  Sparkles,
  UtensilsCrossed,
  ChefHat,
  Flame,
  CalendarDays,
} from 'lucide-react';
import '../styles/overview.css';

const num = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
const money = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function Sparkline({ values, label }: { values: (number | null)[]; label: string }) {
  const finite = values.filter((x): x is number => x !== null);
  if (!finite.length) return <div className="h-7 w-28 bg-muted/20 rounded animate-pulse" />;
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const points = values.map((v, i) => {
    if (v === null) return null;
    const x = values.length < 2 ? 60 : i * (120 / (values.length - 1)) + 4;
    const y = max === min ? 14 : 26 - ((v - min) * 22) / (max - min);
    return { x, y };
  });

  const validPoints = points.filter((p): p is { x: number; y: number } => p !== null);
  const pathData = validPoints.reduce(
    (acc, p, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`,
    ''
  );

  return (
    <svg role="img" aria-label={label} viewBox="0 0 128 28" className="w-28 h-7 overflow-visible">
      <path d={pathData} fill="none" stroke="currentColor" strokeWidth="1.75" className="text-primary/70" />
      {validPoints.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="1.5" className="fill-primary" />
      ))}
    </svg>
  );
}

const metricIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  spend: TrendingUp,
  orders: ShoppingBag,
  aov: Receipt,
  total_discount: BadgePercent,
  reported_savings: Percent,
};

export function Overview() {
  const { filters, update, clear } = useFilters();
  const query = useDashboard(filters);
  const data = query.data;

  const monthly = useMemo(
    () => ({
      tooltip: { trigger: 'axis' as const },
      legend: { top: 0 },
      grid: { left: 65, right: 55, bottom: 40, top: 40 },
      xAxis: { type: 'category' as const, data: data?.charts.monthly.map(x => x.month ?? 'Unknown') },
      yAxis: [
        { type: 'value' as const, name: 'Spend (₹)' },
        { type: 'value' as const, name: 'Orders' },
      ],
      series: [
        {
          name: 'Spend',
          type: 'bar',
          itemStyle: { borderRadius: [4, 4, 0, 0] },
          data: data?.charts.monthly.map(x => x.spend),
        },
        {
          name: 'Orders',
          type: 'line',
          yAxisIndex: 1,
          smooth: true,
          data: data?.charts.monthly.map(x => x.orders),
        },
      ],
    }),
    [data]
  );

  if (!data && query.isPending)
    return (
      <section className="page-panel overview-loading rounded-xl border bg-card p-8 shadow-xs text-center" role="status">
        <div className="flex flex-col items-center justify-center gap-3">
          <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-sm font-medium text-muted-foreground">Loading overview analytics…</p>
        </div>
      </section>
    );

  if (!data && query.isError)
    return (
      <section className="page-panel rounded-xl border border-destructive/20 bg-destructive/10 p-6" role="alert">
        <p className="text-sm font-medium text-destructive">Overview could not load.</p>
        <button
          onClick={() => void query.refetch()}
          className="mt-3 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium shadow-xs hover:bg-accent"
        >
          Retry
        </button>
      </section>
    );

  if (!data) return null;

  const k = data.kpis;
  const primaryMetrics: [keyof typeof k, string, string, string][] = [
    ['spend', 'Spend', 'money', 'Total provider-paid amount'],
    ['orders', 'Orders', 'number', 'Number of orders'],
    ['aov', 'Average order value', 'money', 'Spend divided by valid orders'],
    ['total_discount', 'Explicit discounts', 'money', 'Total explicit discounts'],
    ['reported_savings', 'Advertised savings', 'money', 'Provider-reported savings'],
  ];

  const secondaryMetrics: [keyof typeof k, string, string, string][] = [
    ['discount_rate', 'Discount rate', 'percent', 'Explicit discounts divided by spend plus explicit discounts'],
    ['reported_savings_rate', 'Advertised savings rate', 'percent', 'Reported savings divided by spend plus reported savings'],
    ['fees', 'Fees', 'money', 'Total fees'],
    ['fee_percentage', 'Fees percentage', 'percent', 'Fees divided by spend'],
    ['tax', 'Tax', 'money', 'Total tax'],
    ['tips', 'Tips', 'money', 'Total tips'],
    ['refunds', 'Refunds', 'money', 'Total refunds'],
    ['unique_restaurants', 'Restaurants', 'number', 'Unique restaurants'],
    ['unique_dishes', 'Dishes', 'number', 'Unique dishes'],
    ['average_rating', 'Average rating', 'number', 'Average available rating'],
  ];

  return (
    <section aria-busy={query.isFetching} className="space-y-6">
      {/* Title */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Overview</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Financial KPIs, monthly trends, and spending composition for the active scope
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

      {!k.orders ? (
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
          {/* Hero Row: Top 5 Primary KPI Cards */}
          <div className="overview-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
            {primaryMetrics.map(([key, label, format, formula]) => {
              const value = k[key];
              const delta = data.comparison?.percent_change[key];
              const Icon = metricIcons[key] ?? TrendingUp;
              return (
                <div
                  className="page-panel overview-card rounded-xl border bg-card p-4 shadow-xs hover:shadow-sm transition-shadow flex flex-col justify-between gap-3"
                  key={key}
                >
                  <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Icon className="h-3.5 w-3.5 text-primary" />
                      <span>{label}</span>
                    </div>
                    <details className="kpi-formula group relative">
                      <summary className="cursor-pointer list-none text-muted-foreground/60 hover:text-foreground">
                        <Info className="h-3.5 w-3.5" />
                      </summary>
                      <div className="absolute right-0 top-5 z-20 w-44 rounded-md border bg-popover p-2 text-[11px] text-popover-foreground shadow-md">
                        <p className="m-0">{formula}</p>
                      </div>
                    </details>
                  </div>

                  <strong
                    className="text-2xl font-bold font-mono tracking-tight text-foreground truncate block"
                    title={value === null ? 'Unknown' : format === 'money' ? money.format(value) : String(value)}
                  >
                    {value === null
                      ? 'Unknown'
                      : format === 'money'
                      ? money.format(value)
                      : `${num.format(value)}${format === 'percent' ? '%' : ''}`}
                  </strong>

                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/40">
                    <Sparkline
                      label={`${label} monthly trend`}
                      values={data.charts.kpi_history.map(x => x[key])}
                    />
                    {data.comparison && (
                      <small
                        className={`text-[11px] font-semibold font-mono ${
                          delta != null && delta >= 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {delta == null ? 'Unknown' : `${delta > 0 ? '+' : ''}${num.format(delta)}%`}
                      </small>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Secondary KPI Row */}
          <div className="overview-grid grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
            {secondaryMetrics.map(([key, label, format, formula]) => {
              const value = k[key];
              const delta = data.comparison?.percent_change[key];
              return (
                <div
                  className="page-panel overview-card rounded-lg border bg-card/60 p-3 shadow-2xs hover:bg-card transition-colors flex flex-col justify-between gap-1"
                  key={key}
                >
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span className="truncate">{label}</span>
                    <details className="kpi-formula group relative">
                      <summary className="cursor-pointer list-none text-muted-foreground/60 hover:text-foreground">
                        <Info className="h-3 w-3" />
                      </summary>
                      <div className="absolute right-0 top-4 z-20 w-40 rounded-md border bg-popover p-1.5 text-[10px] text-popover-foreground shadow-md">
                        <p className="m-0">{formula}</p>
                      </div>
                    </details>
                  </div>
                  <strong
                    className="text-base font-bold font-mono tracking-tight text-foreground truncate block"
                    title={value === null ? 'Unknown' : format === 'money' ? money.format(value) : String(value)}
                  >
                    {value === null
                      ? 'Unknown'
                      : format === 'money'
                      ? money.format(value)
                      : `${num.format(value)}${format === 'percent' ? '%' : ''}`}
                  </strong>
                  {data.comparison && (
                    <small className="text-[10px] text-muted-foreground font-mono">
                      {delta == null ? 'Unknown' : `${delta > 0 ? '+' : ''}${num.format(delta)}%`}
                    </small>
                  )}
                </div>
              );
            })}

            {/* Habit Stats: Orders per week & Longest streak */}
            <div className="page-panel overview-card rounded-lg border bg-card/60 p-3 shadow-2xs flex flex-col justify-between gap-1">
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <CalendarDays className="h-3 w-3 text-muted-foreground" />
                Orders / week
              </span>
              <strong className="text-base font-bold font-mono tracking-tight text-foreground truncate block">
                {data.charts.behavior.orders_per_week == null
                  ? 'Unknown'
                  : num.format(data.charts.behavior.orders_per_week)}
              </strong>
            </div>

            <div className="page-panel overview-card rounded-lg border bg-card/60 p-3 shadow-2xs flex flex-col justify-between gap-1">
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Flame className="h-3 w-3 text-orange-500" />
                Longest streak
              </span>
              <strong className="text-base font-bold font-mono tracking-tight text-foreground truncate block">
                {data.charts.behavior.longest_streak == null
                  ? 'Unknown'
                  : `${num.format(data.charts.behavior.longest_streak)} days`}
              </strong>
            </div>
          </div>

          {/* Monthly Spend and Orders Chart Card */}
          <div className="page-panel rounded-xl border bg-card p-5 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
              <div>
                <h2 className="text-base font-semibold text-foreground">Monthly spend and orders</h2>
                <p className="text-xs text-muted-foreground">Historical monthly expenditure and total volume</p>
              </div>
            </div>
            <Chart
              option={monthly}
              summary="Monthly spend and orders"
              headers={['Month', 'Spend', 'Orders']}
              rows={data.charts.monthly.map(x => [x.month, money.format(x.spend), x.orders])}
            />
          </div>

          {/* Bill Composition Waterfall Card */}
          <div className="page-panel rounded-xl border bg-card p-5 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
              <div>
                <h2 className="text-base font-semibold text-foreground">Bill composition</h2>
                <p className="text-xs text-muted-foreground">
                  Subtotal, discounts, fees, and final provider-paid balance
                </p>
              </div>
            </div>
            <Chart
              summary="Bill components and provider paid"
              headers={['Component', 'Amount']}
              rows={data.charts.waterfall_steps.map(x => [x.label, x.amount])}
              option={{
                tooltip: { trigger: 'axis', renderMode: 'richText' },
                grid: { left: 80, right: 25, bottom: 80, top: 20 },
                xAxis: {
                  type: 'category',
                  data: data.charts.waterfall_steps.map(x => x.label),
                  axisLabel: { rotate: 30, interval: 0, fontSize: 11 },
                },
                yAxis: { type: 'value' },
                series: [
                  {
                    type: 'bar',
                    stack: 'bill',
                    silent: true,
                    itemStyle: { color: 'transparent' },
                    data: data.charts.waterfall_steps.map(x => x.baseline),
                  },
                  {
                    name: 'Amount',
                    type: 'bar',
                    stack: 'bill',
                    itemStyle: { borderRadius: [4, 4, 0, 0] },
                    data: data.charts.waterfall_steps.map(x => x.height),
                  },
                ],
              }}
            />
            <p className="text-xs text-muted-foreground">
              Provider paid is shown separately; components may not reconcile.
            </p>
            <div className="overview-scroll rounded-lg border overflow-hidden mt-3">
              <table className="w-full text-xs">
                <tbody>
                  {Object.entries(data.charts.cost_waterfall).map(([key, value]) => (
                    <tr key={key} className="border-b last:border-0 hover:bg-muted/30">
                      <th className="text-left font-medium p-2.5 text-muted-foreground capitalize">
                        {key.replaceAll('_', ' ')}
                      </th>
                      <td className="text-right font-mono font-medium p-2.5">{money.format(value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Top Restaurants & Top Dishes Grid */}
          <div className="overview-grid grid grid-cols-1 md:grid-cols-2 gap-4">
            {(
              [
                ['Restaurants', data.charts.top_restaurants, UtensilsCrossed],
                ['Dishes', data.charts.top_dishes, ChefHat],
              ] as const
            ).map(([title, items, Icon]) => (
              <div className="page-panel rounded-xl border bg-card p-5 shadow-xs" key={title}>
                <div className="flex items-center gap-2 border-b pb-3 mb-3">
                  <Icon className="h-4 w-4 text-primary" />
                  <h2 className="text-base font-semibold text-foreground">Top {title}</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="text-left pb-2 font-medium">Name</th>
                        <th className="text-right pb-2 font-medium">Quantity</th>
                        <th className="text-right pb-2 font-medium">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {items.slice(0, 5).map(item => (
                        <tr key={item.key} className="hover:bg-muted/30 transition-colors">
                          <td className="py-2.5 pr-2 font-medium max-w-[200px] truncate" title={item.name}>
                            <span className="overview-truncate block truncate">{item.name}</span>
                          </td>
                          <td className="py-2.5 text-right font-mono text-muted-foreground">{item.quantity}</td>
                          <td className="py-2.5 text-right font-mono font-semibold">{money.format(item.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>

          {/* Monthly KPI History Table (Collapsible) */}
          <details className="page-panel rounded-xl border bg-card p-4 shadow-xs group">
            <summary className="cursor-pointer text-xs font-semibold text-muted-foreground hover:text-foreground select-none flex items-center gap-2">
              <span>Monthly KPI values</span>
            </summary>
            <div className="overview-scroll rounded-lg border overflow-x-auto mt-3" tabIndex={0}>
              <table className="w-full text-xs">
                <thead className="bg-muted/40">
                  <tr className="border-b">
                    <th className="text-left p-2.5 font-medium">Month</th>
                    {primaryMetrics.concat(secondaryMetrics).map(([key, label]) => (
                      <th key={key} className="text-right p-2.5 font-medium whitespace-nowrap">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y font-mono">
                  {data.charts.kpi_history.map(x => (
                    <tr key={x.month} className="hover:bg-muted/30">
                      <td className="p-2.5 font-semibold text-left">{x.month}</td>
                      {primaryMetrics.concat(secondaryMetrics).map(([key]) => (
                        <td key={key} className="p-2.5 text-right whitespace-nowrap">
                          {x[key] ?? 'Unknown'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>

          {/* Insights Action Chips */}
          {data.charts.insights.length > 0 && (
            <div className="overview-insights flex flex-wrap gap-2 pt-2">
              {data.charts.insights.map(i => (
                <button
                  key={i.key}
                  onClick={() =>
                    update({
                      ...(i.filter_patch.platforms?.length ? { platforms: i.filter_patch.platforms } : {}),
                      ...(i.filter_patch.restaurant_ids?.length ? { restaurant_ids: i.filter_patch.restaurant_ids } : {}),
                    })
                  }
                  className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-primary/10 transition-colors"
                >
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  <span>
                    {i.text}: <strong>{i.value}</strong>
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
