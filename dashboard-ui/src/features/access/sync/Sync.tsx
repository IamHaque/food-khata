import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "../../../components/ui/button";
import { AuthShell, StatusBanner } from "../primitives";
import { isSyncActive, syncApi, type SyncJob, type SyncMode } from "./api";
export { SyncLogoutWarning } from "./SyncLogoutWarning";

const modes: [SyncMode, string, string][] = [
  ["new", "New orders", "Fetch orders added since your last sync."],
  ["all", "All history", "Scan your entire order history, including older orders."],
  ["missing", "Missing bill details", "Retry bill details missing from previously fetched orders."],
];

export function SyncChooser({ accountId, provider, onStarted }: { accountId: string; provider?: string; onStarted: (job: SyncJob) => void }) {
  const [mode, setMode] = React.useState<SyncMode>("new");
  const start = useMutation({ mutationFn: () => syncApi.create(accountId, mode, provider), onSuccess: onStarted });
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
  const key = ["access", "sync", jobId];
  const query = useQuery({ queryKey: key, queryFn: () => syncApi.get(jobId), refetchInterval: q => q.state.data && isSyncActive(q.state.data) ? 2000 : false });
  const action = useMutation({
    mutationFn: async (kind: "cancel" | "resume" | "partial" | "discard" | "retryImport") => {
      if (kind === "partial") {
        await syncApi.usePartial(jobId);
      } else if (kind === "discard") {
        client.setQueryData(key, await syncApi.discardPartial(jobId));
      } else {
        const job = await syncApi[kind](jobId);
        client.setQueryData(key, job);
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
      {job.status === "needs_code" && <><p>Your provider session expired. Verify the account again; this sync then resumes by itself.</p><Link to="/home">Verify again on Home</Link></>}
      {["interrupted", "paused"].includes(job.status) && <><p>Log in again if needed, then resume this sync.</p><Link to={`/login?return=${encodeURIComponent(`/sync?job=${jobId}`)}`}>Log in again</Link><Button disabled={action.isPending} onClick={() => action.mutate("resume")}>Resume after login</Button></>}
      {job.import_pending && <><StatusBanner variant="warning">Fetched, import failed</StatusBanner><Button disabled={action.isPending} onClick={() => action.mutate("retryImport")}>Retry import</Button></>}
      {["failed", "cancelled"].includes(job.status) && !job.import_pending && (job.partial_decision ?? "pending") === "pending" && <div className="space-y-3"><p>Use any orders fetched before the sync stopped, or leave them out of your dashboard.</p><div className="flex flex-wrap gap-2"><Button disabled={action.isPending} onClick={() => action.mutate("partial")}>Use partial data</Button><Button variant="outline" disabled={action.isPending} onClick={() => action.mutate("discard")}>Discard</Button></div></div>}
      {["failed", "cancelled"].includes(job.status) && job.partial_decision === "imported" && <StatusBanner>Partial data was imported into your dashboard.</StatusBanner>}
      {["failed", "cancelled"].includes(job.status) && job.partial_decision === "discarded" && <StatusBanner>Partial data discarded. Previously imported orders remain in your dashboard.</StatusBanner>}
      {job.status === "done" && <StatusBanner variant="success">Sync complete. Your dashboard is ready.</StatusBanner>}
    </>}
    {action.error && <StatusBanner variant="error">{action.error.message}</StatusBanner>}
    <Link className="block underline" to="/home">Back to Home</Link>
  </section>;
}

export default function Sync() {
  const [params, setParams] = useSearchParams();
  const jobId = params.get("job");
  const accountId = params.get("account");
  return <AuthShell title="Sync orders">{jobId ? <SyncJobScreen key={jobId} jobId={jobId} /> : accountId ? <SyncChooser key={accountId + (params.get("provider") ?? "")} accountId={accountId} provider={params.get("provider") ?? undefined} onStarted={job => setParams({ job: job.id })} /> : <><p>Choose a linked account from Home to start a sync.</p><Link to="/home">Back to Home</Link></>}</AuthShell>;
}
