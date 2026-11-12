import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthShell, StatusBanner } from "../primitives";
import { useAccounts } from "../api";
import { StatusPill } from "@/components/ui/status-pill";
import { platformLabel, plural } from "@/lib/format";
import { accountsApi, ApiError } from "../api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

function statusChip(status: string) {
  return <StatusPill tone={status === "ok" ? "success" : status === "expiring" ? "warning" : "danger"}>{status}</StatusPill>;
}

export function Home() {
  const navigate = useNavigate();
  const accounts = useAccounts();
  const disconnectTrigger = React.useRef<HTMLButtonElement | null>(null);
  const [disconnecting, setDisconnecting] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [verifyHandle, setVerifyHandle] = React.useState<string | null>(null);
  const [verifyCode, setVerifyCode] = React.useState("");

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

  const startVerifyAgain = async (id: string, provider: string) => {
    try {
      const res = await accountsApi.verifyAgain(id, provider);
      setVerifyHandle(res.handle);
    } catch (err) {
      if (err instanceof ApiError) setMessage(err.message);
    }
  };

  const submitVerifyAgain = async () => {
    if (!verifyHandle) return;
    try {
      await accountsApi.linkVerify(verifyHandle, verifyCode);
      setMessage("Verified successfully.");
      setVerifyHandle(null);
      setVerifyCode("");
      accounts.refetch();
    } catch (err) {
      if (err instanceof ApiError) setMessage(err.message);
      else setMessage("Verification failed.");
    }
  };

  return (
    <AuthShell title="Accounts" subtitle="Link, sync or disconnect your Zomato and Swiggy accounts.">
      <div className="space-y-4">
        {message && <StatusBanner variant="info">{message}</StatusBanner>}

        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Linked accounts</h2>
          <Button onClick={() => navigate("/accounts/link")}>Link account</Button>
        </div>

        {accounts.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

        {!accounts.isLoading && (!accounts.data || accounts.data.length === 0) && (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            No accounts linked yet. <Link to="/accounts/link" className="text-primary underline">Link your first account</Link> to start syncing orders.
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {(accounts.data ?? []).map((acc) => (
            <div key={`${acc.id}:${acc.provider}`} className="rounded-lg border bg-card p-4 space-y-2">
              <div className="flex items-center justify-between">
                <strong>{platformLabel(acc.provider)}</strong>
                {statusChip(acc.status)}
              </div>
              <div className="text-sm text-muted-foreground">
                {acc.phone ?? "No phone number"} · {plural(acc.order_count, "order")}
                {acc.last_sync ? ` · last synced ${acc.last_sync}` : ""}
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <Link className="inline-flex items-center rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent min-h-[44px]" to={`/sync?account=${encodeURIComponent(acc.local_id)}&provider=${encodeURIComponent(acc.provider)}`}>Sync</Link>
                {acc.status === "expired" && (
                  <button
                    type="button"
                    onClick={() => startVerifyAgain(acc.id, acc.provider)}
                    className="rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent min-h-[44px]"
                  >
                    Verify again
                  </button>
                )}
                <button
                  type="button"
                  onClick={(event) => { disconnectTrigger.current = event.currentTarget; setDisconnecting(`${acc.id}|${acc.provider}`); }}
                  className="rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent min-h-[44px]"
                >
                  Disconnect
                </button>
              </div>
            </div>
          ))}
        </div>

        <Dialog open={disconnecting !== null} onOpenChange={(open) => { if (!open) setDisconnecting(null); }}>
          <DialogContent className="w-[calc(100%-2rem)] rounded-lg" onCloseAutoFocus={(event) => { event.preventDefault(); disconnectTrigger.current?.focus(); }}>
            <DialogTitle>Disconnect account?</DialogTitle>
            <DialogDescription>Keep or wipe this account's data?</DialogDescription>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => disconnecting && handleDisconnect(disconnecting, false)}>Keep data</Button>
              <Button variant="destructive" onClick={() => disconnecting && handleDisconnect(disconnecting, true)}>Wipe data</Button>
              <Button variant="outline" onClick={() => setDisconnecting(null)}>Cancel</Button>
            </div>
          </DialogContent>
        </Dialog>

        {verifyHandle && (
          <div className="rounded-md border bg-muted p-3 space-y-2">
            <p className="text-sm font-medium">Enter the SMS code</p>
            <Input
              aria-label="SMS code"
              type="text"
              value={verifyCode}
              onChange={(e) => setVerifyCode(e.target.value)}
              placeholder="SMS code"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
            <div className="flex gap-2">
              <button type="button" onClick={submitVerifyAgain} className="rounded-md bg-primary px-3 text-sm text-primary-foreground min-h-[44px]">
                Verify
              </button>
              <button type="button" onClick={() => { setVerifyHandle(null); setVerifyCode(""); }} className="rounded-md border border-input px-3 text-sm min-h-[44px]">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </AuthShell>
  );
}
export default Home;
