import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { authApi } from "../api";
import { queryClient } from "../../app/providers";

export function useAuth() {
  return useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => authApi.me(),
    retry: false,
    staleTime: 60_000,
  });
}

export function isAuthenticated(): boolean {
  // best-effort synchronous check; prefer useAuth in components
  try {
    return Boolean(localStorage.getItem("access_token"));
  } catch {
    return false;
  }
}

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { data, isLoading, isError } = useAuth();
  const location = useLocation();
  if (isLoading) return null;
  if (isError || !data) {
    const returnTo = location.pathname + location.search;
    return <Navigate to={`/login?return=${encodeURIComponent(returnTo)}`} replace />;
  }
  return <>{children}</>;
}

export function AuthGuard(props: { children: React.ReactNode }) {
  return <RequireAuth {...props} />;
}

export function ProtectedRoute(props: { children: React.ReactNode }) {
  return <RequireAuth {...props} />;
}

export async function logout() {
  try {
    await authApi.logout();
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem("access_token");
  } catch {
    /* ignore */
  }
  try {
    queryClient.clear();
  } catch {
    /* ignore */
  }
}

export function useLogout() {
  const qc = useQueryClient();
  return async () => {
    await logout();
    qc.clear();
  };
}
