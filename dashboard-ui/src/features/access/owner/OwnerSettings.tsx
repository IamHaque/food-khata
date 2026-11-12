import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { components } from "@/types/api";
import { authApi, request } from "../api";


type WindowStatus = components["schemas"]["WindowStatusResponse"];
type OwnerStatus = components["schemas"]["OwnerStatusResponse"];
type User = components["schemas"]["food_khata__serve__routes_owner__UserResponse"];

export function OwnerSettings() {
  const auth = useQuery({ queryKey: ["auth", "me"], queryFn: () => authApi.me(), retry: false, staleTime: 60_000 });
  if (auth.isLoading) return <p className="p-6">Loading…</p>;
  if (!auth.data) return <Navigate to="/login" replace />;
  if (!auth.data.is_owner) return <p className="p-6" role="alert">Owner access required.</p>;
  return <main className="mx-auto max-w-4xl p-4 sm:p-6"><Card className="space-y-6 p-5 sm:p-6"><OwnerControls /></Card></main>;
}

type Action = "reset" | "remove" | "transfer";
const ACTION_TEXT: Record<Action, { title: (name: string) => string; body: string; confirm: string }> = {
  reset: { title: n => `Reset password for ${n}?`, body: "This wipes the user's provider sessions and cancels their jobs. They will need to re-link their providers.", confirm: "Confirm reset" },
  remove: { title: n => `Remove ${n}?`, body: "This deletes the user and all of their saved orders, sessions and jobs. It cannot be undone.", confirm: "Remove user" },
  transfer: { title: n => `Make ${n} the owner?`, body: "You become a regular user and lose owner controls. Only the new owner can transfer it back.", confirm: "Transfer ownership" },
};

