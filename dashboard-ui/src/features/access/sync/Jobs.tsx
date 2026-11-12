import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { Button } from "../../../components/ui/button";
import { AppPage, StatusBanner } from "../primitives";
import { useAccounts } from "../api";
import { MODE_LABEL, formatWhen, isSyncActive, syncApi, type SyncEvent, type SyncJob } from "./api";
import { StatusBadge } from "./StatusBadge";
import { SyncJobScreen } from "./Sync";
import { pluralize } from "../../../lib/format";

const PAGE = 20;
const STATUSES = ["queued", "running", "paused", "needs_code", "failed", "interrupted", "cancelled", "done"];

const counts = (job: SyncJob) => {
  const c = (job.counts ?? {}) as Record<string, unknown>;
  return typeof c.orders === "number" ? `${pluralize(c.orders, "order")} · ${pluralize(Number(c.details ?? 0), "bill")}` : "—";
};

export function JobsList() {
  const [status, setStatus] = React.useState("");
  const [offset, setOffset] = React.useState(0);
  const accounts = useAccounts();
  const jobs = useQuery({
    queryKey: ["access", "sync", "jobs", status, offset],
    queryFn: () => syncApi.list({ status: status || undefined, limit: PAGE + 1, offset }), // one extra row tells whether a next page exists
    retry: false,
    refetchInterval: q => (q.state.data?.some(isSyncActive) ? 3000 : false),
  });
  const rows = (jobs.data ?? []).slice(0, PAGE);
  const label = (job: SyncJob) => { const a = accounts.data?.find(x => x.local_id === job.account_id && x.provider === job.provider); return a?.phone ?? "Account"; };
  return <div className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div><label htmlFor="jobs-status" className="block text-sm font-medium">Status</label>
        <select id="jobs-status" className="min-h-[44px] rounded-md border bg-background px-2 text-sm" value={status} onChange={e => { setStatus(e.target.value); setOffset(0); }}>
          <option value="">All</option>{STATUSES.map(s => <option key={s} value={s}>{s.replaceAll("_", " ")}</option>)}
        </select></div>
      <Link className="underline" to="/sync">Sync now</Link>
    </div>
    {jobs.error && <StatusBanner variant="error">{jobs.error.message}</StatusBanner>}
    {jobs.isLoading && <p role="status">Loading jobs…</p>}
    {!jobs.isLoading && !rows.length && <p className="text-sm text-muted-foreground">No jobs yet.</p>}
    <ul className="space-y-2">{rows.map(job => <li key={job.id}>
      <Link to={`/jobs/${encodeURIComponent(job.id)}`} className="block min-h-[44px] rounded-lg border p-3 hover:bg-accent">
        <span className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium capitalize">{job.provider} <span className="font-mono normal-case">{label(job)}</span></span><StatusBadge status={job.status} /></span>
        <span className="mt-1 block text-sm text-muted-foreground">{MODE_LABEL[job.mode] ?? job.mode} · started {formatWhen(job.started_at ?? job.created_at)} · finished {formatWhen(job.finished_at)} · {counts(job)}</span>
      </Link></li>)}</ul>
    <div className="flex items-center gap-2">
      <Button variant="outline" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>Previous</Button>
      <Button variant="outline" disabled={(jobs.data?.length ?? 0) <= PAGE} onClick={() => setOffset(offset + PAGE)}>Next</Button>
    </div>
  </div>;
}

export function JobTimeline({ jobId, active }: { jobId: string; active: boolean }) {
  const events = useQuery({ queryKey: ["access", "sync", jobId, "events"], queryFn: () => syncApi.events(jobId), retry: false, refetchInterval: active ? 3000 : false });
  const rows: SyncEvent[] = events.data ?? []; // shortcut: the API returns the first 200 events; add a cursor if long jobs need the tail
  return <section aria-label="Event timeline" className="space-y-2">
    <h3 className="font-semibold">Timeline</h3>
    {!rows.length && <p className="text-sm text-muted-foreground">No events yet.</p>}
    <ol className="space-y-1 text-sm">{rows.map(ev => <li key={ev.id} className="flex flex-wrap gap-x-3 border-l-2 pl-3"><time className="text-muted-foreground">{formatWhen(ev.created_at)}</time><StatusBadge status={ev.status} /><span>{[ev.phase, ev.page != null ? `page ${ev.page}` : null, ev.message ?? ev.code].filter(Boolean).join(" · ")}</span></li>)}</ol>
  </section>;
}

export function JobDetail({ jobId }: { jobId: string }) {
  const job = useQuery({ queryKey: ["access", "sync", jobId], queryFn: () => syncApi.get(jobId), retry: false });
  return <div className="space-y-6"><SyncJobScreen jobId={jobId} /><JobTimeline jobId={jobId} active={job.data ? isSyncActive(job.data) : false} /></div>;
}

export default function Jobs() {
  const { jobId } = useParams();
  return <AppPage title={jobId ? "Sync job" : "Sync jobs"} back={jobId ? { to: "/jobs", label: "Jobs" } : undefined} wide>{jobId ? <JobDetail key={jobId} jobId={jobId} /> : <JobsList />}</AppPage>;
}
