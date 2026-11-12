import { useQuery } from "@tanstack/react-query";
import { authApi, ownerApi, accountsApi } from "./client";

export function useAccounts() {
  return useQuery({
    queryKey: ["accounts"],
    queryFn: () => accountsApi.list(),
    staleTime: 30_000,
    retry: false,
    refetchInterval: (q) => (q.state.data?.some((a) => a.active_status === "queued" || a.active_status === "running") ? 3000 : false),
  });
}

export function useSetupStatus() {
  return useQuery({
    queryKey: ["auth", "setup-status"],
    queryFn: () => authApi.setupStatus(),
    staleTime: 30_000,
    retry: false,
  });
}

export function useOwnerSetupCheck() {
  return useQuery({
    queryKey: ["owner", "setup-check"],
    queryFn: () => ownerApi.getSetup(),
    staleTime: 30_000,
    retry: false,
  });
}
