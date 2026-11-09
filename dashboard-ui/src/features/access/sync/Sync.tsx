import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { AuthShell, StatusBanner } from "../primitives";
import { isSyncActive, syncApi, SYNC_LOGOUT_WARNING, type SyncJob, type SyncMode } from "./api";

export function SyncLogoutWarning({ jobs }: { jobs: SyncJob[] }) {
  return jobs.some(isSyncActive) ? <StatusBanner variant="warning">{SYNC_LOGOUT_WARNING}</StatusBanner> : null;
}

const modes: [SyncMode, string, string][] = [
  ["new", "New orders", "Fetch orders added since your last sync."],
  ["all", "All history", "Scan your entire order history, including older orders."],
  ["missing", "Missing bill details", "Retry bill details missing from previously fetched orders."],
];

export function SyncChooser({ accountId, onStarted }: { accountId: string; onStarted: (job: SyncJob) => void }) {
  const [mode, setMode] = React.useState<SyncMode>("new");
  const start = useMutation({ mutationFn: () => syncApi.create(accountId, mode), onSuccess: onStarted });
  return <form className="space-y-4" onSubmit={e => { e.preventDefault(); start.mutate(); }}>
    <fieldset disabled={start.isPending} className="space-y-3">
      <legend className="font-medium">Choose a sync</legend>
      {modes.map(([value, label, effect]) => <label key={value} className="flex gap-3 rounded-lg border p-3">
        <input type="radio" name="sync-mode" value={value} checked={mode === value} onChange={() => setMode(value)} />
        <span><strong>{label}</strong><span className="block text-sm">{effect}</span><span className="block text-sm text-muted-foreground">Swiggy: about 20 minutes or more per 1,000 orders.</span></span>
      </label>)}
    </fieldset>
    {start.error && <StatusBanner variant="error">{start.error.message}</StatusBanner>}
    <Button disabled={!accountId || start.isPending}>{start.isPending ? "Starting…" : "Start sync"}</Button>
  </form>;
}

export function SyncJobScreen({ jobId }: { jobId: string }) {
  const client = useQueryClient();
  const [code, setCode] = React.useState("");
  // shortcut: discard dismisses this view only; add durable deletion when the API supports it.
  const [notice, setNotice] = React.useState("");
  React.useEffect(() => { setCode(""); setNotice(""); }, [jobId]);
  const key = ["access", "sync", jobId];
  const query = useQuery({ queryKey: key, queryFn: () => syncApi.get(jobId), refetchInterval: q => q.state.data && isSyncActive(q.state.data) ? 2000 : false });
  const action = useMutation({
    mutationFn: async (kind: "cancel" | "resume" | "code" | "partial") => {
      if (kind === "partial") {
        const result = await syncApi.usePartial(jobId);
        setNotice(`Partial data ready: ${result.imported} orders imported.`);
      } else {
        const job = await (kind === "code" ? syncApi.code(jobId, code) : syncApi[kind](jobId));
        client.setQueryData(key, job);
        setCode("");
      }
      await client.invalidateQueries({ queryKey: ["access", "sync"] });
    },
  });
  const job = query.data;
  return <section className="space-y-4" aria-label="Sync progress" aria-busy={query.isLoading}>
    {query.error && <StatusBanner variant="error">{query.error.message}<Button variant="link" onClick={() => void query.refetch()}>Retry</Button></StatusBanner>}
    {!job && query.isLoading && <p role="status">Loading sync…</p>}
    {job && <>
      <div role="status"><h2 className="font-semibold">{job.provider} · {job.status.replaceAll("_", " ")}</h2><p>Phase: {job.phase ?? "Waiting"}</p>
        <dl>{Object.entries(job.counts ?? {}).filter(([, value]) => typeof value === "number").map(([label, value]) => <div key={label} className="flex gap-2"><dt>{label.replaceAll("_", " ")}:</dt><dd>{String(value)}</dd></div>)}</dl>
      </div>
      {job.error_message && <StatusBanner variant="warning">{job.error_message}</StatusBanner>}
      {isSyncActive(job) && <><p>You can leave this page; the sync continues in the background.</p><Button variant="outline" disabled={action.isPending} onClick={() => action.mutate("cancel")}>Cancel sync</Button></>}
      {job.status === "needs_code" && <form className="space-y-3" onSubmit={e => { e.preventDefault(); if (code.trim()) action.mutate("code"); }}><label htmlFor="sync-code">Provider verification code</label><Input id="sync-code" autoComplete="one-time-code" required value={code} onChange={e => setCode(e.target.value)} /><Button disabled={action.isPending || !code.trim()}>Submit code</Button></form>}
      {["interrupted", "paused"].includes(job.status) && <><p>Log in again if needed, then resume this sync.</p><Link to={`/login?return=${encodeURIComponent(`/sync?job=${jobId}`)}`}>Log in again</Link><Button disabled={action.isPending} onClick={() => action.mutate("resume")}>Resume after login</Button></>}
      {["failed", "cancelled"].includes(job.status) && !notice && <div className="space-y-3"><p>Use any orders fetched before the sync stopped, or leave them out of your dashboard.</p><div className="flex flex-wrap gap-2"><Button disabled={action.isPending} onClick={() => action.mutate("partial")}>Use partial data</Button><Button variant="outline" disabled={action.isPending} onClick={() => setNotice("Partial data discarded from this view; it has not been imported. The server archive is retained.")}>Discard</Button></div></div>}
      {job.status === "done" && <StatusBanner variant="success">Sync complete. Your dashboard is ready.</StatusBanner>}
    </>}
    {notice && <StatusBanner>{notice}</StatusBanner>}
    {action.error && <StatusBanner variant="error">{action.error.message}</StatusBanner>}
    <Link className="block underline" to="/">Back to Home</Link>
  </section>;
}

export default function Sync() {
  const [params, setParams] = useSearchParams();
  const jobId = params.get("job");
  const accountId = params.get("account");
  return <AuthShell title="Sync orders">{jobId ? <SyncJobScreen key={jobId} jobId={jobId} /> : accountId ? <SyncChooser key={accountId} accountId={accountId} onStarted={job => setParams({ job: job.id })} /> : <><p>Choose a linked account from Home to start a sync.</p><Link to="/">Back to Home</Link></>}</AuthShell>;
}
