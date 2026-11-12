import { useQuery } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { authApi } from "../api";
import { AppPage } from "../primitives";
import { OwnerControls } from "../owner/OwnerSettings";
import { AccountSecurity } from "./Password";

export default function Settings() {
  const auth = useQuery({ queryKey: ["auth", "me"], queryFn: () => authApi.me(), retry: false, staleTime: 60_000 });
  if (auth.isLoading) return <p className="p-6">Loading…</p>;
  if (!auth.data) return <Navigate to="/login" replace />;
  return <AppPage title="Settings" wide>
    <Card className="space-y-4 p-5 sm:p-6">
      <section aria-labelledby="account-heading" className="max-w-md space-y-3"><h2 id="account-heading" className="text-xl font-semibold">Account</h2><p className="text-sm text-muted-foreground">Signed in as <strong>{auth.data.username}</strong>.</p><AccountSecurity /></section>
    </Card>
    {auth.data.is_owner && <Card className="space-y-6 p-5 sm:p-6"><OwnerControls /></Card>}
  </AppPage>;
}
