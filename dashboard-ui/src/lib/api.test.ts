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
