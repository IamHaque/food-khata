import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDashboard, useMetadata } from '../hooks/api';
import { useFilters } from './FilterContext';
import { useAccounts } from '../features/access/api';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../components/ui/sheet';
import { formatExactTimestamp, formatRelativeSync } from './sync-format';
import type { components } from '../types/api';
import { AlertTriangle, CheckCircle2, Info, ShieldCheck } from 'lucide-react';

export const SCOPE_NOTICE = 'Food orders only. Instamart, Dineout, and grocery orders are excluded.';

type ImportHealth = {
  account_id: string;
  platform: string;
  history_complete: boolean;
  details_complete: boolean;
};

export type SyncPanelHealth = {
  generated_at?: string | null;
  history_complete?: boolean;
  details_complete?: boolean;
  data_complete?: boolean;
  verified_percent?: number | null;
  null_rates?: Record<string, number | null>;
  duplicate_orders?: number;
  quarantined_orders?: number;
  reconciliation_anomalies?: number;
  imports?: ImportHealth[];
};

export type SyncPanelSummary = {
  total_orders?: number | null;
  date_from?: string | null;
  date_to?: string | null;
  platforms?: { platform: string; orders: number }[];
};

export function isSyncDataComplete(health: SyncPanelHealth | null | undefined): boolean {
  if (!health) return false;
  if (typeof health.data_complete === 'boolean') return health.data_complete;
  return Boolean(health.history_complete && health.details_complete);
}

/**
 * Panel open state driven by the URL (`?sync=open`, used by /data-health redirects)
 * and by the chip. Closing drops the `sync` parameter so a refresh does not reopen it.
 */
export function useSyncPanelState() {
  const [params, setParams] = useSearchParams();
  const requested = params.get('sync') === 'open';
  const [open, setOpen] = useState<boolean>(requested);

  useEffect(() => {
    if (requested) setOpen(true);
  }, [requested]);

  const setPanelOpen = (next: boolean) => {
    setOpen(next);
    if (!next && params.has('sync')) {
      const nextParams = new URLSearchParams(params);
      nextParams.delete('sync');
      setParams(nextParams, { replace: true });
    }
  };

  return { open, setOpen: setPanelOpen };
}

export function ScopeNotice({ className = '' }: { className?: string }) {
  return (
    <p
      role="note"
      data-testid="scope-notice"
      className={`notice notice-info ${className}`}
    >
      <Info aria-hidden="true" />
      <span>{SCOPE_NOTICE}</span>
    </p>
  );
}

function formatRate(value: number | null | undefined): string {
  return value == null ? 'Unknown' : `${value.toFixed(1)}%`;
}

