import * as React from "react";

import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { KpiDelta } from "./KpiDelta";

export interface KpiCardProps {
  title?: string;
  label?: string;
  value?: React.ReactNode;
  subtitle?: React.ReactNode;
  delta?: React.ReactNode | number;
  icon?: React.ReactNode;
  isLoading?: boolean;
  className?: string;
}

function KpiCard({ title, label, value, subtitle, delta, icon, isLoading, className }: KpiCardProps) {
  const heading = title ?? label;
  const sub = typeof delta === "number" ? <KpiDelta value={delta} /> : (subtitle ?? delta);


  if (isLoading) {
    return (
      <Card className={cn("p-0", className)}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <Skeleton className="h-4 w-24" />
          {icon && <Skeleton className="h-4 w-4" />}
        </CardHeader>
        <CardContent>
          <Skeleton className="h-8 w-32 mb-2" />
          <Skeleton className="h-3 w-20" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("p-0", className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        {heading && <CardTitle className="text-sm font-medium text-muted-foreground">{heading}</CardTitle>}
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tabular-nums text-foreground">{value}</div>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

KpiCard.displayName = "KpiCard";

export { KpiCard };