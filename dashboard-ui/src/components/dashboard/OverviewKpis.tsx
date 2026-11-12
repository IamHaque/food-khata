import * as React from "react";

import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { inr, pct } from "@/lib/format";
import { emitHighlight, emitClear } from "@/lib/highlight-bus";
import { Info, ArrowUp, ArrowDown, Minus } from "lucide-react";

export interface OverviewKpisProps {
  data?: any;
  kpis?: any;
  comparison?: any;
  kpiHistory?: any[];
  kpi_history?: any[];
  ordersPerWeek?: number | null;
  topCuisine?: string | null;
  className?: string;
  isLoading?: boolean;
  defaultOpenPopover?: string | boolean;
}

export interface KpiCardDefinition {
  label: string;
  dataKey: string;
  format: "money" | "number" | "text";
  decimals?: number;
  formula: string;
  caveats: string;
}

export const KPI_DEFINITIONS: KpiCardDefinition[] = [
  {
    label: "Total spend",
    dataKey: "spend",
    format: "money",
    decimals: 2,
    formula: "Total provider-paid amount across all matching orders.",
    caveats: "Excludes non-reconciling advertised savings.",
  },
  {
    label: "Total orders",
    dataKey: "orders",
    format: "number",
    decimals: 0,
    formula: "Count of successfully delivered orders.",
    caveats: "Excludes cancelled and refunded orders.",
  },
  {
    label: "Average order value",
    dataKey: "aov",
    format: "money",
    decimals: 2,
    formula: "Total spend divided by valid delivered orders.",
    caveats: "Fluctuates with group orders and discounts.",
  },
  {
    label: "Orders per week",
    dataKey: "orders_per_week",
    format: "number",
    decimals: 1,
    formula: "Average orders per week within the selected period.",
    caveats: "Partial start/end weeks are normalized.",
  },
  {
    label: "Top cuisine",
    dataKey: "top_cuisine",
    format: "text",
    formula: "Most frequently ordered cuisine by order count.",
    caveats: "Multi-cuisine restaurants mapped to primary category.",
  },
  {
    label: "Delivery and fees",
    dataKey: "fees",
    format: "money",
    decimals: 2,
    formula: "Total delivery, packaging, and platform fees.",
    caveats: "Includes itemized taxes where reported.",
  },
];

export function normalizeOverviewKpisData(props: OverviewKpisProps = {}) {
  const dashboard = props.data;
  const k = props.kpis ?? dashboard?.kpis ?? {};
  const comparison = props.comparison ?? dashboard?.comparison ?? null;
  const history =
    props.kpiHistory ??
    props.kpi_history ??
    dashboard?.charts?.kpi_history ??
    dashboard?.charts?.monthly ??
    dashboard?.kpi_history ??
    [];
  const ordersPerWeek =
    props.ordersPerWeek ??
    dashboard?.charts?.behavior?.orders_per_week ??
    dashboard?.behavior?.orders_per_week ??
    dashboard?.kpis?.orders_per_week ??
    null;
  const topCuisine =
    props.topCuisine ??
    dashboard?.charts?.food?.cuisines?.[0]?.name ??
    dashboard?.food?.cuisines?.[0]?.name ??
    dashboard?.top_cuisine ??
    null;
  return { k, comparison, history, ordersPerWeek, topCuisine };
}

export function handleSparklineHover(
  month: string,
  value: number,
  onHover?: (month: string, value: number) => void
) {
  emitHighlight({ type: "month", value: month, sourceId: "kpi-sparkline" });
  onHover?.(month, value);
}

export function handleSparklineLeave() {
  emitClear("kpi-sparkline");
}

export interface SparklineProps {
  values: (number | null)[];
  months?: string[];
  label: string;
  onHover?: (month: string, value: number) => void;
  className?: string;
}

