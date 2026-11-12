import * as React from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from "lucide-react";

export interface StatusBannerProps {
  variant?: "info" | "success" | "warning" | "error";
  children?: React.ReactNode;
  className?: string;
  role?: string;
}

const ICONS = { info: Info, success: CheckCircle2, warning: AlertTriangle, error: AlertCircle };
const TONES = { info: "notice-info", success: "notice-success", warning: "notice-warning", error: "notice-danger" };

/** Neutral tinted surface with a coloured icon; colours come from semantic tokens, never the accent. */
export function StatusBanner({ variant = "info", children, className, role }: StatusBannerProps) {
  const computedRole = role ?? (variant === "error" ? "alert" : "status");
  const Icon = ICONS[variant];
  return (
    <div role={computedRole} className={`notice ${TONES[variant]} ${className ?? ""}`}>
      <Icon aria-hidden="true" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
export default StatusBanner;
