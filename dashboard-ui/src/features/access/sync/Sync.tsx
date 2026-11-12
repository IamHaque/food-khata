import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "../../../components/ui/button";
import { AuthShell, StatusBanner } from "../primitives";
import { ApiError, useAccounts } from "../api";
import { VerifyAgain } from "../accounts/VerifyAgain";
import { ACTIVE_STATUSES, formatSeconds, isSyncActive, jobLabel, syncApi, type SyncJob, type SyncMode } from "./api";
export { SyncLogoutWarning } from "./SyncLogoutWarning";

const modes: [SyncMode, string, string][] = [
  ["new", "New orders", "Fetch orders added since your last sync."],
  ["all", "All history", "Scan your entire order history, including older orders."],
  ["missing", "Missing bill details", "Retry bill details missing from previously fetched orders."],
];
const jobMode: Record<SyncMode, string> = { new: "incremental", all: "full", missing: "repair" };

/** What the last finished sync of this provider and kind actually took; the only estimate we can stand behind. */
export function lastRunText(jobs: SyncJob[] | undefined, provider: string | undefined, mode: SyncMode) {
  const run = Array.isArray(jobs) ? jobs.find(j => j.status === "done" && j.provider === provider && j.mode === jobMode[mode] && j.started_at && j.finished_at) : undefined;
  if (!run) return "No timing yet; your first run of this kind will set it.";
  const orders = typeof run.counts?.orders === "number" ? ` for ${run.counts.orders} orders` : "";
  return `Last time this took about ${formatSeconds(Math.max(1, Math.round(run.finished_at! - run.started_at!)))}${orders}.`;
}

export function SyncBusyLink({ error }: { error: unknown }) {
  return error instanceof ApiError && error.jobId ? <> <Link className="underline" to={`/sync?job=${encodeURIComponent(error.jobId)}`}>View the running sync</Link></> : null;
}

export function SyncChooser({ accountId, provider, onStarted }: { accountId: string; provider?: string; onStarted: (job: SyncJob) => void }) {
  const [mode, setMode] = React.useState<SyncMode>("new");
  const start = useMutation({ mutationFn: () => syncApi.create(accountId, mode, provider), onSuccess: onStarted });
  const accounts = useAccounts();
  const done = useQuery({ queryKey: ["access", "sync", "done", provider], queryFn: () => syncApi.list({ status: "done", limit: 50 }), retry: false });
  const account = Array.isArray(accounts.data) ? accounts.data.find(a => a.local_id === accountId && (!provider || a.provider === provider)) : undefined;
  return <form className="space-y-4" onSubmit={e => { e.preventDefault(); start.mutate(); }}>
    <p className="text-sm">Syncing <strong className="capitalize">{provider ?? account?.provider ?? "your"}</strong> account{account?.phone ? <> <span className="font-mono">{account.phone}</span></> : null}.</p>
    <fieldset disabled={start.isPending} className="space-y-3">
      <legend className="font-medium">Choose a sync</legend>
      {modes.map(([value, label, effect]) => <label key={value} className="flex min-h-[44px] gap-3 rounded-lg border p-3">
        <input type="radio" name="sync-mode" value={value} checked={mode === value} onChange={() => setMode(value)} />
        <span><strong>{label}</strong><span className="block text-sm">{effect}</span><span className="block text-sm text-muted-foreground">{lastRunText(done.data, provider ?? account?.provider, value)}</span></span>
      </label>)}
    </fieldset>
    {start.error && <StatusBanner variant="error">{start.error.message}<SyncBusyLink error={start.error} /></StatusBanner>}
    <Button disabled={!accountId || start.isPending}>{start.isPending ? "Starting…" : "Sync"}</Button>
  </form>;
}

const ordinal = (n: number) => `${n}${["th", "st", "nd", "rd"][n % 100 >= 11 && n % 100 <= 13 ? 0 : Math.min(n % 10, 4) % 4]}`;
export const queueText = (position: number, eta?: number | null) =>
  `${ordinal(position)} in line${eta ? `, about ${formatSeconds(eta)}` : ""}`;

type Progress = { phase?: string | null; page?: number | null; orders?: number; details?: number; percent?: number | null };

