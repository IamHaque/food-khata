import * as React from "react";

export interface StatusBannerProps {
  variant?: "info" | "success" | "warning" | "error";
  children?: React.ReactNode;
  className?: string;
  role?: string;
}

export function StatusBanner({ variant = "info", children, className, role }: StatusBannerProps) {
  const colors: Record<string, string> = {
    info: "border-primary/20 bg-primary/10 text-primary",
    success: "border-green-500/20 bg-green-500/10 text-green-700 dark:text-green-300",
    warning: "border-amber-500/20 bg-amber-500/10 text-amber-900 dark:text-amber-200",
    error: "border-destructive/20 bg-destructive/10 text-destructive",
  };
  const computedRole = role ?? (variant === "error" ? "alert" : "status");
  return (
    <div role={computedRole} className={`rounded-lg border p-3 text-sm ${colors[variant]} ${className ?? ""}`}>
      {children}
    </div>
  );
}
export default StatusBanner;

