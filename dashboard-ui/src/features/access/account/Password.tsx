import * as React from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { AuthShell, StatusBanner } from "../primitives";
import { ApiError, authApi } from "../api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Change password and log out all sessions; shared by the Settings page and the standalone password page. */
export function AccountSecurity() {
  const navigate = useNavigate();
  const client = useQueryClient();
  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [message, setMessage] = React.useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== confirm) return setMessage({ ok: false, text: "Passwords do not match." });
    setBusy(true);
    try {
      const res = await authApi.changePassword(current, next);
      client.setQueryData(["auth", "me"], res.user);
      setCurrent(""); setNext(""); setConfirm("");
      setMessage({ ok: true, text: "Password changed. Your other devices were signed out." });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof ApiError ? err.message : "Could not change the password." });
    } finally {
      setBusy(false);
    }
  };

  const signOutEverywhere = async () => {
    await authApi.logoutAll();
    client.clear();
    navigate("/login", { replace: true });
  };

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="space-y-4">
        {message && <StatusBanner variant={message.ok ? "success" : "error"}>{message.text}</StatusBanner>}
        <label className="block text-sm font-medium" htmlFor="pw-current">Current password</label>
        <Input id="pw-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        <label className="block text-sm font-medium" htmlFor="pw-new">New password</label>
        <p className="text-xs text-muted-foreground">At least 10 characters, not your username, and not a common password.</p>
        <Input id="pw-new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        <label className="block text-sm font-medium" htmlFor="pw-confirm">Confirm new password</label>
        <Input id="pw-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <Button type="submit" disabled={busy || !current || !next} className="w-full">{busy ? "Saving…" : "Change password"}</Button>
      </form>
      <Button variant="outline" className="w-full" onClick={() => void signOutEverywhere()}>Log out all sessions</Button>
    </div>
  );
}

export function Password() {
  return (
    <AuthShell title="Password" subtitle="Change your password or log out all sessions." back={{ to: "/home", label: "Accounts" }}>
      <AccountSecurity />
    </AuthShell>
  );
}

export default Password;
