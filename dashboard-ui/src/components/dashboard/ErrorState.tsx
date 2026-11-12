import * as React from "react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface ErrorStateProps {
  icon?: React.ReactNode;
  message: string;
  onRetry?: () => void;
  className?: string;
}

function ErrorState({ icon, message, onRetry, className }: ErrorStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 p-6 text-center",
        className,
      )}
    >
      {icon}
      <p className="text-sm font-medium text-foreground">{message}</p>
      <p className="text-sm text-muted-foreground">Check your connection, then try again.</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

ErrorState.displayName = "ErrorState";

export { ErrorState };