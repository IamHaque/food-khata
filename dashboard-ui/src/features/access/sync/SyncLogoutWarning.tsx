import { StatusBanner } from "../primitives";
import { isSyncActive, SYNC_LOGOUT_WARNING, type SyncJob } from "./api";

export function SyncLogoutWarning({ jobs }: { jobs: SyncJob[] }) {
  return jobs.some(isSyncActive) ? <StatusBanner variant="warning">{SYNC_LOGOUT_WARNING}</StatusBanner> : null;
}
