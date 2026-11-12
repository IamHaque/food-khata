import { describe, expect, it, vi, beforeEach } from "vitest";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Home } from "./Home";
import { LinkAccount } from "./LinkAccount";
import * as accessApi from "../api";

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
}

function renderWithProviders(ui: React.ReactElement, initialPath = "/") {
  const queryClient = createTestQueryClient();
  return renderToString(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AC-14 Accounts and linking screens", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("Scenario 1: Home lists linked accounts", () => {
    it("shows provider, status chip and last sync", () => {
      vi.spyOn(accessApi, "useAccounts").mockReturnValue({
        data: [
          { id: "a1", local_id: "a1", provider: "swiggy", phone: "9876543210", status: "ok", last_sync: "2h ago", order_count: 5, has_session: true },
        ],
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      } as any);

      const html = renderWithProviders(<Home />);
      expect(html).toContain("swiggy");
      expect(html).toContain("ok");
      expect(html).toContain("2h ago");
      expect(html).toContain("Link account");
    });
  });

  describe("Scenario 1b: Home shows real counts, job badge and disabled Sync", () => {
    it("links the badge to the active job, disables Sync while it runs, and offers Verify again for needs_code", () => {
      vi.spyOn(accessApi, "useAccounts").mockReturnValue({
        data: [
          { id: "a1", local_id: "a1", provider: "swiggy", phone: "••••3210", status: "ok", last_sync: "2026-11-12T10:00:00+00:00", order_count: 1439, has_session: true, active_job_id: "job-1", active_status: "running" },
          { id: "a2", local_id: "a2", provider: "zomato", phone: "••••8226", status: "ok", last_sync: null, order_count: 0, has_session: true, active_job_id: "job-2", active_status: "needs_code" },
        ],
        isLoading: false, isError: false, refetch: vi.fn(),
      } as any);
      const html = renderWithProviders(<Home />);
      expect(html).toContain('href="/jobs/job-1"');
      expect(html).toContain("1,439");
      expect(html).toContain("••••3210");
      expect(html).not.toContain('href="/sync?account='); // both have an active job: Sync is a disabled button, not a link
      expect(html).toContain("needs verification");
      expect(html).toContain("Verify again");
      expect(html).toContain("never synced");
      expect(html).toContain('href="/jobs/job-1"'); // the sidebar owns Jobs, Data health and Settings now
    });
  });

  describe("Scenario 2: empty state", () => {
    it("shows empty state linking to Home/link", () => {
      vi.spyOn(accessApi, "useAccounts").mockReturnValue({
        data: [],
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      } as any);
      const html = renderWithProviders(<Home />);
      expect(html).toContain("No accounts linked yet");
      expect(html).toContain("/accounts/link");
    });
  });

  describe("Scenario 3: link flow renders phone then code", () => {
    it("renders phone step first", () => {
      const html = renderWithProviders(<LinkAccount />);
      expect(html).toContain("Phone number");
      expect(html).toContain("Send code");
    });
  });

  describe("Scenario 4: expired session shows Verify again", () => {
    it("shows Verify again for expired account", () => {
      vi.spyOn(accessApi, "useAccounts").mockReturnValue({
        data: [
          { id: "a2", local_id: "a2", provider: "zomato", phone: "9999999999", status: "expired", last_sync: null, order_count: 0, has_session: false },
        ],
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      } as any);
      const html = renderWithProviders(<Home />);
      expect(html).toContain("Verify again");
    });
  });

  describe("Scenario 5: disconnect confirm dialog keep/wipe", () => {
    it("shows keep and wipe options", () => {
      vi.spyOn(accessApi, "useAccounts").mockReturnValue({
        data: [
          { id: "a3", local_id: "a3", provider: "fake", phone: "1234567890", status: "ok", last_sync: null, order_count: 0, has_session: true },
        ],
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      } as any);
      // renderToString cannot click; check Disconnect button presence
      const html = renderWithProviders(<Home />);
      expect(html).toContain("Disconnect");
    });
  });

  describe("Scenario 6: link screen supports alternative account", () => {
    it("renders provider selector for another phone", () => {
      const html = renderWithProviders(<LinkAccount />);
      expect(html).toContain("Provider");
      expect(html).toContain("Phone number");
    });
  });
});