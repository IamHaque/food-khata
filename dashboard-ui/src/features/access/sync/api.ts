import { request } from "../api/client";
import type { components } from "../../../types/api";

export type SyncJob = components["schemas"]["SyncJobResponse"];
export type SyncMode = "new" | "all" | "missing";
const path = (id: string) => `/api/sync/jobs/${encodeURIComponent(id)}`;
export const syncApi = {
  list: () => request<SyncJob[]>("/api/sync/jobs"),
  get: (id: string) => request<SyncJob>(path(id)),
  create: (account_id: string, mode: SyncMode) => request<SyncJob>("/api/sync/jobs", { method: "POST", body: { account_id, mode } }),
  cancel: (id: string) => request<SyncJob>(`${path(id)}/cancel`, { method: "POST" }),
  resume: (id: string) => request<SyncJob>(`${path(id)}/resume`, { method: "POST" }),
  code: (id: string, code: string) => request<SyncJob>(`${path(id)}/code`, { method: "POST", body: { code: code.trim() } }),
  usePartial: (id: string) => request<components["schemas"]["UsePartialResponse"]>(`${path(id)}/use-partial`, { method: "POST" }),
  discardPartial: (id: string) => request<SyncJob>(`${path(id)}/discard-partial`, { method: "POST" }),
};

export const isSyncActive = (job: SyncJob) => ["queued", "running", "paused", "needs_code"].includes(job.status);
export const SYNC_LOGOUT_WARNING = "Your sync continues after logout. A server restart would interrupt it.";
