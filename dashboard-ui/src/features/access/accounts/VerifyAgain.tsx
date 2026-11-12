import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { accountsApi, ApiError } from "../api";

/** Verify again: sends an SMS code, then finishes the link, which also resumes a sync that stopped on the expired session. */
export function VerifyAgain({ accountId, provider, onDone }: { accountId: string; provider: string; onDone?: () => void }) {
  const client = useQueryClient();
  const [handle, setHandle] = React.useState<string | null>(null);
  const [code, setCode] = React.useState("");
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const id = `verify-code-${accountId}-${provider}`;

  async function run(action: () => Promise<void>) {
    setBusy(true); setError("");
    try { await action(); } catch (err) { setError(err instanceof ApiError ? err.message : "Verification failed. Try again."); }
    finally { setBusy(false); }
  }
  const send = () => run(async () => { setHandle((await accountsApi.verifyAgain(accountId, provider)).handle); });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!handle) return;
    void run(async () => {
      await accountsApi.linkVerify(handle, code.trim());
      setHandle(null); setCode("");
      await Promise.all([client.invalidateQueries({ queryKey: ["accounts"] }), client.invalidateQueries({ queryKey: ["access", "sync"] })]);
      onDone?.();
    });
  };

  if (!handle) {
    return <div className="space-y-1">
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void send()}>Verify again</Button>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>;
  }
  return <form onSubmit={submit} className="w-full space-y-2 rounded-md border bg-muted p-3">
    <label htmlFor={id} className="block text-sm font-medium">SMS code for {provider}</label>
    <Input id={id} inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e => setCode(e.target.value)} />
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    <div className="flex gap-2">
      <Button type="submit" size="sm" disabled={busy || !code.trim()}>Verify</Button>
      <Button type="button" variant="outline" size="sm" onClick={() => { setHandle(null); setCode(""); setError(""); }}>Cancel</Button>
    </div>
  </form>;
}
