import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import {
  FeeComponentsChart,
  buildFeeComponentsOption,
  formatFeeComponentsTooltip,
  FEE_COMPONENTS_SERIES_CONFIG,
  type FeeComponentsDatum,
} from "./FeeComponentsChart";
import {
  resolveChartTheme,
  VALID_MODES,
  VALID_ACCENTS,
} from "../../lib/chart-theme";
import { computeFeeComponentsTakeaway, formatRupees } from "../../lib/captions";
import {
  registerChart,
  unregisterChart,
  getRegisteredChart,
  clearRegistry,
  isDimensionMatch,
} from "../../lib/highlight-bus";

const sampleFeeData: FeeComponentsDatum[] = [
  {
    month: "2024-01",
    net_delivery: 120,
    packaging: 40,
    platform: 45,
    tax: 35,
    total_fees: 240,
    order_count: 5,
  },
  {
    month: "2024-02",
    net_delivery: 150,
    packaging: 60,
    platform: 90,
    tax: 50,
    total_fees: 350,
    order_count: 7,
  },
  {
    month: "2024-03",
    net_delivery: 200,
    packaging: 80,
    platform: 120,
    tax: 60,
    total_fees: 460,
    order_count: 9,
  },
];

describe("FeeComponentsChart - Option Builder (CC-11, S-043)", () => {
  it("builds stacked area series with type 'line', stack 'fees', and areaStyle opacity 0.6 (Scenario: Stacked area)", () => {
    const theme = resolveChartTheme("light", "emerald");
    const option = buildFeeComponentsOption({
      data: sampleFeeData,
      theme,
      prefersReducedMotion: false,
    });

    expect((option.xAxis as any).data).toEqual(["2024-01", "2024-02", "2024-03"]);
    expect((option.xAxis as any).boundaryGap).toBe(false);

    const series = option.series as Array<{
      name?: string;
      type?: string;
      stack?: string;
      areaStyle?: { opacity: number };
      symbol?: string;
      data?: number[];
      itemStyle?: { color: string };
      lineStyle?: { color: string; width: number };
    }>;

    expect(series).toHaveLength(4);

    // 1. Net delivery
    expect(series[0].name).toBe("Net delivery");
    expect(series[0].type).toBe("line");
    expect(series[0].stack).toBe("fees");
    expect(series[0].areaStyle?.opacity).toBe(0.6);
    expect(series[0].symbol).toBe("circle");
    expect(series[0].itemStyle?.color).toBe(theme.colors[0]);
    expect(series[0].data).toEqual([120, 150, 200]);

    // 2. Packaging
    expect(series[1].name).toBe("Packaging");
    expect(series[1].type).toBe("line");
    expect(series[1].stack).toBe("fees");
    expect(series[1].areaStyle?.opacity).toBe(0.6);
    expect(series[1].symbol).toBe("rect");
    expect(series[1].itemStyle?.color).toBe(theme.colors[1]);
    expect(series[1].data).toEqual([40, 60, 80]);

    // 3. Platform
    expect(series[2].name).toBe("Platform");
    expect(series[2].type).toBe("line");
    expect(series[2].stack).toBe("fees");
    expect(series[2].areaStyle?.opacity).toBe(0.6);
    expect(series[2].symbol).toBe("triangle");
    expect(series[2].itemStyle?.color).toBe(theme.colors[2]);
    expect(series[2].data).toEqual([45, 90, 120]);

    // 4. Tax
    expect(series[3].name).toBe("Tax");
    expect(series[3].type).toBe("line");
    expect(series[3].stack).toBe("fees");
    expect(series[3].areaStyle?.opacity).toBe(0.6);
    expect(series[3].symbol).toBe("diamond");
    expect(series[3].itemStyle?.color).toBe(theme.colors[3]);
    expect(series[3].data).toEqual([35, 50, 60]);

    // Legend
    expect(option.legend).toBeDefined();
    expect((option.legend as any).show).toBe(true);
    expect((option.legend as any).data).toEqual([
      "Net delivery",
      "Packaging",
      "Platform",
      "Tax",
    ]);
  });

  it("assigns distinct symbols and token palette colors so meaning does not depend on color alone (CC-10)", () => {
    const theme = resolveChartTheme("dark", "indigo");
    const option = buildFeeComponentsOption({
      data: sampleFeeData,
      theme,
    });

    const series = option.series as any[];
    expect(series).toHaveLength(4);
    const symbols = series.map((s) => s.symbol);
    expect(new Set(symbols).size).toBe(4);
    expect(option.aria).toEqual({
      enabled: true,
      decal: { show: true },
    });
  });

  it("supports selectedSeries array and record for interactive legend series toggling", () => {
    const theme = resolveChartTheme("light", "emerald");

    // Array form
    const option1 = buildFeeComponentsOption({
      data: sampleFeeData,
      theme,
      selectedSeries: ["Platform", "Tax"],
    });

    expect((option1.legend as any).selected).toEqual({
      "Net delivery": false,
      Packaging: false,
      Platform: true,
      Tax: true,
    });

    // Record form with alias
    const option2 = buildFeeComponentsOption({
      data: sampleFeeData,
      theme,
      selectedSeries: {
        "Platform fee": true,
        Tax: false,
      },
    });

    expect((option2.legend as any).selected).toEqual({
      "Net delivery": false,
      Packaging: false,
      Platform: true,
      Tax: false,
    });
  });

  it("configures 600ms cubicOut entry animation and respects reduced motion (CC-3)", () => {
    const theme = resolveChartTheme("light", "emerald");
    const normalOption = buildFeeComponentsOption({
      data: sampleFeeData,
      theme,
      prefersReducedMotion: false,
    });

    expect(normalOption.animation).toBe(true);
    expect(normalOption.animationDuration).toBe(600);
    expect(normalOption.animationEasing).toBe("cubicOut");

    const reducedOption = buildFeeComponentsOption({
      data: sampleFeeData,
      theme,
      prefersReducedMotion: true,
    });

    expect(reducedOption.animation).toBe(false);
    expect(reducedOption.animationDuration).toBe(0);
  });

  it("renders consistently across all theme modes and accents (CC-1)", () => {
    for (const mode of VALID_MODES) {
      for (const accent of VALID_ACCENTS) {
        const theme = resolveChartTheme(mode, accent);
        const option = buildFeeComponentsOption({
          data: sampleFeeData,
          theme,
        });

        expect(option.series).toBeDefined();
        expect((option.series as any[]).length).toBe(4);
        expect((option.tooltip as any).backgroundColor).toBe(theme.tooltipBg);
      }
    }
  });
});