export function Sparkline({
  values,
  months = [],
  label,
  onHover,
  className,
}: SparklineProps) {
  const [hover, setHover] = React.useState<{ month: string; value: number } | null>(null);
  const finite = (values ?? []).filter((x): x is number => x !== null && Number.isFinite(x));

  if (!finite.length) {
    return <div className={cn("h-7 w-28 bg-muted/20 rounded animate-pulse", className)} aria-label={label} />;
  }

  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const len = values.length;
  const pts = values.map((v, i) => {
    if (v === null || !Number.isFinite(v)) return null;
    const x = len < 2 ? 60 : i * (120 / (len - 1)) + 4;
    const y = max === min ? 14 : 26 - ((v - min) * 22) / (max - min);
    return { x, y, v, i };
  });

  let pathData = "";
  let inSeg = false;
  for (const p of pts) {
    if (p) {
      if (!inSeg) {
        pathData += ` M ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
        inSeg = true;
      } else {
        pathData += ` L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
      }
    } else {
      inSeg = false;
    }
  }

  const handlePointEnter = (m: string, val: number) => {
    setHover({ month: m, value: val });
    handleSparklineHover(m, val, onHover);
  };

  const handleLeave = () => {
    setHover(null);
    handleSparklineLeave();
  };

  return (
    <div
      className={cn("relative inline-block", className)}
      aria-label={label}
      onMouseLeave={handleLeave}
    >
      <svg
        role="img"
        aria-label={label}
        viewBox="0 0 128 28"
        className="w-28 h-7 overflow-visible"
      >
        {pathData && (
          <path
            d={pathData.trim()}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            className="text-primary/70"
          />
        )}
        {pts.map((p, i) => {
          if (!p) return null;
          const m = months[i] ?? String(i + 1);
          const isHovered = hover?.month === m;
          return (
            <g key={i}>
              {/* Hit target */}
              <circle
                cx={p.x}
                cy={p.y}
                r="7"
                fill="transparent"
                className="cursor-pointer"
                aria-label={`${m}: ${p.v}`}
                data-testid={`sparkline-hit-${i}`}
                onMouseEnter={() => handlePointEnter(m, p.v)}
              />
              {/* Visible SVG circle */}
              <circle
                cx={p.x}
                cy={p.y}
                r={isHovered ? "3.5" : "2"}
                className={cn(
                  "fill-primary transition-all duration-150 pointer-events-none",
                  isHovered && "stroke-background stroke-2 fill-primary"
                )}
                data-testid={`sparkline-point-${i}`}
              />
            </g>
          );
        })}
      </svg>
      {hover && (
        <div
          role="tooltip"
          data-testid="sparkline-tooltip"
          className="absolute z-10 -top-6 left-0 text-xs bg-popover text-popover-foreground border rounded px-1.5 py-0.5 shadow-sm whitespace-nowrap pointer-events-none"
        >
          {`${hover.month}: ${hover.value}`}
        </div>
      )}
    </div>
  );
}

export function KpiValue({
  value,
  format,
  decimals,
}: {
  value: number | null | undefined;
  format: "money" | "number";
  decimals?: number;
}) {
  // No count-up: a ledger figure should simply be there.
  if (value == null || !Number.isFinite(value)) return <span>–</span>;
  const text = format === "money"
    ? inr(value, decimals ?? 2)
    : value.toLocaleString("en-IN", { maximumFractionDigits: decimals ?? (Number.isInteger(value) ? 0 : 1) });
  return <span className="tabular-nums">{text}</span>;
}

export function Delta({ value }: { value: number | null | undefined }) {
  if (value == null || !Number.isFinite(value)) return null;
  const Icon = value > 0 ? ArrowUp : value < 0 ? ArrowDown : Minus;
  return (
    <span className="inline-flex items-center gap-0.5 text-xs font-medium text-muted-foreground tabular-nums">
      <Icon className="h-3 w-3" aria-hidden="true" />
      {`${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value)}%`}
    </span>
  );
}

