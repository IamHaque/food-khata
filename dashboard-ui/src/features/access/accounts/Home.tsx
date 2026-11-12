import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import { AppPage, StatusBanner } from "../primitives";
import { useAccounts } from "../api";
import { StatusPill } from "@/components/ui/status-pill";
import { platformLabel, pluralize } from "@/lib/format";
import { accountsApi, ApiError } from "../api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ACTIVE_STATUSES } from "../sync/api";
import { StatusBadge } from "../sync/StatusBadge";
import { VerifyAgain } from "./VerifyAgain";

function statusChip(status: string) {
  return <StatusPill tone={status === "ok" ? "success" : status === "expiring" ? "warning" : "danger"}>{status}</StatusPill>;
}

const when = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(); };
const action = "inline-flex items-center rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent min-h-[44px]";

export function Home() {
  const navigate = useNavigate();
  const accounts = useAccounts();
  const disconnectTrigger = React.useRef<HTMLButtonElement | null>(null);
  const [disconnecting, setDisconnecting] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);

  // `disconnecting` holds "accountId|provider": one card per provider (R-01).
  const handleDisconnect = async (target: string, wipe: boolean) => {
    const [id, provider] = target.split("|");
    try {
      await accountsApi.disconnect(id, wipe, provider);
      setMessage(wipe ? "Account data wiped." : "Account disconnected; data kept.");
      setDisconnecting(null);
      accounts.refetch();
    } catch (err) {
      if (err instanceof ApiError) setMessage(err.message);
      else setMessage("Failed to disconnect.");
    }
  };

  return (
    <AppPage title="Accounts" subtitle="Link, sync or disconnect your Zomato and Swiggy accounts.">
      <div className="space-y-4">
        {message && <StatusBanner variant="info">{message}</StatusBanner>}

        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Linked accounts</h2>
          <Button type="button" onClick={() => navigate("/accounts/link")}>Link account</Button>
        </div>

        {accounts.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

        {!accounts.isLoading && (!accounts.data || accounts.data.length === 0) && (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            No accounts linked yet. <Link to="/accounts/link" className="text-primary underline">Link your first account</Link> to start syncing orders.
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {(accounts.data ?? []).map((acc) => {
            const busy = ACTIVE_STATUSES.includes(acc.active_status ?? "");
            const needsCode = acc.status === "expired" || acc.active_status === "needs_code";
            return (
            <div key={`${acc.id}:${acc.provider}`} className="rounded-lg border bg-card p-4 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong>{platformLabel(acc.provider)}</strong>
                <span className="flex items-center gap-2">
                  {acc.active_status && acc.active_job_id && (
                    <Link to={`/jobs/${encodeURIComponent(acc.active_job_id)}`} aria-label={`Open ${acc.provider} job: ${acc.active_status.replaceAll("_", " ")}`}><StatusBadge status={acc.active_status} /></Link>
                  )}
                  {statusChip(acc.status)}
                </span>
              </div>
              <div className="text-sm text-muted-foreground">
                {acc.phone ?? "No phone number"} · {pluralize(acc.order_count, "order")}
                {acc.last_sync ? ` · last synced ${when(acc.last_sync)}` : " · never synced"}
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                {busy ? (
                  <button type="button" disabled title="A sync is already active for this account" className={`${action} opacity-50`}>Sync</button>
                ) : (
                  <Link className={action} to={`/sync?account=${encodeURIComponent(acc.local_id)}&provider=${encodeURIComponent(acc.provider)}`}>Sync</Link>
                )}
                {needsCode && <VerifyAgain accountId={acc.id} provider={acc.provider} />}
                <button
                  type="button"
                  onClick={(event) => { disconnectTrigger.current = event.currentTarget; setDisconnecting(`${acc.id}|${acc.provider}`); }}
                  className={action}
                >
                  Disconnect
                </button>
              </div>
            </div>
            );
          })}
        </div>

        <Dialog open={disconnecting !== null} onOpenChange={(open) => { if (!open) setDisconnecting(null); }}>
          <DialogContent className="w-[calc(100%-2rem)] rounded-lg" onCloseAutoFocus={(event) => { event.preventDefault(); disconnectTrigger.current?.focus(); }}>
            <DialogTitle>Disconnect account?</DialogTitle>
            <DialogDescription>Disconnecting signs this account out of Food Khata. You choose whether the orders already saved on this computer stay or are deleted.</DialogDescription>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => disconnecting && handleDisconnect(disconnecting, false)}>Disconnect, keep local data</Button>
              <Button variant="destructive" onClick={() => disconnecting && handleDisconnect(disconnecting, true)}>Disconnect and wipe local data</Button>
              <Button variant="outline" onClick={() => setDisconnecting(null)}>Cancel</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppPage>
  );
}
export default Home;
