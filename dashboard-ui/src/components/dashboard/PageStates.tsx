import { AlertCircle, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** Page-shaped skeleton: no spinner, no layout jump when content arrives. */
export function PageLoading({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" aria-label={label} aria-busy="true" className="space-y-4">
      <Skeleton className="h-40 w-full" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  );
}

export function PageError({ what, onRetry }: { what: string; onRetry?: () => void }) {
  return (
    <Card role="alert" className="flex flex-col items-start gap-3 p-[var(--space-card)]">
      <p className="notice-danger flex items-center gap-2 border-0 bg-transparent p-0 text-sm font-medium">
        <AlertCircle className="h-4 w-4 text-destructive" aria-hidden="true" />
        {what} could not load.
      </p>
      <p className="text-sm text-muted-foreground">Check that the server is running, then try again.</p>
      {onRetry && <Button variant="outline" onClick={onRetry}>Retry</Button>}
    </Card>
  );
}

export function PageEmpty({ onClear }: { onClear?: () => void }) {
  return (
    <Card className="flex flex-col items-center gap-2 p-8 text-center">
      <SearchX className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
      <p className="text-base font-semibold text-foreground">No orders match these filters</p>
      <p className="text-sm text-muted-foreground">Widen the date range or clear a filter to see your orders.</p>
      {onClear && <Button variant="outline" onClick={onClear}>Clear filters</Button>}
    </Card>
  );
}
