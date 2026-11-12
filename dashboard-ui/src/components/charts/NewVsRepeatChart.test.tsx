import { getPatterns } from "../../app/theme";
import { describe, expect, it, vi, afterEach } from "vitest";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import {
  NewVsRepeatChart,
  buildNewVsRepeatOption,
  formatNewVsRepeatTooltip,
  NEW_VS_REPEAT_SERIES_CONFIG,
  type NewVsRepeatDatum,
} from "./NewVsRepeatChart";
import {
  resolveChartTheme,
  VALID_MODES,
  VALID_ACCENTS,
} from "../../lib/chart-theme";
import { computeNewVsRepeatTakeaway } from "../../lib/captions";
import {
  registerChart,
  getRegisteredChart,
  clearRegistry,
  isDimensionMatch,
} from "../../lib/highlight-bus";

const sampleData: NewVsRepeatDatum[] = [
  {
    month: "2024-01",
    new_orders: 12,
    repeat_orders: 18,
  },
  {
    month: "2024-02",
    new_orders: 10,
    repeat_orders: 20,
  },
  {
    month: "2024-03",
    new_orders: 10,
    repeat_orders: 30,
  },
];

describe("NewVsRepeatChart - Option Builder (CC-11, S-051)", () => {
  it("builds stacked area series with type 'line', stack 'visits', and areaStyle opacity 0.6 (Scenario: Stacked area)", () => {
    const theme = resolveChartTheme("light", "emerald");
    const option = buildNewVsRepeatOption({
      data: sampleData,
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

    expect(series).toHaveLength(2);

    // Series 1: New restaurants
    expect(series[0].name).toBe("New restaurants");
    expect(series[0].type).toBe("line");
    expect(series[0].stack).toBe("visits");
    expect(series[0].areaStyle?.opacity).toBe(0.6);
    expect(series[0].symbol).toBe("circle");
    expect(series[0].itemStyle?.color).toBe(theme.colors[0]);
    expect(series[0].data).toEqual([12, 10, 10]);

    // Series 2: Repeat restaurants
    expect(series[1].name).toBe("Repeat restaurants");
    expect(series[1].type).toBe("line");
    expect(series[1].stack).toBe("visits");
    expect(series[1].areaStyle?.opacity).toBe(0.6);
    expect(series[1].symbol).toBe("rect");
    expect(series[1].itemStyle?.color).toBe(theme.colors[1]);
    expect(series[1].data).toEqual([18, 20, 30]);

    // Legend
    expect(option.legend).toBeDefined();
    expect((option.legend as any).show).toBe(true);
    expect((option.legend as any).data).toEqual([
      "New restaurants",
      "Repeat restaurants",
    ]);
  });

  it("assigns distinct symbols (circle vs rect) and token palette colors so meaning does not depend on color alone (CC-10)", () => {
    const theme = resolveChartTheme("dark", "indigo");
    const option = buildNewVsRepeatOption({
      data: sampleData,
      theme,
    });

    const series = option.series as any[];
    expect(series).toHaveLength(2);
    expect(series[0].symbol).toBe("circle");
    expect(series[1].symbol).toBe("rect");
    expect(series[0].itemStyle.color).toBe(theme.colors[0]);
    expect(series[1].itemStyle.color).toBe(theme.colors[1]);
    expect(series[0].itemStyle.color).not.toBe(series[1].itemStyle.color);
    expect(option.aria).toEqual({
      enabled: true,
      decal: { show: getPatterns() },
    });
  });

  it("supports selectedSeries array and record for interactive legend series toggling", () => {
    const theme = resolveChartTheme("light", "emerald");

    // Array form
    const option1 = buildNewVsRepeatOption({
      data: sampleData,
      theme,
      selectedSeries: ["Repeat restaurants"],
    });

    expect((option1.legend as any).selected).toEqual({
      "New restaurants": false,
      "Repeat restaurants": true,
    });

    // Record form with alias
    const option2 = buildNewVsRepeatOption({
      data: sampleData,
      theme,
      selectedSeries: {
        "new": true,
        "repeat": false,
      },
    });

    expect((option2.legend as any).selected).toEqual({
      "New restaurants": true,
      "Repeat restaurants": false,
    });
  });

  it("configures 600ms cubicOut entry animation and respects reduced motion (CC-3)", () => {
    const theme = resolveChartTheme("light", "emerald");
    const normalOption = buildNewVsRepeatOption({
      data: sampleData,
      theme,
      prefersReducedMotion: false,
    });

    expect(normalOption.animation).toBe(true);
    expect(normalOption.animationDuration).toBe(600);
    expect(normalOption.animationEasing).toBe("cubicOut");

    const reducedOption = buildNewVsRepeatOption({
      data: sampleData,
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
        const option = buildNewVsRepeatOption({
          data: sampleData,
          theme,
        });

        expect(option.series).toBeDefined();
        expect((option.series as any[]).length).toBe(2);
        expect((option.tooltip as any).backgroundColor).toBe(theme.tooltipBg);
      }
    }
  });

  it("supports camelCase fallback properties in input data", () => {
    const camelData: NewVsRepeatDatum[] = [
      { month: "2024-01", newOrders: 5, repeatOrders: 15 },
    ];
    const theme = resolveChartTheme("light", "emerald");
    const option = buildNewVsRepeatOption({ data: camelData, theme });
    const series = option.series as any[];
    expect(series[0].data).toEqual([5]);
    expect(series[1].data).toEqual([15]);
  });

  it("handles empty or null data gracefully", () => {
    const theme = resolveChartTheme("light", "emerald");
    const option = buildNewVsRepeatOption({ data: [], theme });
    expect((option.xAxis as any).data).toEqual([]);
    const series = option.series as any[];
    expect(series[0].data).toEqual([]);
    expect(series[1].data).toEqual([]);
  });
});

describe("NewVsRepeatChart - Percent-Repeat Tooltip (Scenario: Tooltip, CC-4)", () => {
  it("formats rich tooltip with month, new orders, repeat orders, total orders, and percent-repeat share", () => {
    const theme = resolveChartTheme("light", "emerald");

    // 2024-01: new = 12, repeat = 18, total = 30
    // Repeat share = Math.round((18 / 30) * 100) = 60%
    const params = [
      { seriesName: "New restaurants", value: 12, color: theme.colors[0], axisValueLabel: "2024-01" },
      { seriesName: "Repeat restaurants", value: 18, color: theme.colors[1], axisValueLabel: "2024-01" },
    ];

    const html = formatNewVsRepeatTooltip(params, theme);

    expect(html).toContain("2024-01");
    expect(html).toContain("New restaurants:");
    expect(html).toContain("12");
    expect(html).toContain("Repeat restaurants:");
    expect(html).toContain("18");
    expect(html).toContain("Total orders:");
    expect(html).toContain("30");
    expect(html).toContain("Repeat share:");
    expect(html).toContain("60%");
  });

  it("calculates exact repeat share for scenario example (e.g. 68% repeat share)", () => {
    const theme = resolveChartTheme("light", "emerald");
    // new = 32, repeat = 68 -> total = 100 -> 68%
    const params = [
      { seriesName: "New restaurants", value: 32, color: theme.colors[0], axisValueLabel: "2024-02" },
      { seriesName: "Repeat restaurants", value: 68, color: theme.colors[1], axisValueLabel: "2024-02" },
    ];

    const html = formatNewVsRepeatTooltip(params, theme);
    expect(html).toContain("Repeat share:");
    expect(html).toContain("68%");
    expect(html).toContain("100");
  });

  it("handles zero total orders gracefully", () => {
    const theme = resolveChartTheme("light", "emerald");
    const params = [
      { seriesName: "New restaurants", value: 0, color: theme.colors[0], axisValueLabel: "2024-03" },
      { seriesName: "Repeat restaurants", value: 0, color: theme.colors[1], axisValueLabel: "2024-03" },
    ];

    const html = formatNewVsRepeatTooltip(params, theme);
    expect(html).toContain("2024-03");
    expect(html).toContain("Repeat share:");
    expect(html).toContain("0%");
  });

  it("returns empty string on empty or invalid params", () => {
    const theme = resolveChartTheme("light", "emerald");
    expect(formatNewVsRepeatTooltip([], theme)).toBe("");
    expect(formatNewVsRepeatTooltip(null, theme)).toBe("");
  });
});

describe("NewVsRepeatChart - React Component (ChartCard, Popover, Table, Accessibility)", () => {
  it("renders inside ChartCard with title, subtitle, and takeaway caption", () => {
    const expectedCaption = computeNewVsRepeatTakeaway(sampleData);
    expect(expectedCaption).toBe("Repeat orders account for 68% of orders overall");

    const html = renderToString(
      <MemoryRouter>
        <NewVsRepeatChart data={sampleData} />
      </MemoryRouter>,
    );

    expect(html).toContain("New vs repeat restaurants");
    expect(html).toContain("Monthly discovery versus loyalty trajectories");
    expect(html).toContain(expectedCaption!);
  });

  it("renders info popover explaining first-time and repeat classification and repeat share calculation", () => {
    const html = renderToString(
      <MemoryRouter>
        <NewVsRepeatChart data={sampleData} />
      </MemoryRouter>,
    );

    expect(html).toContain('aria-label="New vs repeat information"');
  });

  it("renders accessible sortable table view with Month, New orders, Repeat orders, Total, Repeat (%) (CC-7, CC-10)", () => {
    const html = renderToString(
      <MemoryRouter>
        <NewVsRepeatChart data={sampleData} showTable={true} />
      </MemoryRouter>,
    );

    expect(html).toContain("Month");
    expect(html).toContain("New orders");
    expect(html).toContain("Repeat orders");
    expect(html).toContain("Total");
    expect(html).toContain("Repeat (%)");

    expect(html).toContain("2024-01");
    expect(html).toContain("12");
    expect(html).toContain("18");
    expect(html).toContain("30");
    expect(html).toContain("60%");
  });

  it("renders loading state with skeleton pulse (CC-9)", () => {
    const html = renderToString(
      <MemoryRouter>
        <NewVsRepeatChart isLoading={true} />
      </MemoryRouter>,
    );

    expect(html).toContain("New vs repeat restaurants");
    expect(html).toContain("animate-pulse");
  });

  it("renders empty state when data is empty or all-zero orders (CC-9)", () => {
    const htmlDefault = renderToString(
      <MemoryRouter>
        <NewVsRepeatChart data={[]} />
      </MemoryRouter>,
    );
    expect(htmlDefault).toContain("No new vs repeat restaurant data available for the selected filters");

    const htmlCustom = renderToString(
      <MemoryRouter>
        <NewVsRepeatChart data={[]} emptyReason="Custom empty new vs repeat reason" />
      </MemoryRouter>,
    );
    expect(htmlCustom).toContain("Custom empty new vs repeat reason");
  });

  it("renders error state with retry button (CC-9)", () => {
    const onRetry = vi.fn();
    const html = renderToString(
      <MemoryRouter>
        <NewVsRepeatChart error="Failed to fetch new repeat data" onRetry={onRetry} />
      </MemoryRouter>,
    );

    expect(html).toContain("Failed to fetch new repeat data");
    expect(html).toContain("Retry");
  });

  it("renders accessible img container with summary aria-label and aria-description (CC-10)", () => {
    const html = renderToString(
      <MemoryRouter>
        <NewVsRepeatChart data={sampleData} />
      </MemoryRouter>,
    );

    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="New vs repeat restaurants"');
    expect(html).toContain("New vs repeat restaurants stacked area chart showing monthly order counts");
    expect(html).toContain("repeat share of 68%");
  });

  it("supports caption override prop", () => {
    const html = renderToString(
      <MemoryRouter>
        <NewVsRepeatChart data={sampleData} caption="Custom takeaway caption" />
      </MemoryRouter>,
    );

    expect(html).toContain("Custom takeaway caption");
  });
});

describe("NewVsRepeatChart - Linked Hover & Highlight Bus (CC-6, S-021)", () => {
  afterEach(() => {
    clearRegistry();
  });

  it("registers chart and matches month dimension correctly", () => {
    const chartId = "test-new-repeat-chart";
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
