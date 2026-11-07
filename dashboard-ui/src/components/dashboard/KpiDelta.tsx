import * as React from "react";
import { ArrowUp, ArrowDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

const num = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

export interface KpiDeltaProps {
  value?: number | null;
  className?: string;
  showZeroArrow?: boolean;
}

export function KpiDelta({ value, className, showZeroArrow = true }: KpiDeltaProps) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return (
      <span className={cn("text-xs font-mono text-muted-foreground", className)}>
        Unknown
      </span>
    );
  }

  if (value > 0) {
    return (
      <span
        data-testid="kpi-delta-positive"
        className={cn(
          "inline-flex items-center gap-0.5 text-xs font-mono font-medium text-emerald-600 dark:text-emerald-400",
          className
        )}
      >
        <ArrowUp className="h-3 w-3 shrink-0" aria-hidden="true" />
        <span>{`+${num.format(value)}%`}</span>
      </span>
    );
  }

  if (value < 0) {
    return (
      <span
        data-testid="kpi-delta-negative"
        className={cn(
          "inline-flex items-center gap-0.5 text-xs font-mono font-medium text-rose-600 dark:text-rose-400",
          className
        )}
      >
        <ArrowDown className="h-3 w-3 shrink-0" aria-hidden="true" />
        <span>{`${num.format(value)}%`}</span>
      </span>
    );
  }

  return (
    <span
      data-testid="kpi-delta-neutral"
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-mono font-medium text-muted-foreground",
        className
      )}
    >
      {showZeroArrow && <Minus className="h-3 w-3 shrink-0" aria-hidden="true" />}
      <span>{`${num.format(0)}%`}</span>
    </span>
  );
}

export default KpiDelta;
