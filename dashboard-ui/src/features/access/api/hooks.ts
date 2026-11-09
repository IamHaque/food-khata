import { useQuery } from "@tanstack/react-query";
import { authApi, ownerApi } from "./client";

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