export function OverviewKpis(props: OverviewKpisProps = {}) {
  const { k, comparison, history, ordersPerWeek, topCuisine } = normalizeOverviewKpisData(props);

  if (props.isLoading) {
    return (
      <div className={cn("overview-kpis", props.className)} aria-busy="true">
        <Card className="grid gap-6 p-[var(--space-card)] md:grid-cols-[minmax(0,1fr)_minmax(18rem,26rem)] animate-pulse">
          <div className="space-y-3"><div className="h-4 w-24 rounded bg-muted" /><div className="h-12 w-56 rounded bg-muted" /></div>
          <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-6 rounded bg-muted" />)}</div>
        </Card>
      </div>
    );
  }

  const kpiHistoryMonths = (history ?? []).map((h: any) => String(h?.month ?? ""));
  const moneyVal = (v: any) => (v == null || !Number.isFinite(Number(v)) ? null : Number(v));
  const numVal = (v: any) => (v == null || !Number.isFinite(Number(v)) ? null : Number(v));

  const cards: {
    label: string;
    value: any;
    format: "money" | "number" | "text";
    decimals?: number;
    sparkValues: (number | null)[];
    sparkMonths: string[];
    delta?: number | null;
    omitDeltaAndSpark?: boolean;
    info: string;
  }[] = [
    {
      label: "Total spend",
      value: moneyVal(k.spend),
      format: "money",
      decimals: 2,
      sparkValues: (history ?? []).map((h: any) => (h?.spend == null ? null : Number(h.spend))),
      sparkMonths: kpiHistoryMonths,
      delta: comparison?.percent_change?.spend ?? null,
      info: `${KPI_DEFINITIONS[0].formula} Caveats: ${KPI_DEFINITIONS[0].caveats}`,
    },
    {
      label: "Total orders",
      value: numVal(k.orders),
      format: "number",
      decimals: 0,
      sparkValues: (history ?? []).map((h: any) => (h?.orders == null ? null : Number(h.orders))),
      sparkMonths: kpiHistoryMonths,
      delta: comparison?.percent_change?.orders ?? null,
      info: `${KPI_DEFINITIONS[1].formula} Caveats: ${KPI_DEFINITIONS[1].caveats}`,
    },
    {
      label: "Average order value",
      value: moneyVal(k.aov),
      format: "money",
      decimals: 2,
      sparkValues: (history ?? []).map((h: any) => (h?.aov == null ? null : Number(h.aov))),
      sparkMonths: kpiHistoryMonths,
      delta: comparison?.percent_change?.aov ?? null,
      info: `${KPI_DEFINITIONS[2].formula} Caveats: ${KPI_DEFINITIONS[2].caveats}`,
    },
    {
      label: "Orders per week",
      value: numVal(ordersPerWeek),
      format: "number",
      decimals: 1,
      sparkValues: (history ?? []).map((h: any) => (h?.orders == null ? null : Number(h.orders))),
      sparkMonths: kpiHistoryMonths,
      delta: comparison?.percent_change?.orders_per_week ?? comparison?.percent_change?.orders ?? null,
      info: `${KPI_DEFINITIONS[3].formula} Caveats: ${KPI_DEFINITIONS[3].caveats}`,
    },
    {
      label: "Top cuisine",
      value: topCuisine,
      format: "text",
      sparkValues: [],
      sparkMonths: [],
      delta: undefined,
      omitDeltaAndSpark: true,
      info: `${KPI_DEFINITIONS[4].formula} Caveats: ${KPI_DEFINITIONS[4].caveats}`,
    },
    {
      label: "Delivery and fees",
      value: moneyVal(k.fees),
      format: "money",
      decimals: 2,
      sparkValues: (history ?? []).map((h: any) => (h?.fees == null ? null : Number(h.fees))),
      sparkMonths: kpiHistoryMonths,
      delta: comparison?.percent_change?.fees ?? null,
      info: `${KPI_DEFINITIONS[5].formula} Caveats: ${KPI_DEFINITIONS[5].caveats}`,
    },
  ];

  const [total, ...rest] = cards;
  const feesShare = Number(k.spend) > 0 && k.fees != null ? (Number(k.fees) / Number(k.spend)) * 100 : null;
  const hasCompare = comparison != null;
  const info = (card: (typeof cards)[number]) => (
    <Popover defaultOpen={props.defaultOpenPopover === true || props.defaultOpenPopover === card.label}>
      <PopoverTrigger asChild>
        <button type="button" aria-label={`Calculation and caveats for ${card.label}`} className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center text-muted-foreground hover:text-foreground lg:min-h-[28px] lg:min-w-[28px]">
          <Info className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 text-sm">
        <p className="font-semibold text-foreground mb-1">{card.label}</p>
        <p className="text-muted-foreground leading-relaxed">{card.info}</p>
      </PopoverContent>
    </Popover>
  );
  const valueOf = (card: (typeof cards)[number]) =>
    card.format === "text" ? (
      card.value == null || card.value === "" ? <span>–</span> : <span title={String(card.value)}>{card.value}</span>
    ) : (
      <KpiValue value={card.value} format={card.format} decimals={card.decimals} />
    );

  return (
    <div className={cn("overview-kpis", props.className)}>
      <Card className="grid gap-x-8 gap-y-4 p-[var(--space-card)] md:grid-cols-[minmax(0,1fr)_minmax(18rem,26rem)]">
        {/* The one memorable element: the big Total spend figure, then a ledger of what it is made of. */}
        <div className="flex flex-col justify-between gap-3">
          <div className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
            {total.label}
            {info(total)}
          </div>
          <div>
            <div className="font-semibold tabular-nums text-foreground text-display" data-testid="total-spend">
              <KpiValue value={total.value} format="money" decimals={0} />
            </div>
            {hasCompare && <div className="mt-1"><Delta value={total.delta} /></div>}
          </div>
          {total.sparkValues.length > 0 && (
            <Sparkline values={total.sparkValues} months={total.sparkMonths} label={`${total.label} sparkline`} className="text-primary" />
          )}
        </div>
        <dl className="divide-y self-end border-y text-sm">
          {rest.map((card) => (
            <div key={card.label} className="flex items-center justify-between gap-3 py-0.5">
              <dt className="flex items-center text-muted-foreground">
                {card.label}
                {info(card)}
              </dt>
              <dd className="flex items-baseline gap-2 text-right font-medium text-foreground tabular-nums">
                {hasCompare && !card.omitDeltaAndSpark && <Delta value={card.delta} />}
                {valueOf(card)}
              </dd>
            </div>
          ))}
          {feesShare != null && (
            <div className="flex items-center justify-between gap-3 py-2.5">
              <dt className="text-muted-foreground">Fees as a share of spend</dt>
              <dd className="text-right font-medium text-foreground tabular-nums">{pct(Number(feesShare.toFixed(2)), 2)}</dd>
            </div>
          )}
        </dl>
      </Card>
    </div>
  );
}

export default OverviewKpis;
