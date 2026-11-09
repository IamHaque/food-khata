import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthShell, StatusBanner } from "../primitives";
import { useAccounts } from "../api";
import { accountsApi, ApiError } from "../api";

function statusChip(status: string) {
  const cls =
    status === "ok"
      ? "bg-emerald-100 text-emerald-700"
      : status === "expiring"
        ? "bg-amber-100 text-amber-700"
        : "bg-rose-100 text-rose-700";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
}

export function Home() {
  const navigate = useNavigate();
  const accounts = useAccounts();
  const [disconnecting, setDisconnecting] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [verifyHandle, setVerifyHandle] = React.useState<{ id: string; handle: string } | null>(null);
  const [verifyCode, setVerifyCode] = React.useState("");

  const handleDisconnect = async (id: string, wipe: boolean) => {
    try {
      await accountsApi.disconnect(id, wipe);
      setMessage(wipe ? "Account data wiped." : "Account disconnected; data kept.");
      setDisconnecting(null);
      accounts.refetch();
    } catch (err) {
      if (err instanceof ApiError) setMessage(err.message);
      else setMessage("Failed to disconnect.");
    }
  };

  const startVerifyAgain = async (id: string) => {
    try {
      const res = await accountsApi.verifyAgain(id);
      setVerifyHandle({ id, handle: res.handle });
    } catch (err) {
      if (err instanceof ApiError) setMessage(err.message);
    }
  };

  const submitVerifyAgain = async () => {
    if (!verifyHandle) return;
    try {
      await accountsApi.verifyAgain(verifyHandle.id, verifyCode);
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
    <AuthShell title="Home" subtitle="Linked accounts">
      <div className="space-y-4">
        {message && <StatusBanner variant="info">{message}</StatusBanner>}

        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Linked accounts</h2>
          <button
            type="button"
            onClick={() => navigate("/accounts/link")}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
          >
            Link account
          </button>
        </div>

        {accounts.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

        {!accounts.isLoading && (!accounts.data || accounts.data.length === 0) && (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            No linked accounts yet.{" "}
            <Link to="/accounts/link" className="text-primary underline">
              Link your first account
            </Link>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {(accounts.data ?? []).map((acc) => (
            <div key={acc.id} className="rounded-lg border bg-card p-4 space-y-2">
              <div className="flex items-center justify-between">
                <strong className="capitalize">{acc.provider}</strong>
                {statusChip(acc.status)}
              </div>
              <div className="text-sm text-muted-foreground">
                {acc.phone ?? "no phone"} • {acc.order_count} orders
                {acc.last_sync ? ` • last sync ${acc.last_sync}` : ""}
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                {acc.status === "expired" && (
                  <button
                    type="button"
                    onClick={() => startVerifyAgain(acc.id)}
                    className="rounded-md border px-2 py-1 text-xs font-medium"
                  >
                    Verify again
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setDisconnecting(acc.id)}
                  className="rounded-md border px-2 py-1 text-xs font-medium"
                >
                  Disconnect
                </button>
              </div>
              {disconnecting === acc.id && (
                <div className="rounded-md border bg-muted p-3 space-y-2">
                  <p className="text-sm">Keep or wipe this account's data?</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleDisconnect(acc.id, false)}
                      className="rounded-md border px-2 py-1 text-xs"
                    >
                      Keep data
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDisconnect(acc.id, true)}
                      className="rounded-md border px-2 py-1 text-xs text-destructive"
                    >
                      Wipe data
                    </button>
                    <button
                      type="button"
                      onClick={() => setDisconnecting(null)}
                      className="rounded-md border px-2 py-1 text-xs"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {verifyHandle && (
          <div className="rounded-md border bg-muted p-3 space-y-2">
            <p className="text-sm font-medium">Verify again</p>
            <input
              type="text"
              value={verifyCode}
              onChange={(e) => setVerifyCode(e.target.value)}
              placeholder="SMS code"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
            <div className="flex gap-2">
              <button type="button" onClick={submitVerifyAgain} className="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground">
                Verify
              </button>
              <button type="button" onClick={() => { setVerifyHandle(null); setVerifyCode(""); }} className="rounded-md border px-3 py-1 text-xs">
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