describe("FeeComponentsChart - Share Tooltip (Scenario: Share, CC-4)", () => {
  it("formats rich tooltip with component rupee amounts and percentage shares (e.g. Platform: ₹45 (35% of total fees))", () => {
    const theme = resolveChartTheme("light", "emerald");

    // January: total = 120 + 40 + 45 + 35 = 240
    // Platform = 45 / 240 = 18.75% -> 19%
    // Net delivery = 120 / 240 = 50%
    const params = [
      { seriesName: "Net delivery", value: 120, color: theme.colors[0], axisValueLabel: "2024-01" },
      { seriesName: "Packaging", value: 40, color: theme.colors[1], axisValueLabel: "2024-01" },
      { seriesName: "Platform", value: 45, color: theme.colors[2], axisValueLabel: "2024-01" },
      { seriesName: "Tax", value: 35, color: theme.colors[3], axisValueLabel: "2024-01" },
    ];

    const html = formatFeeComponentsTooltip(params, theme);

    expect(html).toContain("2024-01");
    expect(html).toContain("Net delivery:");
    expect(html).toContain(formatRupees(120));
    expect(html).toContain("(50% of total fees)");

    expect(html).toContain("Platform:");
    expect(html).toContain(formatRupees(45));
    expect(html).toContain("(19% of total fees)");

    // Bold monthly total fees + tax at the bottom
    expect(html).toContain("Total fees + tax:");
    expect(html).toContain(formatRupees(240));
    expect(html).toContain("font-weight: 700");
  });

  it("handles scenario example calculation: Platform: ₹45 (35% of total fees) when total fees are 129", () => {
    const theme = resolveChartTheme("light", "emerald");
    const params = [
      { seriesName: "Net delivery", value: 50, color: theme.colors[0], axisValueLabel: "2024-01" },
      { seriesName: "Packaging", value: 20, color: theme.colors[1], axisValueLabel: "2024-01" },
      { seriesName: "Platform", value: 45, color: theme.colors[2], axisValueLabel: "2024-01" },
      { seriesName: "Tax", value: 14, color: theme.colors[3], axisValueLabel: "2024-01" },
    ];
    // Total = 50 + 20 + 45 + 14 = 129
    // 45 / 129 = 34.88% -> 35%
    const html = formatFeeComponentsTooltip(params, theme);
    expect(html).toContain("Platform:");
    expect(html).toContain(formatRupees(45));
    expect(html).toContain("(35% of total fees)");
    expect(html).toContain(formatRupees(129));
  });

  it("handles empty params or all-zero items gracefully", () => {
    const theme = resolveChartTheme("light", "emerald");
    expect(formatFeeComponentsTooltip([], theme)).toBe("");
    expect(formatFeeComponentsTooltip(null, theme)).toBe("");

    const zeroParams = [
      { seriesName: "Platform", value: 0, axisValueLabel: "2024-01" },
    ];
    const zeroHtml = formatFeeComponentsTooltip(zeroParams, theme);
    expect(zeroHtml).toContain("2024-01");
    expect(zeroHtml).toContain("(0% of total fees)");
    expect(zeroHtml).toContain("Total fees + tax:");
  });
});

