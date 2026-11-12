import * as React from "react";

import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  reason?: string;
  className?: string;
  /** Short one-block message for cards: no extra height. */
  compact?: boolean;
}

function EmptyState({ icon, title, description, reason, className, compact }: EmptyStateProps) {
  const text = description ?? reason;
  return (
    <div
      className={cn(
        compact ? "flex flex-col items-start gap-0.5 py-2 text-left" : "flex flex-col items-center justify-center gap-2 p-6 text-center",
        className,
      )}
    >
      {icon}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {text && <p className="text-sm text-muted-foreground">{text}</p>}
    </div>
  );
}

EmptyState.displayName = "EmptyState";

export { EmptyState };