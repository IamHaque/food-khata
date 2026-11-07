import * as React from "react";

import { cn } from "@/lib/utils";

export interface SegmentedControlOption {
  value: string;
  label: string;
}

export interface SegmentedControlProps {
  options: SegmentedControlOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

function SegmentedControl({ options, value, onChange, className }: SegmentedControlProps) {
  return (
    <div
      role="radiogroup"
      className={cn(
        "inline-flex items-center rounded-md border bg-muted p-1 gap-1",
        className,
      )}
    >
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(opt.value)}
            className={cn(
              "rounded-sm px-3 py-1 text-xs font-medium transition-colors",
              selected
                ? "bg-background text-foreground shadow"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

SegmentedControl.displayName = "SegmentedControl";

export { SegmentedControl };