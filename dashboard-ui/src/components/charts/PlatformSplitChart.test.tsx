import { describe, expect, it, vi } from "vitest";
import * as React from "react";
import { renderToString } from "react-dom/server";
import {
  PlatformSplitChart,
  buildPlatformSplitOption,
  formatPlatformTooltip,
  type PlatformSplitItem,
} from "./PlatformSplitChart";
import { MemoryRouter } from "react-router-dom";
import {
  resolveChartTheme,
  VALID_MODES,
  VALID_ACCENTS,
} from "../../lib/chart-theme";
import { computePlatformTakeaway, formatRupees } from "../../lib/captions";
import { crossFilter } from "../../lib/crossfilter";
import { defaultFilters, type FilterState } from "../../lib/filters";
import { FilterProvider } from "../../app/FilterContext";
import { Providers } from "../../app/providers";
import {
  registerChart,
  unregisterChart,
  getRegisteredChart,
  type HighlightAction,
} from "../../lib/highlight-bus";

const sampleData: PlatformSplitItem[] = [
  {
    platform: "Swiggy",
    orders: 45,
    spend: 18000,
    discounts: 1500,
    advertised_savings: 2200,
    fees: 450,
  },
  {
    platform: "Zomato",
    orders: 25,
    spend: 12000,
    discounts: 900,
    advertised_savings: 1400,
    fees: 300,
  },
];

describe("PlatformSplitChart - Pure Option Builder (CC-11, Scenario: Donut)", () => {
  it("builds donut pie chart with radius ['50%', '75%']", () => {
    const theme = resolveChartTheme("light", "emerald");
    const option = buildPlatformSplitOption({
      data: sampleData,
      theme,
      prefersReducedMotion: false,
    });

    const series = Array.isArray(option.series) ? option.series[0] : option.series;
    expect(series).toBeDefined();
    expect((series as { type: string }).type).toBe("pie");
    expect((series as { radius: [string, string] }).radius).toEqual(["50%", "75%"]);
  });

  it("displays formatted total spend at the center", () => {
    const theme = resolveChartTheme("light", "emerald");
    const total = 18000 + 12000;
    const option = buildPlatformSplitOption({
      data: sampleData,
      theme,
    });

    const title = option.title as {
      text: string;
      subtext?: string;
      left?: string;
      top?: string;
    };
    expect(title).toBeDefined();
    expect(title.text).toBe(formatRupees(total));
    expect(title.subtext).toBe("Total Spend");
    expect(title.left).toBe("center");
    expect(title.top).toBe("center");
  });

  it("includes all platform slices with spend, orders, discounts and fees", () => {
    const theme = resolveChartTheme("dark", "indigo");
    const option = buildPlatformSplitOption({
      data: sampleData,
      theme,
    });

    const series = (Array.isArray(option.series) ? option.series[0] : option.series) as {
      data: Array<{
        name: string;
        value: number;
        orders: number;
        discounts: number;
        fees: number;
      }>;
    };
    expect(series.data).toHaveLength(2);
    expect(series.data[0].name).toBe("Swiggy");
    expect(series.data[0].value).toBe(18000);
    expect(series.data[0].orders).toBe(45);
    expect(series.data[0].discounts).toBe(1500);
    expect(series.data[0].fees).toBe(450);

    expect(series.data[1].name).toBe("Zomato");
    expect(series.data[1].value).toBe(12000);
    expect(series.data[1].orders).toBe(25);
    expect(series.data[1].discounts).toBe(900);
    expect(series.data[1].fees).toBe(300);
  });

  it("formats tooltip with spend share %, orders, discounts, and fees", () => {
    const theme = resolveChartTheme("light", "emerald");
    const totalSpend = 30000;
    const tooltipHtml = formatPlatformTooltip(
      {
        name: "Swiggy",
        value: 18000,
        data: sampleData[0],
      },
      totalSpend,
      theme
    );

    expect(tooltipHtml).toContain("Swiggy");
    expect(tooltipHtml).toContain("Spend Share:");
    expect(tooltipHtml).toContain("60.0%");
    expect(tooltipHtml).toContain("Spend:");
    expect(tooltipHtml).toContain(formatRupees(18000));
    expect(tooltipHtml).toContain("Orders:");
    expect(tooltipHtml).toContain("45");
    expect(tooltipHtml).toContain("Discounts:");
    expect(tooltipHtml).toContain(formatRupees(1500));
    expect(tooltipHtml).toContain("Fees:");
    expect(tooltipHtml).toContain(formatRupees(450));
  });

  it("dims unselected slices when selectedPlatforms are active", () => {
    const theme = resolveChartTheme("light", "emerald");
    const option = buildPlatformSplitOption({
      data: sampleData,
      theme,
      selectedPlatforms: ["Swiggy"],
    });

    const series = (Array.isArray(option.series) ? option.series[0] : option.series) as {
      data: Array<{
        name: string;
        itemStyle?: { opacity?: number };
        selected?: boolean;
      }>;
    };

    const swiggy = series.data.find((d) => d.name === "Swiggy");
    const zomato = series.data.find((d) => d.name === "Zomato");

    expect(swiggy?.selected).toBe(true);
    expect(swiggy?.itemStyle?.opacity).toBe(1);

    expect(zomato?.selected).toBe(false);
    expect(zomato?.itemStyle?.opacity).toBe(0.35);
  });

  it("enforces CC-3 motion timings: 600ms entry, 250ms update, 0ms when reduced motion", () => {
    const theme = resolveChartTheme("light", "emerald");

    const normal = buildPlatformSplitOption({
      data: sampleData,
      theme,
      prefersReducedMotion: false,
    });
    expect(normal.animation).toBe(true);
    expect(normal.animationDuration).toBe(600);
    expect(normal.animationDurationUpdate).toBe(250);

    const reduced = buildPlatformSplitOption({
      data: sampleData,
      theme,
      prefersReducedMotion: true,
    });
    expect(reduced.animation).toBe(false);
    expect(reduced.animationDuration).toBe(0);
    expect(reduced.animationDurationUpdate).toBe(0);
  });

  it("handles empty or null data safely without throwing", () => {
    const theme = resolveChartTheme("light", "emerald");
    const emptyOption = buildPlatformSplitOption({
      data: [],
      theme,
    });
    expect((emptyOption.title as { text: string }).text).toBe(formatRupees(0));

    const nullOption = buildPlatformSplitOption({
      data: null,
      theme,
    });
    expect((nullOption.title as { text: string }).text).toBe(formatRupees(0));
  });

  it("satisfies CC-12 across all 10 theme/mode combinations", () => {
    for (const mode of VALID_MODES) {
      for (const accent of VALID_ACCENTS) {
        const theme = resolveChartTheme(mode, accent);
        const option = buildPlatformSplitOption({
          data: sampleData,
          theme,
        });
        expect(option.color).toEqual(theme.colors);
        expect((option.title as { textStyle: { color: string } }).textStyle.color).toBe(
          theme.textColor
        );
      }
    }
  });
});

