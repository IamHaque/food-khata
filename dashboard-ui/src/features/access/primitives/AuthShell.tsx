import * as React from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/ui/page-header";
import { InsecureNotice } from "@/app/InsecureNotice";

export interface AuthShellProps {
  title?: string;
  subtitle?: string;
  /** Link back to the parent page, shown above the title inside the app shell. */
  back?: { to: string; label: string };
  children?: React.ReactNode;
}

/** True when rendered inside the signed-in app shell (header, navigation, theme control). */
export const InAppShell = React.createContext(false);

export function AuthShell({ title, subtitle, back, children }: AuthShellProps) {
  const inShell = React.useContext(InAppShell);
  if (inShell) {
    return (
      <div className="max-w-2xl space-y-5">
        {title && <PageHeader title={title} description={subtitle} back={back} />}
        {children}
      </div>
    );
  }
  // Signed-out pages (welcome, setup, login, register): a centred card without app navigation.
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-4 rounded-xl border bg-card p-6 shadow-sm">
        <Link to="/home" className="block text-center text-sm font-semibold">Food Khata</Link>
        {(title || subtitle) && (
          <div className="space-y-1 text-center">
            {title && <h1 className="text-xl font-semibold">{title}</h1>}
            {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
          </div>
        )}
        <InsecureNotice />
        {children}
      </div>
    </div>
  );
}
export default AuthShell;