export function SyncProgress({ job }: { job: SyncJob }) {
  const p = (job.progress ?? {}) as Progress;
  const percent = typeof p.percent === "number" ? p.percent : null;
  return <div className="space-y-1">
    <div role="progressbar" aria-label="Sync progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent ?? undefined} aria-valuetext={percent === null ? "In progress" : `${percent}%`} className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div className={`h-full bg-primary ${percent === null ? "w-1/3 animate-pulse" : ""}`} style={percent === null ? undefined : { width: `${percent}%` }} />
    </div>
    <p className="text-sm text-muted-foreground">
      {p.page ? `${p.page} pages fetched` : "Starting"}{p.orders ? ` · ${p.details ?? 0} of ${p.orders} bills downloaded` : ""}
      {job.eta_seconds != null && job.status === "running" ? ` · about ${formatSeconds(job.eta_seconds)} left` : ""}
    </p>
  </div>;
}

export function SyncJobScreen({ jobId }: { jobId: string }) {
  const client = useQueryClient();
  const key = ["access", "sync", jobId];
  const query = useQuery({ queryKey: key, queryFn: () => syncApi.get(jobId), refetchInterval: q => q.state.data && isSyncActive(q.state.data) ? 2000 : false });
  const action = useMutation({
    mutationFn: async (kind: "cancel" | "pause" | "resume" | "partial" | "discard" | "retryImport") => {
      if (kind === "partial") {
        await syncApi.usePartial(jobId);
      } else if (kind === "discard") {
        client.setQueryData(key, await syncApi.discardPartial(jobId));
      } else {
        const job = await syncApi[kind](jobId);
        client.setQueryData(key, job);
      }
      await client.invalidateQueries({ queryKey: ["access", "sync"] });
      await client.invalidateQueries({ queryKey: ["accounts"] });
    },
  });
  const job = query.data;
  const retryable = job && job.status === "failed" && !job.import_pending;
  return <section className="space-y-4" aria-label="Sync progress" aria-busy={query.isLoading}>
    {query.error && <StatusBanner variant="error">{query.error.message}<Button variant="link" onClick={() => void query.refetch()}>Retry</Button></StatusBanner>}
    {!job && query.isLoading && <p role="status">Loading sync…</p>}
    {job && <>
      <div role="status"><h2 className="font-semibold capitalize">{job.provider} · {jobLabel(job.status)}</h2><p>Phase: {job.phase ?? "Waiting"}</p>{job.status === "queued" && job.queue_position != null && <p>{queueText(job.queue_position, job.eta_seconds)}</p>}
        <dl>{Object.entries(job.counts ?? {}).filter(([, value]) => typeof value === "number").map(([label, value]) => <div key={label} className="flex gap-2"><dt>{label.replaceAll("_", " ")}:</dt><dd>{String(value)}</dd></div>)}</dl>
      </div>
      {(job.status === "running" || job.status === "paused") && <SyncProgress job={job} />}
      {job.error_message && <StatusBanner variant="warning">{job.error_message}</StatusBanner>}
      {isSyncActive(job) && <><p>You can leave this page; the sync continues in the background.</p><div className="flex flex-wrap gap-2">{job.status === "running" && <Button variant="outline" disabled={action.isPending} onClick={() => action.mutate("pause")}>Pause sync</Button>}<Button variant="outline" disabled={action.isPending} onClick={() => action.mutate("cancel")}>Cancel sync</Button></div></>}
      {job.status === "needs_code" && <><p>Your provider session expired. Verify the account again; this sync then resumes by itself.</p><VerifyAgain accountId={job.account_id} provider={job.provider} onDone={() => void query.refetch()} /></>}
      {["interrupted", "paused"].includes(job.status) && <><p>Log in again if needed, then resume this sync.</p><Link to={`/login?return=${encodeURIComponent(`/sync?job=${jobId}`)}`}>Log in again</Link><Button disabled={action.isPending} onClick={() => action.mutate("resume")}>Resume after login</Button></>}
      {retryable && <Button variant="outline" disabled={action.isPending} onClick={() => action.mutate("resume")}>Resume</Button>}
      {job.import_pending && <><StatusBanner variant="warning">Fetched, import failed</StatusBanner><Button disabled={action.isPending} onClick={() => action.mutate("retryImport")}>Retry import</Button></>}
      {["failed", "cancelled"].includes(job.status) && !job.import_pending && (job.partial_decision ?? "pending") === "pending" && <div className="space-y-3"><p>Use any orders fetched before the sync stopped, or leave them out of your dashboard.</p><div className="flex flex-wrap gap-2"><Button disabled={action.isPending} onClick={() => action.mutate("partial")}>Use partial data</Button><Button variant="outline" disabled={action.isPending} onClick={() => action.mutate("discard")}>Discard partial</Button></div></div>}
      {["failed", "cancelled"].includes(job.status) && job.partial_decision === "imported" && <StatusBanner>Partial data was imported into your dashboard.</StatusBanner>}
      {["failed", "cancelled"].includes(job.status) && job.partial_decision === "discarded" && <StatusBanner>Partial data discarded. Previously imported orders remain in your dashboard.</StatusBanner>}
      {job.status === "done" && <StatusBanner variant="success">Sync complete. Your dashboard is ready.</StatusBanner>}
    </>}
    {action.error && <StatusBanner variant="error">{action.error.message}</StatusBanner>}
    <Link className="underline" to="/jobs">All jobs</Link>
  </section>;
}