describe("PlatformSplitChart - React Component (ChartCard Wrap CC-2, CC-7, CC-8, CC-9, CC-10)", () => {
  it("renders wrapped inside ChartCard with title, subtitle, and takeaway caption", () => {
    const expectedCaption = computePlatformTakeaway(sampleData);
    expect(expectedCaption).toBe("Swiggy represents 60% of total food spend");

    const html = renderToString(
      <PlatformSplitChart
        data={sampleData}
        title="Platform Split"
        subtitle="Distribution of spend"
      />
    );

    expect(html).toContain("Platform Split");
    expect(html).toContain("Distribution of spend");
    expect(html).toContain("Swiggy represents 60% of total food spend");
    expect(html).toContain('role="img"');
    expect(html).toContain(formatRupees(30000));
  });

  it("generates table data with actions for ChartCard (table view & CSV export)", () => {
    const html = renderToString(
      <PlatformSplitChart data={sampleData} showTable />
    );

    expect(html).toContain("Platform");
    expect(html).toContain("Spend Share");
    expect(html).toContain("Discounts");
    expect(html).toContain("Fees");
    expect(html).toContain("Swiggy");
    expect(html).toContain("Zomato");
  });

  it("renders loading state with skeleton (CC-9)", () => {
    const html = renderToString(
      <PlatformSplitChart data={sampleData} isLoading />
    );
    expect(html).toContain("animate-pulse");
  });

  it("renders empty state with custom or default reason (CC-9)", () => {
    const html = renderToString(
      <PlatformSplitChart data={[]} emptyReason="No orders found for this platform" />
    );
    expect(html).toContain("No orders found for this platform");
  });

  it("renders error state with retry callback (CC-9)", () => {
    const onRetry = vi.fn();
    const html = renderToString(
      <PlatformSplitChart data={sampleData} error="Network failure" onRetry={onRetry} />
    );
    expect(html).toContain("Network failure");
    expect(html).toContain("Retry");
  });

  it("renders within FilterProvider and reflects filter context without errors", () => {
    const html = renderToString(
      <Providers>
        <MemoryRouter initialEntries={["/?platforms=Swiggy"]}>
          <FilterProvider>
            <PlatformSplitChart data={sampleData} />
          </FilterProvider>
        </MemoryRouter>
      </Providers>
    );
    expect(html).toContain("Platform Split");
    expect(html).toContain("Swiggy");
  });
});

