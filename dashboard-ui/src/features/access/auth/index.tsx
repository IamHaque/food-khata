import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { ApiError, authApi, setCsrfToken, setUnauthorizedHandler } from "../api";
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

const ACCESS_PAGES = ["/login", "/welcome", "/setup", "/register"];

// Any 401 from the API sends the user to /login once, through the router (no page reload).
function useSessionExpiry() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const location = useLocation();
  const path = React.useRef(location.pathname + location.search);
  path.current = location.pathname + location.search;
  React.useEffect(() => {
    setUnauthorizedHandler(() => {
      if (ACCESS_PAGES.some((p) => path.current.startsWith(p))) return;
      qc.clear();
      navigate(`/login?return=${encodeURIComponent(path.current)}&reason=expired`, { replace: true });
    });
    return () => setUnauthorizedHandler(null);
  }, [navigate, qc]);
}

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { data, isLoading, isError, error } = useAuth();
  const location = useLocation();
  useSessionExpiry();
  if (isLoading) return null;
  if (isError || !data) {
    const returnTo = location.pathname + location.search;
    const expired = error instanceof ApiError && error.code === "SESSION_EXPIRED" ? "&reason=expired" : "";
    return <Navigate to={`/login?return=${encodeURIComponent(returnTo)}${expired}`} replace />;
  }
  return <>{children}</>;
}

// Login, welcome and register skip straight to the landing page when a session is already valid.
export function RedirectIfAuthed({ children }: { children: React.ReactNode }) {
  const { data, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading) return null;
  if (data) return <Navigate to={safeReturnPath(new URLSearchParams(location.search).get("return") || "/home")} replace />;
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
    if (url.origin !== window.location.origin || !value.startsWith('/') || value.startsWith('//')) return '/home';
    // Ids in filters belong to the previous user; keep every other parameter.
    ['account_ids', 'restaurant_ids'].forEach((k) => url.searchParams.delete(k));
    return url.pathname + url.search;
  } catch {
    return '/home';
  }
}