/** Header "Sync now": one account goes straight to its chooser; several get a picker and a sync-all button. */
export function SyncAccountPicker() {
  const accounts = useAccounts();
  const navigate = useNavigate();
  const all = useMutation({
    mutationFn: async () => {
      const failed: string[] = [];
      for (const a of (accounts.data ?? []).filter(a => !ACTIVE_STATUSES.includes(a.active_status ?? ""))) {
        try { await syncApi.create(a.local_id, "new", a.provider); } catch (e) { failed.push(`${a.provider} ${a.phone ?? ""}: ${e instanceof Error ? e.message : "failed"}`); }
      }
      return failed;
    },
    onSuccess: failed => { if (!failed.length) navigate("/jobs"); },
  });
  const list = accounts.data ?? [];
  if (accounts.isLoading) return <p role="status">Loading accounts…</p>;
  if (list.length === 1) return <Navigate replace to={`/sync?account=${encodeURIComponent(list[0].local_id)}&provider=${encodeURIComponent(list[0].provider)}`} />;
  if (!list.length) return <><p>No linked accounts yet.</p><Link className="underline" to="/accounts/link">Link an account</Link></>;
  return <div className="space-y-3">
    <p>Pick an account to sync, or fetch new orders for all of them.</p>
    <ul className="space-y-2">{list.map(a => <li key={`${a.local_id}:${a.provider}`}><Link className="flex min-h-[44px] items-center justify-between rounded-lg border p-3" to={`/sync?account=${encodeURIComponent(a.local_id)}&provider=${encodeURIComponent(a.provider)}`}><span className="capitalize">{a.provider} <span className="font-mono normal-case">{a.phone}</span></span><span className="text-sm text-muted-foreground">{a.order_count} orders</span></Link></li>)}</ul>
    <Button disabled={all.isPending} onClick={() => all.mutate()}>{all.isPending ? "Starting…" : "Sync all (new orders)"}</Button>
    {all.data?.length ? <StatusBanner variant="warning">{all.data.map(f => <p key={f}>{f}</p>)}</StatusBanner> : null}
    <Link className="block underline" to="/home">Back to Home</Link>
  </div>;
}

export default function Sync() {
  const [params, setParams] = useSearchParams();
  const jobId = params.get("job");
  const accountId = params.get("account");
  return <AuthShell title="Sync orders" subtitle="Fetch new orders from a linked account." back={{ to: "/home", label: "Accounts" }}>{jobId ? <SyncJobScreen key={jobId} jobId={jobId} /> : accountId ? <SyncChooser key={accountId + (params.get("provider") ?? "")} accountId={accountId} provider={params.get("provider") ?? undefined} onStarted={job => setParams({ job: job.id })} /> : <SyncAccountPicker />}</AuthShell>;
}