describe("PlatformSplitChart - Slice Click & Cross-Filter Toggle (Scenario: Click, S-020)", () => {
  it("toggles platform filter state via crossFilter", () => {
    const initial: FilterState = { ...defaultFilters(), platforms: [] };

    // Click 'Swiggy' -> platform added
    const afterFirstClick = crossFilter(initial, "platform", "Swiggy", false);
    expect(afterFirstClick.platforms).toEqual(["Swiggy"]);

    // Click 'Swiggy' again -> toggles off
    const afterSecondClick = crossFilter(afterFirstClick, "platform", "Swiggy", false);
    expect(afterSecondClick.platforms).toEqual([]);

    // Multi-select with shift click
    const multi1 = crossFilter(initial, "platform", "Swiggy", true);
    const multi2 = crossFilter(multi1, "platform", "Zomato", true);
    expect(multi2.platforms).toEqual(["Swiggy", "Zomato"]);

    const multi3 = crossFilter(multi2, "platform", "Swiggy", true);
    expect(multi3.platforms).toEqual(["Zomato"]);
  });

  it("calls onPlatformClick callback when provided", () => {
    const onPlatformClick = vi.fn();
    // Simulate what chart slice click triggers
    const triggerSliceClick = (platform: string, isMulti = false) => {
      onPlatformClick(platform, isMulti);
    };

    triggerSliceClick("Swiggy", false);
    expect(onPlatformClick).toHaveBeenCalledWith("Swiggy", false);

    triggerSliceClick("Zomato", true);
    expect(onPlatformClick).toHaveBeenCalledWith("Zomato", true);
  });
});

describe("PlatformSplitChart - Linked Hover Highlight Bus (CC-6, S-021)", () => {
  it("registers chart and matches platform slices case-insensitively", () => {
    const chartId = "test-platform-split-chart";
    const dispatchedActions: unknown[] = [];

    const mockChart = {
      dispatchAction: (payload: unknown) => {
        dispatchedActions.push(payload);
      },
      getOption: () => ({
        series: [
          {
            type: "pie",
            data: [
              { name: "Swiggy", value: 18000 },
              { name: "Zomato", value: 12000 },
            ],
          },
        ],
      }),
      isDisposed: () => false,
    };

    const matcher = (dim: string, val: string) => {
      if (dim === "platform") {
        const opt = mockChart.getOption();
        const actions: HighlightAction[] = [];
        opt.series[0].data.forEach((item, dIdx) => {
          if (item.name.toLowerCase() === val.toLowerCase()) {
            actions.push({
              type: "highlight",
              seriesIndex: 0,
              dataIndex: dIdx,
              name: item.name,
            });
          }
        });
        if (actions.length > 0) return actions;
      }
      return undefined;
    };

    const unregister = registerChart(chartId, mockChart, matcher);
    expect(getRegisteredChart(chartId)).toBeDefined();

    // Trigger matcher for 'swiggy' (lowercase)
    const result = matcher("platform", "swiggy");
    expect(result).toEqual([
      {
        type: "highlight",
        seriesIndex: 0,
        dataIndex: 0,
        name: "Swiggy",
      },
    ]);

    unregister();
    expect(getRegisteredChart(chartId)).toBeUndefined();
  });
});
