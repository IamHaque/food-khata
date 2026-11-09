import * as React from "react";

export interface AuthShellProps {
  title?: string;
  subtitle?: string;
  children?: React.ReactNode;
}

export function AuthShell({ title, subtitle, children }: AuthShellProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-4 rounded-xl border bg-card p-6 shadow-sm">
        {(title || subtitle) && (
          <div className="space-y-1 text-center">
            {title && <h1 className="text-xl font-bold">{title}</h1>}
            {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
export default AuthShell;
