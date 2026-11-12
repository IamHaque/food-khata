import * as React from "react";
import { cn } from "@/lib/utils";
import { platformLabel } from "@/lib/format";

export type Tone = "success" | "warning" | "danger" | "info" | "neutral";

// Neutral tinted surface + coloured dot: semantic colours never depend on the accent.
const DOT: Record<Tone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
  info: "bg-info",
  neutral: "bg-muted-foreground",
};

export function StatusPill({ tone = "neutral", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border bg-muted px-2 py-0.5 text-xs font-medium text-foreground", className)}>
      <span aria-hidden="true" className={cn("h-1.5 w-1.5 rounded-full", DOT[tone])} />
      {children}
    </span>
  );
}

/** Platform name with its fixed colour dot (same colours as the charts). */
export function PlatformPill({ platform, className }: { platform: string; className?: string }) {
  const key = platform.toLowerCase();
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm", className)}>
      <span
        aria-hidden="true"
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: key === "zomato" ? "var(--platform-zomato)" : key === "swiggy" ? "var(--platform-swiggy)" : "hsl(var(--muted-foreground))" }}
      />
      {platformLabel(platform)}
    </span>
  );
}
