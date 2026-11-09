import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useAccounts } from "../api";
import { isSyncActive, syncApi } from "../sync/api";

export function AccessBanners() {
  const accounts = useAccounts();
  const client = useQueryClient();
  const previous = useRef<Record<string, string>>({});
  const jobs = useQuery({ queryKey: ["access", "sync", "list"], queryFn: syncApi.list, refetchInterval: 3000, retry: false });
  useEffect(() => {
    if (!jobs.data) return;
    const finished = jobs.data.some(job => job.status === "done" && previous.current[job.id] && previous.current[job.id] !== "done");
    previous.current = Object.fromEntries(jobs.data.map(job => [job.id, job.status]));
    if (finished) for (const key of ["accounts", "metadata", "health", "dashboard", "orders", "restaurants", "items", "slim"]) void client.invalidateQueries({ queryKey: [key] });
  }, [client, jobs.data]);
  if (!accounts.data) return null;
  if (!accounts.data.length) return <p role="status" className="rounded-lg border p-3 text-sm">No linked accounts yet. <Link className="underline" to="/home">Go to Home to link an account</Link>.</p>;
  const active = jobs.data?.find(isSyncActive);
  const done = jobs.data?.filter(job => job.status === "done").sort((a, b) => (b.finished_at ?? 0) - (a.finished_at ?? 0))[0];
  const noData = accounts.data.every(account => account.order_count === 0);
  const job = active ?? done;
  if (!job) return null;
  return <p role="status" className="rounded-lg border p-3 text-sm">{active ? (noData ? "Fetching your first orders." : "Syncing orders in the background.") : "Sync complete. Your dashboard is ready."} <Link className="underline" to={`/sync?job=${encodeURIComponent(job.id)}`}>View sync</Link></p>;
}
