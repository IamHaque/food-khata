import * as React from "react";

import { cn } from "@/lib/utils";
import { X } from "lucide-react";

export interface ChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  label: string;
  icon?: React.ReactNode;
  active?: boolean;
  onRemove?: () => void;
}

function Chip({ className, label, icon, active, onRemove, ...props }: ChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-muted text-foreground",
        className,
      )}
      {...props}
    >
      {icon}
      <span>{label}</span>
      {onRemove && (
        <button
          type="button"
          aria-label={`Remove ${label}`}
          onClick={onRemove}
          className="ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-background/40"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}

Chip.displayName = "Chip";

export { Chip };