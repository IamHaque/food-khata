import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../../../components/ui/dialog";
import { useLogout } from "../auth";
import { isSyncActive, syncApi, type SyncJob } from "../sync/api";
import { SyncLogoutWarning } from "../sync/SyncLogoutWarning";

export function SessionControls({ className = "", variant = "button" }: { className?: string; variant?: "button" | "menu" } = {}) {
  const [jobs, setJobs] = useState<SyncJob[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const logout = useLogout();
  const navigate = useNavigate();
  async function finish() { try { await logout(); navigate("/login", { replace: true }); } catch { setError("Could not log out. Please try again."); } }
  async function start() {
    setBusy(true); setError("");
    try {
      const current = await syncApi.list();
      if (current.some(isSyncActive)) setJobs(current);
      else await finish();
    } catch { setError("Could not check sync status. Please try again."); }
    finally { setBusy(false); }
  }
  const base = variant === "menu"
    ? "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-foreground hover:bg-accent min-h-[44px]"
    : "inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground min-h-[36px]";
  return <div className={`flex items-center gap-2 text-sm ${className}`}>
    <button type="button" className={base} disabled={busy} onClick={() => void start()}><LogOut className="h-4 w-4" aria-hidden="true" />Log out</button>
    {error && <span role="alert" className="text-destructive">{error}</span>}
    <Dialog open={jobs !== null} onOpenChange={open => { if (!open) setJobs(null); }}><DialogContent>
      <DialogTitle>Log out while syncing?</DialogTitle><DialogDescription>The sync continues in the background.</DialogDescription>
      <SyncLogoutWarning jobs={jobs ?? []} />
      <div className="flex gap-2"><button type="button" className="rounded-md border border-input px-3 py-2 text-sm min-h-[44px]" onClick={() => setJobs(null)}>Stay signed in</button><button type="button" className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground min-h-[44px]" onClick={() => void finish()}>Log out</button></div>
    </DialogContent></Dialog>
  </div>;
}
