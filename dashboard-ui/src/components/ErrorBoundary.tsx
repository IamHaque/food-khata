import * as React from "react";

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch() {
    /* render errors are surfaced via the fallback UI */
  }
  render() {
    if (this.state.hasError) {
      return (
        <div role="alert" className="p-8 text-center space-y-3">
          <h1 className="text-2xl font-bold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">An unexpected error occurred.</p>
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              className="rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium shadow-xs hover:bg-accent"
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
            <a
              href="/home"
              className="inline-flex items-center rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium shadow-xs hover:bg-accent"
            >
              Go to Home
            </a>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
