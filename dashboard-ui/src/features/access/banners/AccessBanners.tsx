import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { userStorageKey } from "../../../lib/user-storage";
import { useAccounts } from "../api";
import { isSyncActive } from "../sync/api";
import { useSyncJobs } from "../../../hooks/api";
export { pollInterval } from "../../../lib/api";
export { useSyncJobs } from "../../../hooks/api";

export function AccessBanners() {
  const accounts = useAccounts();
  const client = useQueryClient();
  const previous = useRef<Record<string, string>>({});
  const [dismissed, setDismissed] = useState("");
  const initialCutoff = useRef(Date.now() / 1000 - 300);
  const jobs = useSyncJobs();
  useEffect(() => {
    if (!jobs.data) return;
    const finished = jobs.data.some(job => job.status === "done" && previous.current[job.id] && previous.current[job.id] !== "done");
    previous.current = Object.fromEntries(jobs.data.map(job => [job.id, job.status]));
    if (finished) for (const key of ["accounts", "metadata", "health", "dashboard", "orders", "restaurants", "items", "slim"]) void client.invalidateQueries({ queryKey: [key] });
  }, [client, jobs.data]);
  if (!accounts.data) return null;
  if (!accounts.data.length) return <p role="status" className="rounded-lg border p-3 text-sm">No linked accounts yet. <Link className="underline" to="/home">Go to Home to link an account</Link>.</p>;
  const active = jobs.data?.find(job => job.status === "needs_code" || job.status === "paused") ?? jobs.data?.find(isSyncActive);
  const latest = jobs.data?.filter(job => job.finished_at != null).sort((a, b) => (b.finished_at ?? 0) - (a.finished_at ?? 0))[0];
  const marker = latest ? `${latest.finished_at}:${latest.id}` : "";
  const storageKey = userStorageKey("sync-completion");
  let acknowledged = { time: initialCutoff.current, id: "" };
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) acknowledged = JSON.parse(saved);
    else localStorage.setItem(storageKey, JSON.stringify(acknowledged));
  } catch { /* storage may be unavailable */ }
  // shortcut: the first visit ignores completions older than five minutes; upgrade when the server tracks acknowledgements.
  const time = latest?.finished_at ?? 0;
  const done = latest?.status === "done" && (time > acknowledged.time || (time === acknowledged.time && latest.id !== acknowledged.id)) && marker !== dismissed ? latest : undefined;
  const job = active ?? done;
  if (!job) return null;
  const noData = accounts.data.every(account => account.order_count === 0);
  const message = job.status === "running" ? (noData ? "Fetching your first orders." : "Syncing orders in the background.")
    : job.status === "queued" ? "Sync queued and waiting to start."
    : job.status === "needs_code" ? "Sync needs your verification code."
    : job.status === "paused" ? "Sync paused and needs your attention."
    : "Sync complete. Your dashboard is ready.";
  const counts = Object.entries(job.counts ?? {}).filter(([, value]) => typeof value === "number").map(([label, value]) => `${label.replaceAll("_", " ")}: ${value}`).join(", ");
  return <p role="status" className="rounded-lg border p-3 text-sm">{message} {counts && <span>{counts}. </span>}<Link className="underline" to={`/sync?job=${encodeURIComponent(job.id)}`}>View sync</Link>{done && !active && <> <button className="underline" onClick={() => { try { localStorage.setItem(storageKey, JSON.stringify({ time, id: job.id })); } catch { /* storage may be unavailable */ } setDismissed(marker); }}>Dismiss</button></>}</p>;
}
