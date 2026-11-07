import { useMemo } from 'react';
import { useDashboard } from '../hooks/api';
import { useFilters } from './FilterContext';
import { Chart } from './Chart';
import { ScopeNotice } from './SyncStatusPanel';
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

function formatMetricValue(value: number | null | undefined, format: string): string {
  if (value === null || value === undefined) return 'Unknown';
  if (format === 'money') return money.format(value);
  if (format === 'percent') return `${num.format(value)}%`;
  return num.format(value);
}

function Sparkline({ values, label }: { values: (number | null)[]; label: string }) {
  const finite = values.filter((x): x is number => x !== null && Number.isFinite(x));
  if (!finite.length) return <div className="h-7 w-28 bg-muted/20 rounded animate-pulse" />;
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const points = values.map((v, i) => {
    if (v === null || !Number.isFinite(v)) return null;
    const x = values.length < 2 ? 60 : i * (120 / (values.length - 1)) + 4;
    const y = max === min ? 14 : 26 - ((v - min) * 22) / (max - min);
    return { x, y };
  });

  let pathData = '';
  let inSegment = false;
  for (const p of points) {
    if (p !== null) {
      if (!inSegment) {
        pathData += ` M ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
        inSegment = true;
      } else {
        pathData += ` L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
      }
    } else {
      inSegment = false;
    }
  }

  const validPoints = points.filter((p): p is { x: number; y: number } => p !== null);

  return (
    <svg role="img" aria-label={label} viewBox="0 0 128 28" className="w-28 h-7 overflow-visible">
      {pathData && (
        <path d={pathData.trim()} fill="none" stroke="currentColor" strokeWidth="1.75" className="text-primary/70" />
      )}
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

  const monthly = useMemo(() => {
    const months = data?.charts.monthly.map(x => x.month ?? 'Unknown') ?? [];
    return {
      tooltip: {
        trigger: 'axis' as const,
        formatter: (params: unknown) => {
          if (!Array.isArray(params)) return '';
          const month = (params[0] as { axisValueLabel?: string })?.axisValueLabel ?? '';
          let res = `<div class="font-bold text-xs mb-1">${month}</div>`;
          for (const item of params as { seriesName: string; value: number }[]) {
            const formatted =
              item.seriesName.includes('Spend')
                ? money.format(item.value)
                : `${num.format(item.value)} orders`;
            res += `<div class="flex justify-between gap-3 text-xs"><span>${item.seriesName}:</span> <strong>${formatted}</strong></div>`;
          }
          return res;
        },
      },
      grid: [
        { left: 65, right: 25, top: 25, height: '36%' },
        { left: 65, right: 25, top: '56%', height: '36%' },
      ],
      xAxis: [
        {
          type: 'category' as const,
          gridIndex: 0,
          data: months,
          axisLabel: { show: false },
          axisTick: { show: false },
        },
        {
          type: 'category' as const,
          gridIndex: 1,
          data: months,
          axisLabel: { fontSize: 11, interval: 'auto' },
        },
      ],
      yAxis: [
        {
          type: 'value' as const,
          gridIndex: 0,
          name: 'Spend (₹)',
          nameTextStyle: { fontSize: 11 },
          axisLabel: { fontSize: 10 },
        },
        {
          type: 'value' as const,
          gridIndex: 1,
          name: 'Orders',
          nameTextStyle: { fontSize: 11 },
          axisLabel: { fontSize: 10 },
        },
      ],
      series: [
        {
          name: 'Spend (₹)',
          type: 'bar',
          xAxisIndex: 0,
          yAxisIndex: 0,
          itemStyle: { borderRadius: [3, 3, 0, 0] },
          data: data?.charts.monthly.map(x => x.spend),
        },
        {
          name: 'Orders',
          type: 'bar',
          xAxisIndex: 1,
          yAxisIndex: 1,
          itemStyle: { borderRadius: [3, 3, 0, 0] },
          data: data?.charts.monthly.map(x => x.orders),
        },
      ],
    };
  }, [data]);

  const billComponents = useMemo(() => {
    if (!data) return { labels: [], amounts: [], option: {} };
    const w = data.charts.cost_waterfall;
    const items = [
      { label: 'Subtotal', amount: w.subtotal },
      { label: 'Discounts', amount: -Math.abs(w.food_discount) },
      { label: 'Delivery fee', amount: w.net_delivery },
      { label: 'Packaging fee', amount: w.packaging },
      { label: 'Platform fee', amount: w.platform },
      { label: 'Taxes', amount: w.tax },
      { label: 'Tips', amount: w.tip },
      { label: 'Other charges', amount: w.other },
      ...(w.refunds ? [{ label: 'Refunds', amount: -Math.abs(w.refunds) }] : []),
    ];
    return {
      labels: items.map(x => x.label),
      amounts: items.map(x => x.amount),
      option: {
        tooltip: {
          trigger: 'axis' as const,
          formatter: (params: unknown) => {
            if (!Array.isArray(params) || !params[0]) return '';
            const p = params[0] as { name: string; value: number };
            return `<div class="text-xs"><strong>${p.name}:</strong> ${money.format(p.value)}</div>`;
          },
        },
        grid: { left: 110, right: 30, bottom: 40, top: 20 },
        xAxis: {
          type: 'value' as const,
          name: 'Amount (₹)',
          axisLabel: {
            formatter: (v: number) => `₹${v}`,
            fontSize: 10,
          },
        },
        yAxis: {
          type: 'category' as const,
          data: items.map(x => x.label),
          axisLabel: { fontSize: 11 },
        },
        series: [
          {
            name: 'Amount (₹)',
            type: 'bar',
            itemStyle: {
              borderRadius: [0, 4, 4, 0],
            },
            data: items.map(x => x.amount),
          },
        ],
      },
    };
  }, [data]);

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

  // Primary Metrics: Tier 1 Hero KPIs
  const primaryMetrics: [keyof typeof k, string, string, string][] = [
    ['spend', 'Spend', 'money', 'Total provider-paid amount across all matching orders'],
    ['orders', 'Orders', 'number', 'Count of successfully delivered orders'],
    ['aov', 'Average order value', 'money', 'Total spend divided by valid delivered orders'],
  ];

  // Secondary Metrics: Tier 2 Detailed KPIs
  const secondaryMetrics: [keyof typeof k, string, string, string][] = [
    ['total_discount', 'Explicit discounts', 'money', 'Explicit discounts deducted on receipts (excludes advertised savings)'],
    ['reported_savings', 'Advertised savings', 'money', 'Provider-advertised savings (e.g. strikethrough list prices, non-reconciling)'],
    ['discount_rate', 'Discount rate', 'percent', 'Explicit discounts divided by spend plus explicit discounts'],
    ['reported_savings_rate', 'Advertised savings rate', 'percent', 'Reported savings divided by spend plus reported savings'],
    ['fees', 'Fees', 'money', 'Total delivery, packaging, and platform fees'],
    ['fee_percentage', 'Fee burden', 'percent', 'Total fees divided by spend'],
    ['tax', 'Tax', 'money', 'Total tax categorized separately from fees'],
    ['tips', 'Tips', 'money', 'Total voluntary tips'],
    ['refunds', 'Refunds', 'money', 'Total recorded refunds'],
    ['unique_restaurants', 'Restaurants', 'number', 'Count of distinct restaurants ordered from'],
    ['unique_dishes', 'Dishes', 'number', 'Count of distinct dish items ordered'],
    ['average_rating', 'Average rating', 'number', 'Average user rating where provided'],
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

      <ScopeNotice />

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
          {/* Hero Row: Top 3 Primary KPI Cards */}
          <div className="overview-grid grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {primaryMetrics.map(([key, label, format, formula]) => {
              const value = k[key];
              const delta = data.comparison?.percent_change[key];
              const Icon = metricIcons[key] ?? TrendingUp;
              return (
                <div
                  className="page-panel overview-card rounded-xl border bg-card p-4 sm:p-5 shadow-xs flex flex-col justify-between gap-3.5 select-text"
                  key={key}
                >
                  <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-primary shrink-0" />
                      <span className="font-semibold text-sm text-foreground">{label}</span>
                    </div>
                    <details className="kpi-formula group relative">
                      <summary
                        className="cursor-pointer list-none flex items-center justify-center min-h-[44px] min-w-[44px] -m-2 text-muted-foreground hover:text-foreground focus:outline-none focus:ring-1 focus:ring-ring rounded-md"
                        aria-label={`Calculation and caveats for ${label}`}
                      >
                        <Info className="h-4 w-4" />
                      </summary>
                      <div className="absolute right-0 top-10 z-20 w-56 rounded-md border border-border bg-popover p-2.5 text-xs text-popover-foreground shadow-md">
                        <p className="font-semibold text-foreground mb-1">{label}</p>
                        <p className="text-muted-foreground leading-relaxed">{formula}</p>
                      </div>
                    </details>
                  </div>

                  <strong className="text-3xl font-bold font-mono tabular-nums tracking-tight text-foreground block">
                    {formatMetricValue(value, format)}
                  </strong>

                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/40">
                    <Sparkline
                      label={`${label} monthly trend`}
                      values={data.charts.kpi_history.map(x => x[key])}
                    />
                    {data.comparison && (
                      <span className="text-xs font-mono font-medium text-muted-foreground flex items-center gap-1">
                        <span>{delta == null ? 'Unknown' : `${delta > 0 ? '+' : ''}${num.format(delta)}%`}</span>
                        <span className="text-xs text-muted-foreground/75">
                          ({filters.compare === 'previous_year' ? 'vs prior yr' : 'vs prior per'})
                        </span>
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Secondary KPI Section */}
          <div className="space-y-3">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Secondary Metrics & Performance Breakdown
            </h2>
            <div className="overview-grid grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
              {secondaryMetrics.map(([key, label, format, formula]) => {
                const value = k[key];
                const delta = data.comparison?.percent_change[key];
                return (
                  <div
                    className="page-panel overview-card rounded-lg border bg-card/60 p-3 shadow-2xs flex flex-col justify-between gap-1 select-text"
                    key={key}
                  >
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="truncate font-medium">{label}</span>
                      <details className="kpi-formula group relative">
                        <summary
                          className="cursor-pointer list-none flex items-center justify-center min-h-[44px] min-w-[44px] -m-3 text-muted-foreground hover:text-foreground focus:outline-none focus:ring-1 focus:ring-ring rounded-md"
                          aria-label={`Calculation and caveats for ${label}`}
                        >
                          <Info className="h-3 w-3" />
                        </summary>
                        <div className="absolute right-0 top-10 z-20 w-48 rounded-md border border-border bg-popover p-2 text-xs text-popover-foreground shadow-md">
                          <p className="font-semibold text-foreground mb-1">{label}</p>
                          <p className="text-muted-foreground leading-relaxed">{formula}</p>
                        </div>
                      </details>
                    </div>

                    <strong className="text-base font-bold font-mono tabular-nums tracking-tight text-foreground block">
                      {formatMetricValue(value, format)}
                    </strong>

                    {data.comparison && (
                      <span className="text-xs text-muted-foreground font-mono">
                        {delta == null ? 'Unknown' : `${delta > 0 ? '+' : ''}${num.format(delta)}%`}
                      </span>
                    )}
                  </div>
                );
              })}

              {/* Habit Stats: Orders per week & Longest streak */}
              <div className="page-panel overview-card rounded-lg border bg-card/60 p-3 shadow-2xs flex flex-col justify-between gap-1 select-text">
                <span className="text-xs text-muted-foreground flex items-center gap-1 font-medium">
                  <CalendarDays className="h-3 w-3 text-muted-foreground shrink-0" />
                  Orders / week
                </span>
                <strong className="text-base font-bold font-mono tabular-nums tracking-tight text-foreground block">
                  {data.charts.behavior.orders_per_week == null
                    ? 'Unknown'
                    : num.format(data.charts.behavior.orders_per_week)}
                </strong>
              </div>

              <div className="page-panel overview-card rounded-lg border bg-card/60 p-3 shadow-2xs flex flex-col justify-between gap-1 select-text">
                <span className="text-xs text-muted-foreground flex items-center gap-1 font-medium">
                  <Flame className="h-3 w-3 text-orange-500 shrink-0" />
                  Longest streak
                </span>
                <strong className="text-base font-bold font-mono tabular-nums tracking-tight text-foreground block">
                  {data.charts.behavior.longest_streak == null
                    ? 'Unknown'
                    : `${num.format(data.charts.behavior.longest_streak)} days`}
                </strong>
              </div>
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

          {/* Bill Composition Card */}
          <div className="page-panel rounded-xl border bg-card p-5 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
              <div>
                <h2 className="text-base font-semibold text-foreground">Bill composition</h2>
                <p className="text-xs text-muted-foreground">
                  Signed itemized components and separately recorded provider-paid balance
                </p>
              </div>
            </div>

            {/* Prominently separate Provider Paid callout (explicitly non-reconciling) */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-lg border bg-muted/20">
              <div>
                <span className="text-xs text-muted-foreground block font-medium">Recorded Provider-Paid Total</span>
                <span className="text-2xl font-bold font-mono tabular-nums tracking-tight text-foreground">
                  {money.format(data.charts.cost_waterfall.provider_paid)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground max-w-md">
                Provider-paid total is recorded separately from itemized component receipts. Due to varying platform rounding and promotion semantics, components may not reconcile mathematically.
              </p>
            </div>

            <Chart
              summary="Bill components breakdown"
              headers={['Component', 'Amount']}
              rows={billComponents.labels.map((l, i) => [l, money.format(billComponents.amounts[i])])}
              option={billComponents.option}
            />
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
