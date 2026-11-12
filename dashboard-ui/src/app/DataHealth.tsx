import { Link, useLocation } from 'react-router-dom';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useHealth, useMetadata } from '../hooks/api';
import { useFilters } from './FilterContext';
import { useAccounts } from '../features/access/api';
import { StatusBadge } from '../features/access/sync/StatusBadge';
import { ScopeNotice, isSyncDataComplete } from './SyncStatusPanel';
import { formatExactTimestamp } from './sync-format';

const n = (v: number | null | undefined) => (v ?? 0).toLocaleString('en-IN');

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-mono text-lg font-bold text-foreground">{value}</dd>
      {hint && <dd className="text-xs text-muted-foreground">{hint}</dd>}
    </div>
  );
}

/** Full-page Data Health: what the dashboard is built on and what needs attention. */
export default function DataHealth() {
  const location = useLocation();
  const { filters } = useFilters();
  const health = useHealth(filters);
  const metadata = useMetadata(filters);
  const accounts = useAccounts();
  const h = health.data;

  if (!h) {
    return (
      <section className="page-panel rounded-xl border bg-card p-8 text-center text-xs text-muted-foreground" role={health.isError ? 'alert' : 'status'}>
        {health.isError ? (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-destructive">Data health could not load.</p>
            <button onClick={() => void health.refetch()} className="min-h-[44px] rounded-md border border-input bg-background px-3 text-xs font-medium hover:bg-accent">Retry</button>
          </div>
        ) : 'Loading…'}
      </section>
    );
  }

  const scope = metadata.data?.accounts ?? [];
  const orders = scope.reduce((sum, a) => sum + a.order_count, 0);
  const label = (id: string) => scope.find(a => a.id === id)?.label ?? metadata.data?.all_accounts.find(a => a.id === id)?.label ?? 'Account';
  const complete = isSyncDataComplete(h);
  const review = new URLSearchParams(location.search);
  review.set('anomaly', 'review');
  const needsReview = (h.reconciliation_anomalies ?? 0) + (h.quarantined_orders ?? 0);

  return (
    <section className="space-y-6" aria-labelledby="data-health-heading">
      <div className="border-b pb-3">
        <h1 id="data-health-heading" className="text-2xl font-bold tracking-tight text-foreground">Data health</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">How complete and trustworthy the numbers are for the current filters. Updated {formatExactTimestamp(h.generated_at)}.</p>
      </div>
      <ScopeNotice />
      <p role="status" className={`flex items-center gap-2 rounded-lg border p-3 text-sm font-medium ${complete ? 'border-primary/20 bg-primary/10 text-primary' : 'border-warning/40 bg-warning/10 text-warning'}`}>
        {complete ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <AlertTriangle className="h-4 w-4" aria-hidden="true" />}
        {complete ? 'History and bill details are complete.' : 'Some history or bill details are missing. Run a sync to fill them in.'}
      </p>

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Orders in scope" value={n(orders)} hint={metadata.data?.date_from ? `${metadata.data.date_from} to ${metadata.data.date_to}` : undefined} />
        <Stat label="History" value={h.history_complete ? 'Complete' : 'Partial'} />
        <Stat label="Bill details" value={h.details_complete ? 'Complete' : 'Partial'} />
        <Stat label="Verified totals" value={h.verified_percent == null ? 'Unknown' : `${h.verified_percent.toFixed(1)}%`} />
        <Stat label="Reconciliation anomalies" value={n(h.reconciliation_anomalies)} hint="Bill parts that do not add up to the amount paid" />
        <Stat label="Quarantined records" value={n(h.quarantined_orders)} hint="Set aside because they could not be read safely" />
        <Stat label="Duplicate orders" value={n(h.duplicate_orders)} />
      </dl>

      <Link
        to={{ pathname: '/orders', search: review.toString() }}
        className="inline-flex min-h-[44px] items-center rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-accent"
      >
        {needsReview ? `Review ${n(needsReview)} flagged order${needsReview === 1 ? '' : 's'}` : 'Open Orders filtered to Needs review'}
      </Link>

      <section aria-labelledby="imports-heading" className="space-y-2">
        <h2 id="imports-heading" className="text-base font-semibold">Import status by account</h2>
        {!h.imports.length ? <p className="text-sm text-muted-foreground">Nothing imported yet.</p> : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40"><tr>
                <th scope="col" className="p-2 text-left font-medium">Account</th>
                <th scope="col" className="p-2 text-left font-medium">Platform</th>
                <th scope="col" className="p-2 text-left font-medium">History</th>
                <th scope="col" className="p-2 text-left font-medium">Details</th>
                <th scope="col" className="p-2 text-left font-medium">Latest sync job</th>
              </tr></thead>
              <tbody className="divide-y">
                {h.imports.map(x => {
                  const acc = accounts.data?.find(a => a.local_id === x.account_id && a.provider.toLowerCase() === x.platform.toLowerCase());
                  return (
                    <tr key={`${x.account_id}:${x.platform}`}>
                      <td className="p-2 font-mono">{label(x.account_id)}</td>
                      <td className="p-2 capitalize">{x.platform.toLowerCase()}</td>
                      <td className="p-2">{x.history_complete ? 'Complete' : 'Partial'}</td>
                      <td className="p-2">{x.details_complete ? 'Complete' : 'Partial'}</td>
                      <td className="p-2">{acc?.active_status && acc.active_job_id ? <Link to={`/jobs/${encodeURIComponent(acc.active_job_id)}`}><StatusBadge status={acc.active_status} /></Link> : acc?.last_sync ? `Done ${new Date(acc.last_sync).toLocaleString()}` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}
