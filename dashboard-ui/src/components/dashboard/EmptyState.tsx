import * as React from "react";

import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  reason?: string;
  className?: string;
}

function EmptyState({ icon, title, description, reason, className }: EmptyStateProps) {
  const text = description ?? reason;
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 p-6 text-center",
        className,
      )}
    >
      {icon}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {text && <p className="text-xs text-muted-foreground">{text}</p>}
    </div>
  );
}

EmptyState.displayName = "EmptyState";

export { EmptyState };