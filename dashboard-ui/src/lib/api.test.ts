import { afterEach, expect, it, vi } from "vitest";
import { slim, serializeParams } from "./api";
afterEach(() => vi.unstubAllGlobals());
it("serializes filters including all statuses", () => {
 expect(serializeParams({ statuses: [], platforms: ["a", "b"], verified_only: false, amount_min: 0, date_from: "2024-01-01" })).toBe("statuses=&platforms=a&platforms=b&verified_only=false&amount_min=0&date_from=2024-01-01");
 expect(serializeParams({ statuses: ["a", "b"] })).toBe("statuses=a&statuses=b");
});
it("validates responses and forwards cancellation", async () => {
 const signal = new AbortController().signal;
 const mock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ filters_applied: { veg: "all", day_type: "all", verified_only: false, compare: "none" }, generated_at: "now", rows: [] })));
 vi.stubGlobal("fetch", mock);
 expect((await slim({}, signal)).rows).toEqual([]);
 expect(mock.mock.calls[0][1].signal).toBe(signal);
 mock.mockResolvedValue(new Response('{}'));
 await expect(slim()).rejects.toThrow("Invalid API response");
});
it("does not expose error bodies", async () => {
 vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("secret", { status: 500 })));
 await expect(slim()).rejects.toThrow("Request failed (500)");
});

it('retains extended dashboard fields and rejects invalid nested numbers', async()=>{
 const {DashboardSchema}=await import('./response-schema');
 const {defaultFilters}=await import('./filters');
 const kpis={orders:0,valid_order_count:0,spend:0,aov:null,total_discount:0,reported_savings:0,discount_rate:null,reported_savings_rate:null,fees:0,fee_percentage:null,tax:0,tips:0,refunds:0,unique_restaurants:0,unique_dishes:0,average_rating:null};
 const data={filters_applied:defaultFilters(),generated_at:'now',kpis,data_complete:true,comparison:null,
 charts:{food:{cuisines:[],diet:[],loyalty:[],new_repeat:[],cuisine_unavailable_reason:null,diet_unavailable_reason:null,orders_without_dates:0},spending:{daily:[],years:[],fee_scatter:[],unallocated_spend:0},kpi_history:[],waterfall_steps:[],places:{labels:[],distances:[],distance_unavailable_reason:null,unsupported_reason:'Maps are not supported.'},behavior:{timing_unavailable_reason:null,date_unavailable_reason:null,hour_weekday:[],meals:[],day_type:[],aov_histogram:[],gaps:[],longest_streak:null,longest_gap:null,orders_per_week:null},monthly:[],calendar:[{date:'2025-01-01',orders:1,spend:2}],cost_waterfall:{subtotal:0,food_discount:0,net_delivery:0,packaging:0,platform:0,tax:0,tip:0,other:0,residual:0,provider_paid:0,refunds:0},top_restaurants:[],top_dishes:[],platforms:[],monthly_fee_components:[],insights:[]}};
 expect(DashboardSchema.parse(data).charts.calendar[0].spend).toBe(2);
 expect(DashboardSchema.parse(data).comparison).toBe(null);
 expect(DashboardSchema.safeParse({...data,charts:{...data.charts,calendar:[{date:'2025-01-01',orders:1,spend:'bad'}]}}).success).toBe(false);
});
