import type { operations, components } from "../types/api";
import { z } from "zod";
import { authApi, getCsrfToken } from "../features/access/api";
import { FilterOptionsSchema, DashboardSchema, HealthSchema, OrdersSchema, BillSchema, LeadersSchema, SlimSchema } from "./response-schema";
export type Filters = NonNullable<operations["data_health_api_meta_data_health_get"]["parameters"]["query"]>;
export type OrdersParams = NonNullable<operations["orders_api_orders_get"]["parameters"]["query"]>;
export type RestaurantsParams = NonNullable<operations["restaurants_api_restaurants_get"]["parameters"]["query"]>;
export type ItemsParams = NonNullable<operations["items_api_items_get"]["parameters"]["query"]>;
export type DashboardFilters = components["schemas"]["Filters"];
export class ApiError extends Error { constructor(public readonly status: number, message: string) { super(message); this.name = "ApiError"; } }
export function serializeParams(params: Filters | OrdersParams | RestaurantsParams | ItemsParams): string {
 const query = new URLSearchParams();
 for (const [key, value] of Object.entries(params)) {
  if (value == null) continue;
  if (Array.isArray(value)) { if (key === "statuses" && !value.length) query.append(key, ""); for (const item of value) query.append(key, String(item)); }
  else query.append(key, String(value));
 }
 return query.toString();
}
async function request<T>(path: string, schema: z.ZodType<T>, signal?: AbortSignal, body?: DashboardFilters): Promise<T> {
 if (body !== undefined && !getCsrfToken()) await authApi.csrf();
 const response = await fetch(path, { signal, ...(body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json", "x-csrf-token": getCsrfToken() ?? "" }, body: JSON.stringify(body) }) });
 if (!response.ok) throw new ApiError(response.status, `Request failed (${response.status})`);
 let data: unknown;
 try { data = await response.json(); } catch { throw new ApiError(response.status, "Invalid API response"); }
 const result = schema.safeParse(data);
 if (!result.success) throw new ApiError(response.status, "Invalid API response");
 return result.data;
}
const url = (path: string, params: Filters | OrdersParams | RestaurantsParams | ItemsParams) => { const q = serializeParams(params); return q ? `${path}?${q}` : path; };
export const metadata = (filters: Filters = {}, signal?: AbortSignal) => request(url("/api/meta/filters", filters), FilterOptionsSchema, signal);
export const health = (filters: Filters = {}, signal?: AbortSignal) => request(url("/api/meta/data-health", filters), HealthSchema, signal);
export const dashboard = (filters: DashboardFilters, signal?: AbortSignal) => request("/api/dashboard", DashboardSchema, signal, filters);
export const orders = (params: OrdersParams = {}, signal?: AbortSignal) => request(url("/api/orders", params), OrdersSchema, signal);
export const bill = (id: string, filters: Filters = {}, signal?: AbortSignal) => request(url(`/api/orders/${encodeURIComponent(id)}/bill`, filters), BillSchema, signal);
export const restaurants = (params: RestaurantsParams = {}, signal?: AbortSignal) => request(url("/api/restaurants", params), LeadersSchema, signal);
export const items = (params: ItemsParams = {}, signal?: AbortSignal) => request(url("/api/items", params), LeadersSchema, signal);
export const slim = (filters: Filters = {}, signal?: AbortSignal) => request(url("/api/orders/slim", filters), SlimSchema, signal);

export function pollInterval(jobs: { status: string }[] | null | undefined, hidden: boolean): number | false {
  if (hidden) return false;
  const list = jobs ?? [];
  return list.some(job => ["queued", "running", "paused", "needs_code"].includes(job.status)) ? 3000 : 30000;
}