describe("FeeComponentsChart - React Component (ChartCard, Popover, Table, Accessibility)", () => {
  it("renders inside ChartCard with title, subtitle, and takeaway caption", () => {
    const expectedCaption = computeFeeComponentsTakeaway(sampleFeeData);
    expect(expectedCaption).toBe("Delivery fees represent 45% of total fees (₹470)");

    const html = renderToString(
      <MemoryRouter>
        <FeeComponentsChart data={sampleFeeData} />
      </MemoryRouter>,
    );

    expect(html).toContain("Monthly fee components");
    expect(html).toContain("Breakdown of delivery, packaging, platform, and tax charges");
    expect(html).toContain(expectedCaption!);
  });

  it("renders info popover explaining the breakdown of fee components and taxes across months", () => {
    const html = renderToString(
      <MemoryRouter>
        <FeeComponentsChart data={sampleFeeData} />
      </MemoryRouter>,
    );

    expect(html).toContain('aria-label="Fee components information"');
  });

  it("renders accessible sortable table view with Month, Net delivery, Packaging, Platform, Tax, Total fees (CC-7, CC-10)", () => {
    const html = renderToString(
      <MemoryRouter>
        <FeeComponentsChart data={sampleFeeData} showTable={true} />
      </MemoryRouter>,
    );

    expect(html).toContain("Month");
    expect(html).toContain("Net delivery");
    expect(html).toContain("Packaging");
    expect(html).toContain("Platform");
    expect(html).toContain("Tax");
    expect(html).toContain("Total fees");

    expect(html).toContain("2024-01");
    expect(html).toContain("120");
    expect(html).toContain("40");
    expect(html).toContain("45");
    expect(html).toContain("35");
    expect(html).toContain("240");
  });

  it("renders loading state with skeleton (CC-9)", () => {
    const html = renderToString(
      <MemoryRouter>
        <FeeComponentsChart isLoading={true} />
      </MemoryRouter>,
    );

    expect(html).toContain("Monthly fee components");
    expect(html).toContain("animate-pulse");
  });

  it("renders empty state with custom or default reason (CC-9)", () => {
    const htmlDefault = renderToString(
      <MemoryRouter>
        <FeeComponentsChart data={[]} />
      </MemoryRouter>,
    );
    expect(htmlDefault).toContain("No fee components data available for the selected filters");

    const htmlCustom = renderToString(
      <MemoryRouter>
        <FeeComponentsChart data={[]} emptyReason="Custom empty fee reason" />
      </MemoryRouter>,
    );
    expect(htmlCustom).toContain("Custom empty fee reason");
  });

  it("renders error state with retry button (CC-9)", () => {
    const onRetry = vi.fn();
    const html = renderToString(
      <MemoryRouter>
        <FeeComponentsChart error="Failed to fetch fee data" onRetry={onRetry} />
      </MemoryRouter>,
    );

    expect(html).toContain("Failed to fetch fee data");
    expect(html).toContain("Retry");
  });

  it("renders accessible img container with summary aria-label and aria-description (CC-10)", () => {
    const html = renderToString(
      <MemoryRouter>
        <FeeComponentsChart data={sampleFeeData} />
      </MemoryRouter>,
    );

    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Monthly fee components"');
    expect(html).toContain("Monthly fee components stacked area chart showing breakdown of delivery, packaging, platform, and tax charges");
  });
});

describe("FeeComponentsChart - Linked Hover & Highlight Bus (CC-6, S-021)", () => {
  afterEach(() => {
    clearRegistry();
  });

  it("registers chart and matches month dimension correctly", () => {
    const chartId = "test-fee-chart";
    const months = ["2024-01", "2024-02", "2024-03"];
    const dispatchedActions: any[] = [];
    const mockChart = {
      dispatchAction: (payload: any) => dispatchedActions.push(payload),
    };

    const matcher = (dim: string, val: string) => {
      if (dim !== "month") return false;
      const matchIdx = months.findIndex((m) => isDimensionMatch("month", m, val));
      if (matchIdx >= 0) {
        return { type: "highlight", dataIndex: matchIdx };
      }
      return undefined;
    };

    const unregister = registerChart(chartId, mockChart, {
      dimension: "month",
      matcher,
    });

    expect(getRegisteredChart(chartId)).toBeDefined();

    // Match 2024-02
    const res = matcher("month", "2024-02");
    expect(res).toEqual({ type: "highlight", dataIndex: 1 });

    // Non-month dimension should not match
    expect(matcher("platform", "Swiggy")).toBe(false);

    unregister();
    expect(getRegisteredChart(chartId)).toBeUndefined();
  });
});
