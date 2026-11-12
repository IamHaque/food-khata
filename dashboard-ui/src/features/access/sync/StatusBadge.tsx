import { jobLabel } from "./api";

const tone: Record<string, string> = {
  running: "border-primary/30 bg-primary/10 text-primary",
  done: "border-green-500/20 bg-green-500/10 text-green-700 dark:text-green-300",
  failed: "border-destructive/30 bg-destructive/10 text-destructive",
  queued: "border-border bg-muted text-muted-foreground",
  cancelled: "border-border bg-muted text-muted-foreground",
};
const attention = "border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200"; // needs_code, paused, interrupted

export function StatusBadge({ status }: { status: string }) {
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${tone[status] ?? attention}`}>{jobLabel(status)}</span>;
}
