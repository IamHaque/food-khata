import * as React from "react";

import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useCountUp } from "@/hooks/useCountUp";
import { emitHighlight } from "@/lib/highlight-bus";
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
}

function useOptionalDashboard() {
  // Avoid hard dependency on context in tests; return null when unavailable.
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require("../app/FilterContext");
    // best-effort; not used if absent
    return null;
  } catch {
    return null;
  }
}

function normalize(props: OverviewKpisProps) {
  const dashboard = props.data;
  const k = props.kpis ?? dashboard?.kpis ?? {};
  const comparison = props.comparison ?? dashboard?.comparison ?? null;
  const history =
    props.kpiHistory ??
    props.kpi_history ??
    dashboard?.charts?.kpi_history ??
    dashboard?.kpi_history ??
    [];
  const ordersPerWeek =
    props.ordersPerWeek ??
    dashboard?.charts?.behavior?.orders_per_week ??
    dashboard?.behavior?.orders_per_week ??
    null;
  const topCuisine =
    props.topCuisine ??
    dashboard?.charts?.food?.cuisines?.[0]?.name ??
    dashboard?.top_cuisine ??
    null;
  return { k, comparison, history, ordersPerWeek, topCuisine };
}

function formatMoney(v: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
}

function Sparkline({
  values,
  label,
  onHover,
}: {
  values: (number | null)[];
  label: string;
  onHover?: (month: string, value: number) => void;
}) {
  const [hover, setHover] = React.useState<{ month: string; value: number; x: number; y: number } | null>(null);
  const finite = (values ?? []).filter((x): x is number => x !== null && Number.isFinite(x));
  if (!finite.length) {
    return <div className="h-7 w-28 bg-muted/20 rounded animate-pulse" aria-label={label} />;
  }
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const pts = (values ?? []).map((v, i) => {
    if (v === null || !Number.isFinite(v)) return null;
    const x = (values.length < 2 ? 60 : (i * (120 / (values.length - 1)) + 4));
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
  const months = (values ?? []).map((_, i) => {
    // month labels come from history; sparkline only gets values, month unknown here
    return i;
  });

  return (
    <div className="relative inline-block" aria-label={label}>
      <svg
        role="img"
        aria-label={label}
        viewBox="0 0 128 28"
        className="w-28 h-7 overflow-visible"
        onMouseLeave={() => setHover(null)}
      >
        {pathData && (
          <path d={pathData.trim()} fill="none" stroke="currentColor" strokeWidth="1.75" className="text-primary/70" />
        )}
        {pts.map((p, i) => {
          if (!p) return null;
          const monthLabel = String(i);
          return (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r="2"
              className="fill-primary cursor-pointer"
              onMouseEnter={() => {
                const m = monthLabel;
                setHover({ month: m, value: p.v, x: p.x, y: p.y });
                // emit with a generic month string; overridden by caller when possible
              }}
              onClick={() => {}}
            />
          );
        })}
      </svg>
      {hover && (
        <div className="absolute z-10 -top-6 left-0 text-[10px] bg-popover border rounded px-1.5 py-0.5 shadow-sm whitespace-nowrap">
          {hover.month}: {hover.value}
        </div>
      )}
    </div>
  );
}

// We need month-aware sparkline. Better component below wraps with months.
function SparklineMonth({
  values,
  months,
  label,
}: {
  values: (number | null)[];
  months: string[];
  label: string;
}) {
  const [hover, setHover] = React.useState<{ month: string; value: number } | null>(null);
  const finite = (values ?? []).filter((x): x is number => x !== null && Number.isFinite(x));
  if (!finite.length) {
    return <div className="h-7 w-28 bg-muted/20 rounded animate-pulse" aria-label={label} />;
  }
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const pts = (values ?? []).map((v, i) => {
    if (v === null || !Number.isFinite(v)) return null;
    const x = values.length < 2 ? 60 : (i * (120 / (values.length - 1)) + 4);
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
  return (
    <div className="relative inline-block" aria-label={label}>
      <svg
        role="img"
        aria-label={label}
        viewBox="0 0 128 28"
        className="w-28 h-7 overflow-visible"
        onMouseLeave={() => setHover(null)}
      >
        {pathData && (
          <path d={pathData.trim()} fill="none" stroke="currentColor" strokeWidth="1.75" className="text-primary/70" />
        )}
        {pts.map((p, i) => {
          if (!p) return null;
          const m = months[i] ?? String(i);
          return (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r="2"
              className="fill-primary cursor-pointer"
              onMouseEnter={() => {
                setHover({ month: m, value: p.v });
                emitHighlight("kpis", "month", m);
              }}
            />
          );
        })}
      </svg>
      {hover && (
        <div className="absolute z-10 -top-6 left-0 text-[10px] bg-popover border rounded px-1.5 py-0.5 shadow-sm whitespace-nowrap">
          {hover.month}: {hover.value}
        </div>
      )}
    </div>
  );
}

function KpiValue({ value, format }: { value: number | null | undefined; format: "money" | "number" }) {
  const target = value == null || !Number.isFinite(value) ? 0 : value;
  const animated = useCountUp(target, format === "money" ? { currency: "INR", decimals: 2 } : { decimals: Number.isInteger(target) ? 0 : 2 });
  if (value == null || !Number.isFinite(value)) return <span>Unknown</span>;
  return <span className="tabular-nums">{animated}</span>;
}

function Delta({ value }: { value: number | null | undefined }) {
  if (value == null || !Number.isFinite(value)) {
    return <span className="text-xs text-muted-foreground">Unknown</span>;
  }
  const up = value > 0;
  const down = value < 0;
  const Icon = up ? ArrowUp : down ? ArrowDown : Minus;
  const color = up ? "text-emerald-600" : down ? "text-rose-600" : "text-muted-foreground";
  return (
    <span className={cn("text-xs font-medium flex items-center gap-0.5", color)}>
      <Icon className="h-3 w-3" />
      {value > 0 ? "+" : ""}
      {value}%
    </span>
  );
}

export function OverviewKpis(props: OverviewKpisProps = {}) {
  const { k, comparison, history, ordersPerWeek, topCuisine } = normalize(props);

  const kpiHistoryMonths = (history ?? []).map((h: any) => String(h?.month ?? ""));

  const moneyVal = (v: any) => (v == null ? null : Number(v));

  const cards: {
    label: string;
    value: any;
    format: "money" | "number" | "text";
    sparkValues: (number | null)[];
    sparkMonths: string[];
    delta: any;
    deltaKey: string;
    info: string;
  }[] = [
    {
      label: "Total Spend",
      value: moneyVal(k.spend),
      format: "money",
      sparkValues: (history ?? []).map((h: any) => (h?.spend == null ? null : Number(h.spend))),
      sparkMonths: kpiHistoryMonths,
      delta: comparison?.percent_change?.spend,
      deltaKey: "spend",
      info: "Total provider-paid amount across all matching orders. Caveats: excludes non-reconciling advertised savings.",
    },
    {
      label: "Total Orders",
      value: k.orders == null ? null : Number(k.orders),
      format: "number",
      sparkValues: (history ?? []).map((h: any) => (h?.orders == null ? null : Number(h.orders))),
      sparkMonths: kpiHistoryMonths,
      delta: comparison?.percent_change?.orders,
      deltaKey: "orders",
      info: "Count of successfully delivered orders.",
    },
    {
      label: "Average Order Value",
      value: moneyVal(k.aov),
      format: "money",
      sparkValues: (history ?? []).map((h: any) => (h?.aov == null ? null : Number(h.aov))),
      sparkMonths: kpiHistoryMonths,
      delta: comparison?.percent_change?.aov,
      deltaKey: "aov",
      info: "Total spend divided by valid delivered orders.",
    },
    {
      label: "Orders Per Week",
      value: ordersPerWeek == null ? null : Number(ordersPerWeek),
      format: "number",
      sparkValues: (history ?? []).map((h: any) => (h?.orders == null ? null : Number(h.orders))),
      sparkMonths: kpiHistoryMonths,
      delta: comparison?.percent_change?.orders,
      deltaKey: "orders",
      info: "Average orders per week within the selected period.",
    },
    {
      label: "Top Cuisine",
      value: topCuisine,
      format: "text",
      sparkValues: [],
      sparkMonths: [],
      delta: undefined,
      deltaKey: "spend",
      info: "Most frequently ordered cuisine by order count.",
    },
    {
      label: "Delivery & Fees",
      value: moneyVal(k.fees),
      format: "money",
      sparkValues: (history ?? []).map((h: any) => (h?.fees == null ? null : Number(h.fees))),
      sparkMonths: kpiHistoryMonths,
      delta: comparison?.percent_change?.fees,
      deltaKey: "fees",
      info: "Total delivery, packaging, and platform fees.",
    },
  ];

  return (
    <div className={cn("overview-kpis grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4", props.className)}>      {cards.map((card) => (
        <Card key={card.label} className="p-0">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{card.label}</CardTitle>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label={`Calculation and caveats for ${card.label}`}
                  className="text-muted-foreground hover:text-foreground"
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
                card.value == null ? "Unknown" : String(card.value)
              ) : (
                <KpiValue value={card.value} format={card.format} />
              )}
            </div>
            <div className="flex items-center justify-between gap-2 mt-2">
              {card.sparkValues.length > 0 ? (
                <SparklineMonth values={card.sparkValues} months={card.sparkMonths} label={`${card.label} sparkline`} />
              ) : (
                <div className="h-7 w-28" />
              )}
              <Delta value={card.delta} />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default OverviewKpis;
