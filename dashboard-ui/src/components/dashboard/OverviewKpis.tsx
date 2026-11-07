import * as React from "react";

import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useCountUp } from "@/hooks/useCountUp";
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
    label: "Total Spend",
    dataKey: "spend",
    format: "money",
    decimals: 2,
    formula: "Total provider-paid amount across all matching orders.",
    caveats: "Excludes non-reconciling advertised savings.",
  },
  {
    label: "Total Orders",
    dataKey: "orders",
    format: "number",
    decimals: 0,
    formula: "Count of successfully delivered orders.",
    caveats: "Excludes cancelled and refunded orders.",
  },
  {
    label: "Average Order Value",
    dataKey: "aov",
    format: "money",
    decimals: 2,
    formula: "Total spend divided by valid delivered orders.",
    caveats: "Fluctuates with group orders and discounts.",
  },
  {
    label: "Orders Per Week",
    dataKey: "orders_per_week",
    format: "number",
    decimals: 1,
    formula: "Average orders per week within the selected period.",
    caveats: "Partial start/end weeks are normalized.",
  },
  {
    label: "Top Cuisine",
    dataKey: "top_cuisine",
    format: "text",
    formula: "Most frequently ordered cuisine by order count.",
    caveats: "Multi-cuisine restaurants mapped to primary category.",
  },
  {
    label: "Delivery & Fees",
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
          className="absolute z-10 -top-6 left-0 text-[10px] bg-popover text-popover-foreground border rounded px-1.5 py-0.5 shadow-sm whitespace-nowrap pointer-events-none"
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
  if (value == null || !Number.isFinite(value)) {
    return <span>Unknown</span>;
  }
  const animated = useCountUp(
    value,
    format === "money"
      ? { currency: "INR", decimals: decimals ?? 2 }
      : { decimals: decimals ?? (Number.isInteger(value) ? 0 : 1) }
  );
  return <span className="tabular-nums">{animated}</span>;
}

export function Delta({ value }: { value: number | null | undefined }) {
  if (value == null || !Number.isFinite(value)) {
    return <span className="text-xs text-muted-foreground">Unknown</span>;
  }
  const up = value > 0;
  const down = value < 0;
  const Icon = up ? ArrowUp : down ? ArrowDown : Minus;
  const color = up ? "text-emerald-600" : down ? "text-rose-600" : "text-muted-foreground";
  const formatted = `${value > 0 ? "+" : ""}${value}%`;
  return (
    <span className={cn("text-xs font-medium flex items-center gap-0.5", color)}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      {formatted}
    </span>
  );
}

