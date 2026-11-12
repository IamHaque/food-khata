import { cn } from "@/lib/utils";
import { inr, signedInr } from "@/lib/format";

/** Right-aligned tabular rupee figure. `signed` forces +/− (discounts, refunds). */
export function Money({ value, dp = 0, signed = false, className }: { value: number | null | undefined; dp?: number; signed?: boolean; className?: string }) {
  const text = value == null ? "–" : signed ? signedInr(value, dp) : inr(value, dp);
  return <span className={cn("tabular-nums", className)}>{text}</span>;
}
