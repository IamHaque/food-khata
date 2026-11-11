import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SyncChooser, SyncJobScreen, SyncLogoutWarning, queueText } from "./Sync";
import { syncApi, type SyncJob } from "./api";
import { setCsrfToken } from "../api/client";

const state = vi.hoisted(() => ({ data: undefined as unknown, error: null as Error | null, query: {} as any, mutation: {} as any, mutate: vi.fn(), set: vi.fn(), invalidate: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: unknown) => { state.query = options; return { data: state.data, error: state.error, refetch: vi.fn() }; },
  useMutation: (options: unknown) => { state.mutation = options; return { mutate: state.mutate, error: state.error, isPending: false }; },
  useQueryClient: () => ({ setQueryData: state.set, invalidateQueries: state.invalidate }),
}));
const job = (status: string): SyncJob => ({ id: "synthetic-job", user_id: "synthetic-user", account_id: "synthetic-account", provider: "swiggy", mode: "new", status, partial_decision: "pending", phase: "bills", counts: { orders: 12 }, import_pending: status === "import_failed" });
const html = (node: React.ReactNode) => renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>);
beforeEach(() => { vi.restoreAllMocks(); state.data = undefined; state.error = null; state.mutate.mockClear(); state.set.mockClear(); setCsrfToken("synthetic-csrf"); });

describe("sync screens", () => {
  it("defaults to new on every mount and explains all modes and time costs", async () => {
    const start = vi.spyOn(syncApi, "create").mockResolvedValue(job("queued"));
    const started = vi.fn();
    const output = html(<SyncChooser accountId="synthetic-account" onStarted={started} />);
    expect(output).toMatch(/checked="" value="new"/);
    for (const text of ["New orders", "All history", "Missing bill details", "20 minutes or more", "1,000 orders"]) expect(output).toContain(text);
    await state.mutation.mutationFn();
    expect(start).toHaveBeenCalledWith("synthetic-account", "new", undefined);
    state.mutation.onSuccess(job("queued"));
    expect(started).toHaveBeenCalledWith(job("queued"));
  });
  it("polls active jobs, shows counts and cancels through the API", async () => {
    state.data = job("running");
    const cancel = vi.spyOn(syncApi, "cancel").mockResolvedValue(job("cancelled"));
    const output = html(<SyncJobScreen jobId="synthetic-job" />);
    expect(output).toContain("Phase: bills"); expect(output).toContain("12"); expect(output).toContain("background"); expect(output).toContain("Cancel sync");
    expect(state.query.refetchInterval({ state: { data: job("running") } })).toBe(2000);
    expect(state.query.refetchInterval({ state: { data: job("done") } })).toBe(false);
    await state.mutation.mutationFn("cancel");
    expect(cancel).toHaveBeenCalledWith("synthetic-job");
    expect(state.set).toHaveBeenCalledWith(["access", "sync", "synthetic-job"], job("cancelled"));
  });
  it("shows Fetched, import failed with Retry import and never Sync complete", () => {
    state.data = { ...job("failed"), import_pending: true };
    const output = html(<SyncJobScreen jobId="synthetic-job" />);
    expect(output).toContain("Fetched, import failed"); expect(output).toContain("Retry import"); expect(output).not.toContain("Sync complete");
  });
  it("tells a queued job its place and wait", () => {
    expect(queueText(3, 2400)).toBe("3rd in line, about 40 minutes");
    expect(queueText(1, null)).toBe("1st in line");
    state.data = { ...job("queued"), queue_position: 2, eta_seconds: 600 };
    expect(html(<SyncJobScreen jobId="synthetic-job" />)).toContain("2nd in line, about 10 minutes");
  });
  it("asks to verify again and offers resume after login for interrupted jobs", async () => {
    state.data = job("needs_code");
    expect(html(<SyncJobScreen jobId="synthetic-job" />)).toContain("Verify again on Home");
    state.data = job("interrupted");
    const resume = vi.spyOn(syncApi, "resume").mockResolvedValue(job("queued"));
    const output = html(<SyncJobScreen jobId="synthetic-job" />);
    expect(output).toContain("Resume after login"); expect(output).toContain("/login?return=");
    await state.mutation.mutationFn("resume"); expect(resume).toHaveBeenCalledWith("synthetic-job");
  });
  it.each(["failed", "cancelled"])("offers partial import and discard for %s", async status => {
    state.data = job(status);
    const partial = vi.spyOn(syncApi, "usePartial").mockResolvedValue({ status: "ok", imported: 12, total: 12 });
    const output = html(<SyncJobScreen jobId="synthetic-job" />);
    expect(output).toContain("Use partial data"); expect(output).toContain("Discard");
    await state.mutation.mutationFn("partial"); expect(partial).toHaveBeenCalledWith("synthetic-job");
  });
  it.each(["imported", "discarded"] as const)("shows persisted %s decision after reload", decision => {
    state.data = { ...job("failed"), partial_decision: decision };
    const output = html(<SyncJobScreen jobId="synthetic-job" />);
    expect(output).toContain(decision === "imported" ? "Partial data was imported" : "Previously imported orders remain");
    expect(output).not.toContain("Use partial data");
    expect(output).not.toContain(">Discard</button>");
  });
  it("warns only for active jobs and surfaces API errors", () => {
    expect(html(<SyncLogoutWarning jobs={[job("running")]} />)).toContain("server restart");
    expect(html(<SyncLogoutWarning jobs={[job("done")]} />)).toBe("");
    state.error = new Error("Synthetic API unavailable");
    expect(html(<SyncJobScreen jobId="synthetic-job" />)).toContain("Synthetic API unavailable");
    expect(html(<SyncChooser accountId="synthetic-account" onStarted={vi.fn()} />)).toContain("Synthetic API unavailable");
  });
});

describe("local sync client", () => {
  it("uses authenticated client endpoints and trimmed code", async () => {
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify(job("running")))));
    vi.stubGlobal("fetch", fetch);
    await syncApi.list(); await syncApi.get("job/id"); await syncApi.create("synthetic-account", "all"); await syncApi.cancel("job/id"); await syncApi.resume("job/id"); await syncApi.usePartial("job/id"); await syncApi.discardPartial("job/id");
    expect(fetch.mock.calls.map(c => c[0])).toEqual(["/api/sync/jobs", "/api/sync/jobs/job%2Fid", "/api/sync/jobs", "/api/sync/jobs/job%2Fid/cancel", "/api/sync/jobs/job%2Fid/resume", "/api/sync/jobs/job%2Fid/use-partial", "/api/sync/jobs/job%2Fid/discard-partial"]);
    expect(fetch.mock.calls[3][1].headers["x-csrf-token"]).toBe("synthetic-csrf");
    vi.unstubAllGlobals();
  });
  it.each([400, 404, 409, 503])("preserves API error %s", async status => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: { code: "SYNTHETIC", message: "Try again" } }), { status })));
    await expect(syncApi.create("synthetic-account", "missing")).rejects.toMatchObject({ status, code: "SYNTHETIC" });
    vi.unstubAllGlobals();
  });
});
