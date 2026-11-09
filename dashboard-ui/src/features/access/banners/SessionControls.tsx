import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../../../components/ui/dialog";
import { useLogout } from "../auth";
import { isSyncActive, syncApi, type SyncJob } from "../sync/api";
import { SyncLogoutWarning } from "../sync/SyncLogoutWarning";

export function SessionControls() {
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
  return <div className="flex items-center gap-2 text-xs">
    <Link to="/home" className="underline">Home</Link>
    <button type="button" className="underline" disabled={busy} onClick={() => void start()}>Log out</button>
    {error && <span role="alert">{error}</span>}
    <Dialog open={jobs !== null} onOpenChange={open => { if (!open) setJobs(null); }}><DialogContent>
      <DialogTitle>Log out while syncing?</DialogTitle><DialogDescription>The sync continues in the background.</DialogDescription>
      <SyncLogoutWarning jobs={jobs ?? []} />
      <div className="flex gap-2"><button type="button" className="rounded border p-2" onClick={() => setJobs(null)}>Stay signed in</button><button type="button" className="rounded border p-2" onClick={() => void finish()}>Log out</button></div>
    </DialogContent></Dialog>
  </div>;
}
