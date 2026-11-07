import { afterEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { calculateComparisonDates, useDashboardCompare } from "./api";
import * as api from "../lib/api";
import { defaultFilters } from "../lib/filters";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("calculateComparisonDates (S-024)", () => {
  it("returns null when compare is 'none' or unspecified", () => {
    expect(calculateComparisonDates({ compare: "none" })).toBeNull();
    expect(calculateComparisonDates({ compare: null })).toBeNull();
    expect(calculateComparisonDates({})).toBeNull();
  });

  describe("compare = 'previous_period'", () => {
    it("shifts dates backwards by span duration D = (to - from)", () => {
      // 2026-03-01 to 2026-03-31 is 30 days difference (31 days inclusive)
      // shifted_date_to is 2026-03-01 - 1 day = 2026-02-28
      // shifted_date_from is 2026-02-28 - 30 days = 2026-01-29
      const result = calculateComparisonDates({
        compare: "previous_period",
        date_from: "2026-03-01",
        date_to: "2026-03-31",
      });
      expect(result).toEqual({
        date_from: "2026-01-29",
        date_to: "2026-02-28",
      });
    });

    it("handles single-day span (D = 0)", () => {
      const result = calculateComparisonDates({
        compare: "previous_period",
        date_from: "2026-05-15",
        date_to: "2026-05-15",
      });
      expect(result).toEqual({
        date_from: "2026-05-14",
        date_to: "2026-05-14",
      });
    });

    it("handles 7-day preset span", () => {
      // e.g. 2026-06-10 to 2026-06-16 (D = 6 days)
      const result = calculateComparisonDates({
        compare: "previous_period",
        date_from: "2026-06-10",
        date_to: "2026-06-16",
      });
      expect(result).toEqual({
        date_from: "2026-06-03",
        date_to: "2026-06-09",
      });
    });

    it("falls back to safe prior year range when dates are absent", () => {
      const fixedNow = new Date("2026-11-08T00:00:00Z");
      const result = calculateComparisonDates(
        {
          compare: "previous_period",
          date_from: null,
          date_to: null,
        },
        fixedNow,
      );
      expect(result).toEqual({
        date_from: "2025-01-01",
        date_to: "2025-12-31",
      });
    });
  });

  describe("compare = 'previous_year'", () => {
    it("subtracts 1 year from date_from and date_to", () => {
      const result = calculateComparisonDates({
        compare: "previous_year",
        date_from: "2026-03-01",
        date_to: "2026-03-31",
      });
      expect(result).toEqual({
        date_from: "2025-03-01",
        date_to: "2025-03-31",
      });
    });

    it("handles leap day Feb 29 cleanly (2024-02-29 -> 2023-02-28)", () => {
      const result = calculateComparisonDates({
        compare: "previous_year",
        date_from: "2024-02-29",
        date_to: "2024-02-29",
      });
      expect(result).toEqual({
        date_from: "2023-02-28",
        date_to: "2023-02-28",
      });
    });

    it("falls back to safe prior year range when dates are absent", () => {
      const fixedNow = new Date("2026-11-08T00:00:00Z");
      const result = calculateComparisonDates(
        {
          compare: "previous_year",
          date_from: null,
          date_to: null,
        },
        fixedNow,
      );
      expect(result).toEqual({
        date_from: "2025-01-01",
        date_to: "2025-12-31",
      });
    });
  });
});

describe("useDashboardCompare query hook (S-024)", () => {
  it("disables the query when compare is 'none' and makes no request", () => {
    const dashboardSpy = vi.spyOn(api, "dashboard");
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    function TestComponent() {
      const query = useDashboardCompare({
        ...defaultFilters(),
        compare: "none",
      });
      return React.createElement(
        "div",
        null,
        `fetchStatus:${query.fetchStatus};enabled:${String(query.isPending)}`,
      );
    }

    const html = renderToString(
      React.createElement(
        QueryClientProvider,
        { client: queryClient },
        React.createElement(TestComponent),
      ),
    );

    expect(html).toContain("fetchStatus:idle");
    expect(dashboardSpy).not.toHaveBeenCalled();
  });

  it("enables query with shifted dates and compare: 'none' when compare is active", () => {
    const dashboardSpy = vi.spyOn(api, "dashboard").mockImplementation(() =>
      Promise.resolve({} as any),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    function TestComponent() {
      useDashboardCompare({
        ...defaultFilters(),
        compare: "previous_year",
        date_from: "2026-03-01",
        date_to: "2026-03-31",
      });
      return React.createElement("div", null, "active");
    }

    renderToString(
      React.createElement(
        QueryClientProvider,
        { client: queryClient },
        React.createElement(TestComponent),
      ),
    );

    // Verify query was created in cache with shifted date filters and compare: 'none'
    const queries = queryClient.getQueryCache().getAll();
    expect(queries.length).toBe(1);
    const queryKey = queries[0].queryKey;
    expect(queryKey[0]).toBe("dashboard");
    expect(queryKey[1]).toBe("compare");
    const sentFilters = queryKey[2] as api.DashboardFilters;
    expect(sentFilters.date_from).toBe("2025-03-01");
    expect(sentFilters.date_to).toBe("2025-03-31");
    expect(sentFilters.compare).toBe("none");
  });
});
