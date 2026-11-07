import * as React from "react";

import { cn } from "@/lib/utils";

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {}

function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted motion-skeleton", className)}
      {...props}
    />
  );
}

Skeleton.displayName = "Skeleton";

export { Skeleton };