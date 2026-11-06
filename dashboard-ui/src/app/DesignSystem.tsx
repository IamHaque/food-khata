import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Popover, PopoverTrigger, PopoverContent } from '../components/ui/popover';

export function DesignSystem() {
  return (
    <section className="space-y-6">
      <div className="border-b pb-3">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Design system</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Use the theme selector to inspect light, dark and system appearance.
        </p>
      </div>

      <Card className="space-y-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-foreground">Type and surfaces</CardTitle>
          <p className="text-xs text-muted-foreground">
            Inter · tabular numbers · opaque backgrounds · visible keyboard focus.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="numeric text-2xl font-mono font-bold text-foreground">₹1,234,567.89</p>

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="default">
              Default button
            </Button>
            <Button variant="secondary" disabled>
              Disabled button
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline">
                  Open popover
                </Button>
              </PopoverTrigger>
              <PopoverContent className="text-xs space-y-1">
                <p className="font-semibold text-popover-foreground">Opaque popover token</p>
                <p className="text-muted-foreground">Derived from shared semantic palette.</p>
              </PopoverContent>
            </Popover>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md">
            <label className="flex flex-col gap-1 text-xs font-medium text-foreground">
              <span>Example field</span>
              <Input
                placeholder="Keyboard focus example"
                aria-label="Example field"
              />
            </label>

            <label className="flex flex-col gap-1 text-xs font-medium text-foreground">
              <span>Example choice</span>
              <select
                aria-label="Example choice"
                className="min-h-[44px] rounded-md border border-input bg-background px-3 text-xs focus:ring-1 focus:ring-ring font-medium text-foreground"
              >
                <option>Delivered</option>
                <option>Cancelled</option>
              </select>
            </label>
          </div>

          <details className="rounded-lg border bg-muted/20 p-3 text-xs group">
            <summary className="cursor-pointer font-semibold text-foreground select-none">Disclosure</summary>
            <p className="text-muted-foreground mt-2">Opaque expanded content.</p>
          </details>

          <div className="flex items-center gap-2">
            <Badge variant="default">Primary badge</Badge>
            <Badge variant="secondary">Secondary badge</Badge>
            <Badge variant="destructive">Destructive badge</Badge>
          </div>
        </CardContent>
      </Card>

      <Card role="status">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-foreground">Loading</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="ledger-skeleton rounded-lg border bg-muted/20 p-6 text-center text-xs text-muted-foreground animate-pulse">
            Loading records…
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-foreground">Empty</CardTitle>
          <p className="text-xs text-muted-foreground">No orders match these filters.</p>
        </CardHeader>
        <CardContent>
          <Button variant="outline" size="sm">
            Clear filters example
          </Button>
        </CardContent>
      </Card>

      <Card className="border-destructive/20 bg-destructive/10">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-destructive">Error</CardTitle>
          <p className="text-xs text-destructive">Data could not load.</p>
        </CardHeader>
        <CardContent>
          <Button variant="outline" size="sm">
            Retry example
          </Button>
        </CardContent>
      </Card>

      <Card className="border-amber-500/30 bg-amber-500/10">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-amber-900 dark:text-amber-200">Partial data</CardTitle>
          <p className="text-xs text-amber-900/90 dark:text-amber-200/90">
            Some API-visible history or details are incomplete. Saved details are snapshots.
          </p>
        </CardHeader>
      </Card>
    </section>
  );
}
