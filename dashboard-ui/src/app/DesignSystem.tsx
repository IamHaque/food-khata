export function DesignSystem() {
  return (
    <section className="space-y-6">
      <div className="border-b pb-3">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Design system</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Use the theme selector to inspect light, dark and system appearance.
        </p>
      </div>

      <div className="page-panel rounded-xl border bg-card p-5 shadow-xs space-y-4">
        <h2 className="text-base font-semibold text-foreground">Type and surfaces</h2>
        <p className="text-xs text-muted-foreground">
          Inter · tabular numbers · opaque backgrounds · visible keyboard focus.
        </p>
        <p className="numeric text-2xl font-mono font-bold text-foreground">₹1,234,567.89</p>

        <div className="flex flex-wrap items-center gap-3">
          <button className="rounded-md border border-input bg-primary text-primary-foreground px-4 py-2 text-xs font-semibold shadow-xs hover:bg-primary/90">
            Default button
          </button>
          <button
            disabled
            className="rounded-md border border-input bg-muted text-muted-foreground px-4 py-2 text-xs font-semibold opacity-50 cursor-not-allowed"
          >
            Disabled button
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md">
          <label className="flex flex-col gap-1 text-xs font-medium text-foreground">
            <span>Example field</span>
            <input
              placeholder="Keyboard focus example"
              className="h-9 rounded-md border border-input bg-background px-3 text-xs shadow-xs focus:ring-1 focus:ring-ring"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium text-foreground">
            <span>Example choice</span>
            <select className="h-9 rounded-md border border-input bg-background px-3 text-xs shadow-xs focus:ring-1 focus:ring-ring font-medium">
              <option>Delivered</option>
              <option>Cancelled</option>
            </select>
          </label>
        </div>

        <details className="rounded-lg border bg-muted/20 p-3 text-xs group">
          <summary className="cursor-pointer font-semibold text-foreground select-none">Disclosure</summary>
          <p className="text-muted-foreground mt-2">Opaque expanded content.</p>
        </details>

        <div>
          <span className="badge inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
            Status badge
          </span>
        </div>
      </div>

      <div className="page-panel rounded-xl border bg-card p-5 shadow-xs space-y-2" role="status">
        <h2 className="text-base font-semibold text-foreground">Loading</h2>
        <div className="ledger-skeleton rounded-lg border bg-muted/20 p-6 text-center text-xs text-muted-foreground animate-pulse">
          Loading records…
        </div>
      </div>

      <div className="page-panel rounded-xl border bg-card p-5 shadow-xs space-y-2">
        <h2 className="text-base font-semibold text-foreground">Empty</h2>
        <p className="text-xs text-muted-foreground">No orders match these filters.</p>
        <button className="rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium shadow-xs hover:bg-accent">
          Clear filters example
        </button>
      </div>

      <div className="page-panel rounded-xl border border-destructive/20 bg-destructive/10 p-5 shadow-xs space-y-2">
        <h2 className="text-base font-semibold text-destructive">Error</h2>
        <p className="text-xs text-destructive">Data could not load.</p>
        <button className="rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium shadow-xs hover:bg-accent">
          Retry example
        </button>
      </div>

      <div className="partial rounded-xl border border-amber-500/30 bg-amber-500/10 p-5 shadow-xs space-y-2">
        <h2 className="text-base font-semibold text-amber-900 dark:text-amber-200">Partial data</h2>
        <p className="text-xs text-amber-900/80 dark:text-amber-200/80">
          Some API-visible history or details are incomplete. Saved details are snapshots.
        </p>
      </div>
    </section>
  );
}
