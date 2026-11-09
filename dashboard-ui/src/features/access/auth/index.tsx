import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { authApi, setCsrfToken } from "../api";
import { queryClient } from "../../../app/providers";
import { clearCrossFilterHistory } from "../../../lib/crossfilter";

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

export function notifyAuthChange() {
  clearCrossFilterHistory();
  try { localStorage.setItem('food-khata-auth-change', `${Date.now()}-${Math.random()}`); } catch { /* storage may be unavailable */ }
}

export async function logout() {
  await authApi.logout();
  notifyAuthChange();
  try {
    localStorage.removeItem("access_token");
  } catch {
    /* ignore */
  }
  setCsrfToken(null);
  try {
    await queryClient.cancelQueries();
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

export function safeReturnPath(value: string): string {
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin || !value.startsWith('/') || value.startsWith('//')) return '/';
    return url.pathname;
  } catch {
    return '/';
  }
}