export function SyncStatusPanelBody({
  health,
  summary,
  loading = false,
  error = false,
  onRetry,
}: {
  health?: SyncPanelHealth | null;
  summary?: SyncPanelSummary | null;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
}) {
  const complete = isSyncDataComplete(health);
  const platforms = summary?.platforms ?? [];
  const platformOrders = (name: string) =>
    platforms.find(x => x.platform.toLowerCase() === name.toLowerCase())?.orders ?? 0;
  const totalOrders =
    summary?.total_orders ?? (platforms.length ? platforms.reduce((sum, x) => sum + x.orders, 0) : null);
  const verifiedPercent = health?.verified_percent ?? null;
  const verifiedOrders =
    totalOrders == null || verifiedPercent == null ? null : Math.round((totalOrders * verifiedPercent) / 100);
  const unverifiedOrders = verifiedOrders == null || totalOrders == null ? null : Math.max(0, totalOrders - verifiedOrders);
  const nullRates = health?.null_rates ?? {};

  return (
    <div className="space-y-5" data-testid="sync-status-panel">
      <div className="pr-8">
        <h2 className="text-lg font-semibold text-foreground">Data Health &amp; Sync Status</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Sync freshness, import coverage, and data hygiene for the active scope.
        </p>
      </div>

      <ScopeNotice />

      {error && !health ? (
        <div role="alert" className="space-y-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
          <p className="font-semibold">Data health could not load.</p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="rounded-md border border-input bg-background px-2.5 py-1 text-xs font-medium text-foreground shadow-xs hover:bg-accent"
            >
              Retry
            </button>
          )}
        </div>
      ) : loading && !health ? (
        <p role="status" className="p-6 text-center text-xs text-muted-foreground animate-pulse">
          Loading health…
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/20 p-3">
            <div className="flex items-center gap-2">
              {complete ? (
                <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden="true" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-warning" aria-hidden="true" />
              )}
              <span className="text-xs font-semibold text-foreground">Overall completeness</span>
            </div>
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                complete
                  ? 'border-primary/20 bg-primary/10 text-primary'
                  : 'border-warning/40 bg-warning/10 text-warning'
              }`}
            >
              {complete ? 'Complete' : 'Incomplete'}
            </span>
          </div>

          {error && (
            <p role="alert" className="text-xs font-medium text-destructive">
              Refresh failed; showing the last loaded snapshot.
            </p>
          )}

          <section className="space-y-2" aria-labelledby="sync-timestamps-heading">
            <h3 id="sync-timestamps-heading" className="text-sm font-semibold text-foreground">
              Sync timestamps
            </h3>
            <dl className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
              <div className="rounded-lg border bg-card p-3">
                <dt className="text-muted-foreground">Last sync</dt>
                <dd className="mt-0.5 font-semibold text-foreground">
                  {health?.generated_at ? formatRelativeSync(health.generated_at) : 'Unknown'}
                </dd>
                <dd className="mt-0.5 font-mono text-xs text-muted-foreground">
                  {formatExactTimestamp(health?.generated_at)}
                </dd>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <dt className="text-muted-foreground">Order date range</dt>
                <dd className="mt-0.5 font-mono font-semibold text-foreground">
                  {summary?.date_from ?? 'Unknown'} → {summary?.date_to ?? 'Unknown'}
                </dd>
                <dd className="mt-0.5 text-xs text-muted-foreground">Earliest to latest matching order</dd>
              </div>
            </dl>
          </section>

          <section className="space-y-2" aria-labelledby="sync-orders-heading">
            <h3 id="sync-orders-heading" className="text-sm font-semibold text-foreground">
              Order statistics
            </h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg border bg-card p-3">
                <span className="block text-muted-foreground">Total orders</span>
                <strong className="mt-0.5 block font-mono text-base font-bold text-foreground">
                  {totalOrders == null ? 'Unknown' : totalOrders.toLocaleString('en-IN')}
                </strong>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <span className="block text-muted-foreground">Swiggy orders</span>
                <strong className="mt-0.5 block font-mono text-base font-bold text-foreground">
                  {platformOrders('swiggy').toLocaleString('en-IN')}
                </strong>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <span className="block text-muted-foreground">Zomato orders</span>
                <strong className="mt-0.5 block font-mono text-base font-bold text-foreground">
                  {platformOrders('zomato').toLocaleString('en-IN')}
                </strong>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <span className="block text-muted-foreground">Verified bills</span>
                <strong className="mt-0.5 block font-mono text-base font-bold text-foreground">
                  {verifiedOrders == null ? 'Unknown' : verifiedOrders.toLocaleString('en-IN')}
                </strong>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {verifiedPercent == null ? 'Unknown rate' : `${verifiedPercent.toFixed(1)}% verified`}
                </span>
              </div>
            </div>
          </section>

          <section className="space-y-2" aria-labelledby="sync-hygiene-heading">
            <h3 id="sync-hygiene-heading" className="text-sm font-semibold text-foreground">
              Data hygiene
            </h3>
            <dl className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg border bg-card p-3">
                <dt className="text-muted-foreground">Missing restaurant names</dt>
                <dd className="mt-0.5 font-mono font-semibold text-foreground">
                  {formatRate(nullRates.restaurant_name ?? nullRates.restaurant_cuisine ?? nullRates.restaurant_locality ?? 0)}
                </dd>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <dt className="text-muted-foreground">Missing items</dt>
                <dd className="mt-0.5 font-mono font-semibold text-foreground">
                  {formatRate(nullRates.items_summary ?? nullRates.category ?? nullRates.is_veg ?? 0)}
                </dd>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <dt className="text-muted-foreground">Unverified totals</dt>
                <dd className="mt-0.5 font-mono font-semibold text-foreground">
                  {unverifiedOrders == null ? 'Unknown' : unverifiedOrders.toLocaleString('en-IN')}
                </dd>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <dt className="text-muted-foreground">Duplicate orders</dt>
                <dd className="mt-0.5 font-mono font-semibold text-foreground">
                  {(health?.duplicate_orders ?? 0).toLocaleString('en-IN')}
                </dd>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <dt className="text-muted-foreground">Quarantined orders</dt>
                <dd className="mt-0.5 font-mono font-semibold text-foreground">
                  {(health?.quarantined_orders ?? 0).toLocaleString('en-IN')}
                </dd>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <dt className="text-muted-foreground">Reconciliation anomalies</dt>
                <dd className="mt-0.5 font-mono font-semibold text-foreground">
                  {(health?.reconciliation_anomalies ?? 0).toLocaleString('en-IN')}
                </dd>
              </div>
            </dl>
          </section>

          {Boolean(health?.imports?.length) && (
            <section className="space-y-2" aria-labelledby="sync-imports-heading">
              <h3 id="sync-imports-heading" className="text-sm font-semibold text-foreground">
                Import coverage
              </h3>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-xs">
                  <thead className="border-b bg-muted/40">
                    <tr>
                      <th className="p-2 text-left font-medium">Account</th>
                      <th className="p-2 text-left font-medium">Platform</th>
                      <th className="p-2 text-center font-medium">History</th>
                      <th className="p-2 text-center font-medium">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y font-mono">
                    {health?.imports?.map(x => (
                      <tr key={`${x.account_id}:${x.platform}`} className="hover:bg-muted/30">
                        <td className="p-2">{x.account_id}</td>
                        <td className="p-2 font-semibold">{x.platform}</td>
                        <td className="p-2 text-center font-sans">{x.history_complete ? 'Complete' : 'Partial'}</td>
                        <td className="p-2 text-center font-sans">{x.details_complete ? 'Complete' : 'Partial'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <p className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
            <ShieldCheck className="mr-1 inline h-3.5 w-3.5 text-primary" aria-hidden="true" />
            API-visible history only. Saved details are snapshots; later refunds or status changes may be missing.
          </p>
        </>
      )}
    </div>
  );
}

function summarize(
  metadata: components['schemas']['FilterOptions'] | undefined,
  dashboard: components['schemas']['Dashboard'] | undefined,
): SyncPanelSummary {
  const accountOrders = metadata?.all_accounts.reduce((sum, account) => sum + account.order_count, 0);
  return {
    total_orders: dashboard?.kpis.orders ?? accountOrders ?? null,
    date_from: metadata?.date_from ?? null,
    date_to: metadata?.date_to ?? null,
    platforms: dashboard?.charts.platforms.map(x => ({ platform: x.platform, orders: x.orders })) ?? [],
  };
}

function SyncPanelContainer({
  health,
  healthLoading,
  healthError,
  onHealthRetry,
}: {
  health?: SyncPanelHealth | null;
  healthLoading: boolean;
  healthError: boolean;
  onHealthRetry: () => void;
}) {
  const { filters } = useFilters();
  const metadata = useMetadata(filters);
  const dashboard = useDashboard(filters);
  const accounts = useAccounts();

  return (
    <>
    <div className="space-y-2 pb-4"><h3 className="text-sm font-semibold">Linked accounts</h3>{accounts.data?.map(account => <p className="text-xs" key={account.local_id}>{account.provider} · {account.phone ?? account.local_id} · {account.order_count} orders · {account.status}</p>)}</div>
    <SyncStatusPanelBody
      health={health ? { ...health, imports: health.imports?.filter(item => accounts.data?.some(account => account.local_id === item.account_id)) } : health}
      summary={summarize(metadata.data, dashboard.data)}
      loading={healthLoading}
      error={healthError}
      onRetry={() => {
        onHealthRetry();
        void metadata.refetch();
        void dashboard.refetch();
      }}
    />
    </>
  );
}

export function SyncStatusPanel({
  open,
  onOpenChange,
  health,
  healthLoading = false,
  healthError = false,
  onHealthRetry,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  health?: SyncPanelHealth | null;
  healthLoading?: boolean;
  healthError?: boolean;
  onHealthRetry?: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto p-5 sm:max-w-md">
        <SheetHeader className="sr-only">
          <SheetTitle>Data Health &amp; Sync Status</SheetTitle>
          <SheetDescription>Sync freshness, import coverage, and data hygiene metrics.</SheetDescription>
        </SheetHeader>
        {open && (
          <SyncPanelContainer
            health={health}
            healthLoading={healthLoading}
            healthError={healthError}
            onHealthRetry={onHealthRetry ?? (() => undefined)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
