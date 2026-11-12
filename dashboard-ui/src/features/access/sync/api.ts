import { request } from "../api/client";
import type { components } from "../../../types/api";

export type SyncJob = components["schemas"]["SyncJobResponse"];
export type SyncEvent = components["schemas"]["JobEventOut"];
export type SyncMode = "new" | "all" | "missing";
const path = (id: string) => `/api/sync/jobs/${encodeURIComponent(id)}`;
export const syncApi = {
  list: (params: { account_id?: string; status?: string; limit?: number; offset?: number } = {}) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]));
    return request<SyncJob[]>(`/api/sync/jobs${q.size ? `?${q}` : ""}`);
  },
  events: (id: string) => request<SyncEvent[]>(`${path(id)}/events?limit=200`),
  pause: (id: string) => request<SyncJob>(`${path(id)}/pause`, { method: "POST" }),
  get: (id: string) => request<SyncJob>(path(id)),
  create: (account_id: string, mode: SyncMode, provider?: string) => request<SyncJob>("/api/sync/jobs", { method: "POST", body: { account_id, mode, provider } }),
  cancel: (id: string) => request<SyncJob>(`${path(id)}/cancel`, { method: "POST" }),
  retryImport: (id: string) => request<SyncJob>(`${path(id)}/retry-import`, { method: "POST" }),
  resume: (id: string) => request<SyncJob>(`${path(id)}/resume`, { method: "POST" }),
  usePartial: (id: string) => request<components["schemas"]["UsePartialResponse"]>(`${path(id)}/use-partial`, { method: "POST" }),
  discardPartial: (id: string) => request<SyncJob>(`${path(id)}/discard-partial`, { method: "POST" }),
};

export const ACTIVE_STATUSES = ["queued", "running", "paused", "needs_code"];
export const isSyncActive = (job: SyncJob) => ACTIVE_STATUSES.includes(job.status);
export const SYNC_LOGOUT_WARNING = "Your sync continues after logout. A server restart would interrupt it.";

export const jobLabel = (status: string) => (status === "needs_code" ? "needs verification" : status.replaceAll("_", " "));
export const formatSeconds = (s: number) => (s >= 90 ? `${Math.round(s / 60)} minutes` : `${s} seconds`);
export const formatWhen = (t?: number | null) => (t ? new Date(t * 1000).toLocaleString() : "—");
export const MODE_LABEL: Record<string, string> = { incremental: "New orders", full: "All history", repair: "Missing bill details" };
