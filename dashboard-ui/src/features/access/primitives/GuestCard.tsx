import * as React from "react";
import { Link } from "react-router-dom";
import { InsecureNotice } from "@/app/InsecureNotice";

export interface GuestCardProps {
  title?: string;
  subtitle?: string;
  children?: React.ReactNode;
  wide?: boolean;
}

/** Signed-out pages only (welcome, setup, login, register): a centred card with no app navigation. */
export function GuestCard({ title, subtitle, children, wide }: GuestCardProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className={`w-full ${wide ? "max-w-3xl" : "max-w-md"} space-y-4 rounded-xl border bg-card p-6 shadow-sm`}>
        <Link to="/" className="block text-center text-sm font-semibold">Food Khata</Link>
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
export default GuestCard;
