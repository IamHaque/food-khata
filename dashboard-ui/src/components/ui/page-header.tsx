import * as React from "react";
import { Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";

export interface PageHeaderProps {
  title: string;
  /** One line, plain language. */
  description?: React.ReactNode;
  actions?: React.ReactNode;
  back?: { to: string; label: string };
}

/** Title, one-line description and actions: the same pattern on every page. */
export function PageHeader({ title, description, actions, back }: PageHeaderProps) {
  return (
    <header className="space-y-1.5">
      {back && (
        <Link to={back.to} className="touch inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
