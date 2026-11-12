import * as React from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { JobTimeline, JobsList } from "./Jobs";

const wrap = (client: QueryClient, node: React.ReactNode) => renderToString(<QueryClientProvider client={client}><MemoryRouter>{node}</MemoryRouter></QueryClientProvider>);

// MemoryRouter warns about useLayoutEffect on every server render; keep the test log under verify.mjs's 1 MB buffer.
beforeAll(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });

describe("jobs screen", () => {
  it("lists jobs with status, mode, provider, account, times, counts and a link to the detail", () => {
    const client = new QueryClient();
    client.setQueryData(["accounts"], [{ id: "a", local_id: "a", provider: "zomato", phone: "••••8226" }]);
    client.setQueryData(["access", "sync", "jobs", "", 0], [
      { id: "j1", account_id: "a", provider: "zomato", mode: "full", status: "needs_code", started_at: 1700000000, finished_at: null, counts: { orders: 388, details: 380 } },
    ]);
    const html = wrap(client, <JobsList />);
    for (const text of ["zomato", "••••8226", "needs verification", "All history", "388 orders", 'href="/jobs/j1"', "Status", "Next"]) expect(html).toContain(text);
  });
  it("shows the event timeline", () => {
    const client = new QueryClient();
    client.setQueryData(["access", "sync", "j1", "events"], [
      { id: 1, job_id: "j1", status: "running", phase: "history", page: 3, created_at: 1700000000 },
      { id: 2, job_id: "j1", status: "needs_code", code: "NEEDS_OTP", message: "Provider asks for a verification code mid-sync", created_at: 1700000100 },
    ]);
    const html = wrap(client, <JobTimeline jobId="j1" active={false} />);
    expect(html).toContain("history · page 3"); expect(html).toContain("Provider asks for a verification code");
  });
});