export function OwnerControls() {
  const queryClient = useQueryClient();
  const status = useQuery({ queryKey: ["owner", "status"], queryFn: () => request<OwnerStatus>("/api/owner/status"), retry: false });
  const audit = useQuery({ queryKey: ["owner", "audit"], queryFn: () => request<{ rows: { at: number; actor: string | null; action: string; target: string | null; ip: string | null }[] }>("/api/owner/audit"), retry: false });
  const users = useQuery({ queryKey: ["owner", "users"], queryFn: () => request<User[]>("/api/owner/users"), retry: false });
  const [deadline, setDeadline] = React.useState<number | null>(null);
  const [now, setNow] = React.useState(Date.now());
  const [code, setCode] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [target, setTarget] = React.useState<{ user: User; action: Action } | null>(null);
  const [password, setPassword] = React.useState("");
  const [temporaryPassword, setTemporaryPassword] = React.useState("");

  React.useEffect(() => {
    const remaining = status.data?.window.remaining_seconds;
    setDeadline(remaining != null ? Date.now() + remaining * 1000 : null);
  }, [status.data, status.dataUpdatedAt]);
  React.useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  async function run(action: () => Promise<void>) {
    setBusy(true); setError(""); setNotice("");
    try { await action(); } catch (err) { setError(err instanceof Error ? err.message : "Something went wrong."); }
    finally { setBusy(false); }
  }
  async function windowAction(duration?: number | null) {
    await run(async () => {
      await request<WindowStatus>("/api/owner/window", { method: "POST", body: duration === undefined ? { action: "close" } : { action: "open", duration_seconds: duration } });
      await status.refetch();
    });
  }
  const seconds = deadline === null ? null : Math.max(0, Math.ceil((deadline - now) / 1000));
  const windowText = !status.data?.window.is_open || seconds === 0 ? "Closed" : status.data.window.until_closed ? "Open until closed" : seconds === null ? "Open" : `Time left: ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  return <>
    <h2 className="text-xl font-semibold">Owner settings</h2>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {(status.isLoading || users.isLoading) && <p>Loading settings…</p>}
    {(status.isError || users.isError) && <p role="alert">Could not load owner settings. Refresh to retry.</p>}
    <section className="space-y-3"><h2 className="text-lg font-semibold">Registration window</h2>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={busy} onClick={() => void windowAction(900)}>15 min</Button>
        <Button variant="outline" disabled={busy} onClick={() => void windowAction(3600)}>1 hour</Button>
        <Button variant="outline" disabled={busy} onClick={() => void windowAction(null)}>Until closed</Button>
        <Button variant="destructive" disabled={busy} onClick={() => void windowAction()}>Close</Button>
      </div><p className="text-sm text-muted-foreground">{status.data ? windowText : "Window status unavailable"}</p>
    </section>
    <section className="space-y-3"><h2 className="text-lg font-semibold">Household join code</h2>
      <p className="text-sm text-muted-foreground">The existing code cannot be retrieved. Rotate to reveal a new code. Rotating makes the old code stop working.</p>
      <div className="flex flex-wrap items-center gap-2">{code && <code className="rounded border px-3 py-2">{code}</code>}
        {code && <Button variant="outline" onClick={() => void run(async () => { await navigator.clipboard.writeText(code); setNotice("Join code copied."); })}>Copy</Button>}
        <Button variant="outline" disabled={busy} onClick={() => void run(async () => { setCode(""); const result = await request<{ join_code: string }>("/api/owner/join-code/rotate", { method: "POST" }); setCode(result.join_code); })}>Rotate and reveal</Button>
      </div><p className="text-sm text-muted-foreground">The new code is shown only here until you leave this screen.</p>
    </section>
    <section className="space-y-3"><h2 className="text-lg font-semibold">Users</h2>
      <div className="space-y-3">{users.data?.map(user => <div key={user.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-3">
        <div><strong>{user.username}</strong>{" "}<span className="ml-2 text-sm text-muted-foreground">{user.is_owner ? "owner" : user.disabled ? "disabled" : "active"}</span></div>
        {!user.is_owner && <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={() => void run(async () => { await request(`/api/owner/users/${encodeURIComponent(user.id)}/disable`, { method: "POST", body: { disabled: !user.disabled } }); await users.refetch(); })}>{user.disabled ? "Enable" : "Disable"}</Button>
          <Button variant="outline" disabled={busy} onClick={() => { setPassword(""); setTarget({ user, action: "reset" }); }}>Reset password</Button>
          {!user.disabled && <Button variant="outline" disabled={busy} onClick={() => { setPassword(""); setTarget({ user, action: "transfer" }); }}>Transfer ownership</Button>}
          <Button variant="destructive" disabled={busy} onClick={() => { setPassword(""); setTarget({ user, action: "remove" }); }}>Remove</Button></div>}
      </div>)}</div>
    </section>
    <section className="space-y-3"><h2 className="text-lg font-semibold">Audit trail</h2>
      <p className="text-sm text-muted-foreground">The last 200 logins and admin actions. No passwords, codes or phone numbers are kept.</p>
      <div className="max-h-64 overflow-auto rounded border text-xs"><table className="w-full"><tbody>{audit.data?.rows.map((row, i) => <tr key={i} className="border-b"><td className="p-1">{new Date(row.at * 1000).toLocaleString()}</td><td className="p-1">{row.action}</td><td className="p-1">{row.target ?? ""}</td><td className="p-1">{row.ip ?? ""}</td></tr>)}</tbody></table></div>
    </section>
    {temporaryPassword && <div role="status" className="rounded border p-3"><p>Temporary password (shown once): <strong>{temporaryPassword}</strong></p><p className="text-sm text-muted-foreground">Share it securely with the user.</p><Button variant="ghost" onClick={() => setTemporaryPassword("")}>Dismiss</Button></div>}
    <Dialog open={!!target} onOpenChange={open => { if (!open && !busy) { setTarget(null); setPassword(""); } }}><DialogContent>
      {target && <><DialogHeader><DialogTitle>{ACTION_TEXT[target.action].title(target.user.username)}</DialogTitle><DialogDescription>{ACTION_TEXT[target.action].body}</DialogDescription></DialogHeader>
      <form className="space-y-4" onSubmit={event => { event.preventDefault(); const { user, action } = target; void run(async () => {
        const base = "/api/owner/users/" + encodeURIComponent(user.id);
        if (action === "reset") { const result = await request<{ temporary_password: string | null }>(`${base}/reset-password`, { method: "POST", body: { owner_password: password } }); setTemporaryPassword(result.temporary_password ?? ""); setNotice("Password reset."); }
        else if (action === "remove") { await request(`${base}/remove`, { method: "POST", body: { owner_password: password } }); await users.refetch(); setNotice("User removed."); }
        else { await request("/api/owner/transfer", { method: "POST", body: { owner_password: password, to_user_id: user.id } }); await queryClient.invalidateQueries({ queryKey: ["auth", "me"] }); setNotice("Ownership transferred."); }
        setPassword(""); setTarget(null); }); }}>
        <label htmlFor="owner-password" className="block text-sm font-medium">Owner password</label><Input id="owner-password" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} />
        {error && <p role="alert" className="text-destructive">{error}</p>}
        <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={() => { setTarget(null); setPassword(""); }}>Cancel</Button><Button type="submit" variant="destructive" disabled={busy || !password}>{ACTION_TEXT[target.action].confirm}</Button></DialogFooter>
      </form></>}
    </DialogContent></Dialog>
  </>;
}

export default OwnerSettings;
