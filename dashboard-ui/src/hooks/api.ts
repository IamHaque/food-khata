import { keepPreviousData, useQuery } from "@tanstack/react-query";
import * as api from "../lib/api";
import { calculateComparisonDates } from "../lib/filters";

export { calculateComparisonDates };

export const useMetadata = (filters: api.Filters = {}) => useQuery({ queryKey: ["metadata", filters], queryFn: ({ signal }) => api.metadata(filters, signal), placeholderData: keepPreviousData });
export const useHealth = (filters: api.Filters = {}) => useQuery({ queryKey: ["health", filters], queryFn: ({ signal }) => api.health(filters, signal), placeholderData: keepPreviousData });
export const useDashboard = (filters: api.DashboardFilters) => useQuery({ queryKey: ["dashboard", filters], queryFn: ({ signal }) => api.dashboard(filters, signal), placeholderData: keepPreviousData });

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
  });
};

export const useOrders = (params: api.OrdersParams = {}) => useQuery({ queryKey: ["orders", params], queryFn: ({ signal }) => api.orders(params, signal), placeholderData: keepPreviousData });
export const useBill = (id: string | undefined, filters: api.Filters = {}) => useQuery({ queryKey: ["bill", id, filters], queryFn: ({ signal }) => api.bill(id ?? "", filters, signal), enabled: !!id, placeholderData: keepPreviousData });
export const useRestaurants = (params: api.RestaurantsParams = {}) => useQuery({ queryKey: ["restaurants", params], queryFn: ({ signal }) => api.restaurants(params, signal), placeholderData: keepPreviousData });
export const useItems = (params: api.ItemsParams = {}) => useQuery({ queryKey: ["items", params], queryFn: ({ signal }) => api.items(params, signal), placeholderData: keepPreviousData });
export const useSlim = (filters: api.Filters = {}) => useQuery({ queryKey: ["slim", filters], queryFn: ({ signal }) => api.slim(filters, signal), placeholderData: keepPreviousData });