export function OverviewKpis(props: OverviewKpisProps = {}) {
  const { k, comparison, history, ordersPerWeek, topCuisine } = normalizeOverviewKpisData(props);

  if (props.isLoading) {
    return (
      <div
        className={cn(
          "overview-kpis grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3",
          props.className
        )}
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="p-0 animate-pulse">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="h-4 w-24 bg-muted/40 rounded" />
              <div className="h-4 w-4 bg-muted/40 rounded-full" />
            </CardHeader>
            <CardContent>
              <div className="h-8 w-28 bg-muted/40 rounded mb-2" />
              <div className="flex items-center justify-between gap-2 mt-2">
                <div className="h-7 w-20 bg-muted/30 rounded" />
                <div className="h-4 w-10 bg-muted/30 rounded" />
              </div>
            </CardContent>
          </Card>
        ))}
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
      label: "Total Spend",
      value: moneyVal(k.spend),
      format: "money",
      decimals: 2,
      sparkValues: (history ?? []).map((h: any) => (h?.spend == null ? null : Number(h.spend))),
      sparkMonths: kpiHistoryMonths,
      delta: comparison?.percent_change?.spend ?? null,
      info: `${KPI_DEFINITIONS[0].formula} Caveats: ${KPI_DEFINITIONS[0].caveats}`,
    },
    {
      label: "Total Orders",
      value: numVal(k.orders),
      format: "number",
      decimals: 0,
      sparkValues: (history ?? []).map((h: any) => (h?.orders == null ? null : Number(h.orders))),
      sparkMonths: kpiHistoryMonths,
      delta: comparison?.percent_change?.orders ?? null,
      info: `${KPI_DEFINITIONS[1].formula} Caveats: ${KPI_DEFINITIONS[1].caveats}`,
    },
    {
      label: "Average Order Value",
      value: moneyVal(k.aov),
      format: "money",
      decimals: 2,
      sparkValues: (history ?? []).map((h: any) => (h?.aov == null ? null : Number(h.aov))),
      sparkMonths: kpiHistoryMonths,
      delta: comparison?.percent_change?.aov ?? null,
      info: `${KPI_DEFINITIONS[2].formula} Caveats: ${KPI_DEFINITIONS[2].caveats}`,
    },
    {
      label: "Orders Per Week",
      value: numVal(ordersPerWeek),
      format: "number",
      decimals: 1,
      sparkValues: (history ?? []).map((h: any) => (h?.orders == null ? null : Number(h.orders))),
      sparkMonths: kpiHistoryMonths,
      delta: comparison?.percent_change?.orders_per_week ?? comparison?.percent_change?.orders ?? null,
      info: `${KPI_DEFINITIONS[3].formula} Caveats: ${KPI_DEFINITIONS[3].caveats}`,
    },
    {
      label: "Top Cuisine",
      value: topCuisine,
      format: "text",
      sparkValues: [],
      sparkMonths: [],
      delta: undefined,
      omitDeltaAndSpark: true,
      info: `${KPI_DEFINITIONS[4].formula} Caveats: ${KPI_DEFINITIONS[4].caveats}`,
    },
    {
      label: "Delivery & Fees",
      value: moneyVal(k.fees),
      format: "money",
      decimals: 2,
      sparkValues: (history ?? []).map((h: any) => (h?.fees == null ? null : Number(h.fees))),
      sparkMonths: kpiHistoryMonths,
      delta: comparison?.percent_change?.fees ?? null,
      info: `${KPI_DEFINITIONS[5].formula} Caveats: ${KPI_DEFINITIONS[5].caveats}`,
    },
  ];

  return (
    <div
      className={cn(
        "overview-kpis grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3",
        props.className
      )}
    >
      {cards.map((card) => {
        const isPopoverDefaultOpen =
          props.defaultOpenPopover === true ||
          props.defaultOpenPopover === card.label;

        return (
          <Card key={card.label} className="p-0">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{card.label}</CardTitle>
              <Popover defaultOpen={isPopoverDefaultOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label={`Calculation and caveats for ${card.label}`}
                    className="text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    <Info className="h-4 w-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-56 text-xs">
                  <p className="font-semibold text-foreground mb-1">{card.label}</p>
                  <p className="text-muted-foreground leading-relaxed">{card.info}</p>
                </PopoverContent>
              </Popover>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tabular-nums text-foreground">
                {card.format === "text" ? (
                  card.value == null || card.value === "" ? (
                    <span>Unknown</span>
                  ) : (
                    <span className="truncate block" title={String(card.value)}>
                      {card.value}
                    </span>
                  )
                ) : (
                  <KpiValue value={card.value} format={card.format} decimals={card.decimals} />
                )}
              </div>
              <div className="flex items-center justify-between gap-2 mt-2 h-7">
                {card.omitDeltaAndSpark ? (
                  <>
                    <div className="h-7 w-28" />
                    <span className="text-xs text-muted-foreground">N/A</span>
                  </>
                ) : (
                  <>
                    {card.sparkValues.length > 0 ? (
                      <Sparkline
                        values={card.sparkValues}
                        months={card.sparkMonths}
                        label={`${card.label} sparkline`}
                      />
                    ) : (
                      <div className="h-7 w-28" />
                    )}
                    <Delta value={card.delta} />
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export default OverviewKpis;
