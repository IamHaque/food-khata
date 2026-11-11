import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import * as api from "../lib/api";
import { pollInterval } from "../lib/api";
import { syncApi } from "../features/access/sync/api";
import { calculateComparisonDates } from "../lib/filters";

export { calculateComparisonDates };

export const useMetadata = (filters: api.Filters = {}) => useQuery({ queryKey: ["metadata", filters], queryFn: ({ signal }) => api.metadata(filters, signal), placeholderData: keepPreviousData, refetchOnWindowFocus: false });
export const useHealth = (filters: api.Filters = {}) => useQuery({ queryKey: ["health", filters], queryFn: ({ signal }) => api.health(filters, signal), placeholderData: keepPreviousData, refetchOnWindowFocus: false });
export const useDashboard = (filters: api.DashboardFilters) => useQuery({ queryKey: ["dashboard", filters], queryFn: ({ signal }) => api.dashboard(filters, signal), placeholderData: keepPreviousData, refetchOnWindowFocus: false });

export const useDashboardCompare = (filters: api.DashboardFilters) => {
  const compDates = calculateComparisonDates(filters);
  const isEnabled = filters.compare !== "none" && compDates !== null;
  const shiftedFilters: api.DashboardFilters = compDates
    ? {
        ...filters,
        date_from: compDates.date_from,
        date_to: compDates.date_to,
        compare: "none",
      }
    : filters;

  return useQuery({
    queryKey: ["dashboard", "compare", shiftedFilters],
    queryFn: ({ signal }) => api.dashboard(shiftedFilters, signal),
    enabled: isEnabled,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
  });
};

export const useOrders = (params: api.OrdersParams = {}) => useQuery({ queryKey: ["orders", params], queryFn: ({ signal }) => api.orders(params, signal), placeholderData: keepPreviousData, refetchOnWindowFocus: false });
export const useBill = (id: string | undefined, filters: api.Filters = {}) => useQuery({ queryKey: ["bill", id, filters], queryFn: ({ signal }) => api.bill(id ?? "", filters, signal), enabled: !!id, placeholderData: keepPreviousData, refetchOnWindowFocus: false });
export const useRestaurants = (params: api.RestaurantsParams = {}) => useQuery({ queryKey: ["restaurants", params], queryFn: ({ signal }) => api.restaurants(params, signal), placeholderData: keepPreviousData, refetchOnWindowFocus: false });
export const useItems = (params: api.ItemsParams = {}) => useQuery({ queryKey: ["items", params], queryFn: ({ signal }) => api.items(params, signal), placeholderData: keepPreviousData, refetchOnWindowFocus: false });
export const useSlim = (filters: api.Filters = {}) => useQuery({ queryKey: ["slim", filters], queryFn: ({ signal }) => api.slim(filters, signal), placeholderData: keepPreviousData, refetchOnWindowFocus: false });


export { pollInterval };

export function useSyncJobs() {
  const [hidden, setHidden] = useState<boolean>(typeof document !== "undefined" ? document.hidden : false);
  const query = useQuery({
    queryKey: ["access", "sync", "list"],
    queryFn: () => syncApi.list(),
    retry: false,
    refetchOnWindowFocus: false,
    refetchInterval: (q: any) => pollInterval(q?.state?.data, hidden),
  });
  const refetch = query.refetch;
  useEffect(() => {
    if (typeof document === "undefined") return;
    const handler = () => {
      const nowHidden = document.hidden;
      setHidden(nowHidden);
      if (!nowHidden) void refetch();
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [refetch]);
  return query;
}
