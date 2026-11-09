import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { BaseChart, useOptionalFilters } from "./BaseChart";
import { FilterProvider } from "../../app/FilterContext";
import { resolveChartTheme } from "../../lib/chart-theme";
import { registerChart, unregisterChart, getRegisteredChart } from "../../lib/highlight-bus";

// Render portal inline for testing
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: any) => (open ? <>{children}</> : null),
  DialogContent: ({ children, className }: any) => (
    <div role="dialog" className={className}>
      {children}
    </div>
  ),
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
}));

describe("BaseChart Primitive (FX-05)", () => {
  const sampleData = [
    { name: "Swiggy", value: 1200 },
    { name: "Zomato", value: 800 },
  ];

  it("Scenario: declarative contract - renders chart card wrapper, title, subtitle, caption, and img container", () => {
    const spec = (data: any[], theme: any) => ({
      title: { text: "Declarative Chart" },
      series: [{ type: "pie", data }],
    });

    const html = renderToString(
      <BaseChart
        title="Platform Spend"
        subtitle="Distribution across food delivery apps"
        caption="Swiggy leads with 60% share"
        data={sampleData}
        spec={spec}
        ariaLabel="Platform spend breakdown chart"
        chartHeight={360}
      />
    );

    expect(html).toContain("Platform Spend");
    expect(html).toContain("Distribution across food delivery apps");
    expect(html).toContain("Swiggy leads with 60% share");
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Platform spend breakdown chart"');
    expect(html).toContain('height:360px');
  });

  it("Scenario: declarative contract - supports spec functions taking (data, theme)", () => {
    let capturedData: any = null;
    let capturedTheme: any = null;

    const spec = (data: any, theme: any) => {
      capturedData = data;
      capturedTheme = theme;
      return { series: [{ type: "bar", data }] };
    };

    // When spec is called during rendering or updates
    const theme = resolveChartTheme("light", "emerald");
    const option = spec(sampleData, theme);

    expect(capturedData).toEqual(sampleData);
    expect(capturedTheme).toBeDefined();
    expect(option.series[0].type).toBe("bar");

    const html = renderToString(
      <BaseChart
        title="Bar Chart"
        data={sampleData}
        spec={spec}
      />
    );
    expect(html).toContain("Bar Chart");
    expect(html).toContain('role="img"');
  });

  it("Scenario: declarative contract - supports spec function taking only (theme)", () => {
    const spec = (theme: any) => ({
      color: theme.colors,
      series: [{ type: "line" }],
    });

    const html = renderToString(
      <BaseChart
        title="Theme Only Chart"
        spec={spec}
      />
    );
    expect(html).toContain("Theme Only Chart");
  });

  it("Scenario: declarative contract - supports static EChartsCoreOption object as spec", () => {
    const staticOption = {
      series: [{ type: "pie", data: [10, 20] }],
    };

    const html = renderToString(
      <BaseChart
        title="Static Option Chart"
        spec={staticOption}
      />
    );
    expect(html).toContain("Static Option Chart");
  });

  it("renders table view when tableData and showTable are enabled", () => {
    const tableData = [
      { Platform: "Swiggy", Spend: 1200 },
      { Platform: "Zomato", Spend: 800 },
    ];

    const html = renderToString(
      <BaseChart
        title="Platform Spend"
        tableData={tableData}
        showTable
        spec={() => ({})}
      />
    );

    expect(html).toContain("Platform");
    expect(html).toContain("Spend");
    expect(html).toContain("Swiggy");
    expect(html).toContain("Zomato");
    expect(html).toContain("1200");
    expect(html).toContain("800");
  });

  it("renders loading state with skeleton (CC-9)", () => {
    const html = renderToString(
      <BaseChart
        title="Loading Chart"
        isLoading
        spec={() => ({})}
      />
    );

    expect(html).toContain("Loading Chart");
    expect(html).toContain("animate-pulse");
    expect(html).not.toContain('role="img"');
  });

  it("renders empty state with custom empty reason (CC-9)", () => {
    const html = renderToString(
      <BaseChart
        title="Empty Chart"
        isEmpty
        emptyReason="No order data available for current date range"
        spec={() => ({})}
      />
    );

    expect(html).toContain("Empty Chart");
    expect(html).toContain("No order data available for current date range");
    expect(html).not.toContain('role="img"');
  });

  it("renders error state with retry button (CC-9)", () => {
    const onRetry = vi.fn();
    const html = renderToString(
      <BaseChart
        title="Error Chart"
        error="Server connection failed"
        onRetry={onRetry}
        spec={() => ({})}
      />
    );

    expect(html).toContain("Error Chart");
    expect(html).toContain("Server connection failed");
    expect(html).toContain("Retry");
    expect(html).not.toContain('role="img"');
  });

  it("renders within FilterProvider without breaking lifecycle (2fcacf4 regression check)", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const onSelect = vi.fn();

    const html = renderToString(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <FilterProvider>
            <BaseChart
              title="Filter Integrated Chart"
              crossFilterDimension="platform"
              data={sampleData}
              spec={(data, theme) => ({ series: [{ data }] })}
              onSelect={onSelect}
            />
          </FilterProvider>
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(html).toContain("Filter Integrated Chart");
    expect(html).toContain('role="img"');
  });

  it("renders headerControls, custom children, and footerControls when supplied", () => {
    const html = renderToString(
      <BaseChart
        title="Controls Chart"
        spec={() => ({})}
        headerControls={<div data-testid="metric-selector">Metric Selector</div>}
        footerControls={<div data-testid="footer-summary">Footer Summary</div>}
      >
        <div data-testid="chart-overlay">Custom Overlay</div>
      </BaseChart>
    );

    expect(html).toContain("Metric Selector");
    expect(html).toContain("Custom Overlay");
    expect(html).toContain("Footer Summary");
    expect(html).toContain('role="img"');
  });

  it("useOptionalFilters returns null gracefully when outside FilterProvider", () => {
    function TestConsumer() {
      const filters = useOptionalFilters();
      return <div>filters:{filters ? "exists" : "null"}</div>;
    }

    const html = renderToString(<TestConsumer />);
    expect(html).toContain("null");
  });

  it("highlight bus can register, query, and unregister BaseChart instances", () => {
    const chartId = "basechart-test-highlight-id";
    const mockChart = {
      dispatchAction: vi.fn(),
      getOption: vi.fn(() => ({})),
    };

    const unregister = registerChart(chartId, mockChart, { dimension: "platform" });
    expect(getRegisteredChart(chartId)).toBeDefined();

    unregister();
    expect(getRegisteredChart(chartId)).toBeUndefined();
  });
});
