import { describe, expect, it, vi, afterEach } from "vitest";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import {
  LoyaltyParetoChart,
  buildLoyaltyParetoOption,
  formatLoyaltyParetoTooltip,
  handleLoyaltyParetoClick,
  normalizeLoyaltyData,
  type LoyaltyParetoDatum,
} from "./LoyaltyParetoChart";
import {
  resolveChartTheme,
  VALID_MODES,
  VALID_ACCENTS,
} from "../../lib/chart-theme";
import { computeLoyaltyParetoTakeaway, formatRupees } from "../../lib/captions";
import {
  registerChart,
  getRegisteredChart,
  clearRegistry,
  isDimensionMatch,
} from "../../lib/highlight-bus";

const sampleLoyaltyData: LoyaltyParetoDatum[] = [
  { key: "rest_faasos", name: "Faasos", orders: 40, spend: 12000, aov: 300 },
  { key: "rest_behrouz", name: "Behrouz Biryani", orders: 20, spend: 10000, aov: 500 },
  { key: "rest_ovenstory", name: "Oven Story Pizza", orders: 15, spend: 6000, aov: 400 },
  { key: "rest_lunchbox", name: "Lunchbox", orders: 10, spend: 3000, aov: 300 },
  { key: "rest_firangi", name: "Firangi Bake", orders: 10, spend: 3500, aov: 350 },
  { key: "rest_sweettruth", name: "Sweet Truth", orders: 5, spend: 1500, aov: 300 },
];

describe("LoyaltyParetoChart - Data Normalization", () => {
  it("normalizes, filters zero/invalid orders, and sorts descending by orders", () => {
    const raw: LoyaltyParetoDatum[] = [
      { key: "r1", name: "Rest 1", orders: 5, spend: 1000 },
      { key: "r2", name: "Rest 2", orders: 25, spend: 5000 },
      { key: "r3", name: "Rest 3", orders: 0, spend: 0 },
      { key: "r4", name: "Rest 4", orders: -2, spend: 100 },
      { key: "r5", name: "", orders: 10, spend: 2000 },
    ];

    const { items, totalOrders } = normalizeLoyaltyData(raw);
    expect(items).toHaveLength(2);
    expect(items[0].key).toBe("r2");
    expect(items[0].orders).toBe(25);
    expect(items[1].key).toBe("r1");
    expect(items[1].orders).toBe(5);
    expect(totalOrders).toBe(30);
  });

  it("calculates AOV if missing or 0", () => {
    const raw: LoyaltyParetoDatum[] = [
      { key: "r1", name: "Rest 1", orders: 10, spend: 3000, aov: 0 },
    ];
    const { items } = normalizeLoyaltyData(raw);
    expect(items[0].aov).toBe(300);
  });

  it("handles empty or null inputs gracefully", () => {
    expect(normalizeLoyaltyData(null)).toEqual({ items: [], totalOrders: 0 });
    expect(normalizeLoyaltyData([])).toEqual({ items: [], totalOrders: 0 });
  });
});

describe("LoyaltyParetoChart - Option Builder (CC-11, S-052)", () => {
  it("draws horizontal bars with orders and cumulative percentage on two x-axes (Scenario: Pareto)", () => {
    const theme = resolveChartTheme("light", "emerald");
    const option = buildLoyaltyParetoOption({
      data: sampleLoyaltyData,
      theme,
      prefersReducedMotion: false,
    });

    // Category axis (vertical): ranked restaurant names, never rotated
    expect((option.yAxis as any).type).toBe("category");
    expect((option.yAxis as any).inverse).toBe(true);
    expect((option.yAxis as any).data).toEqual([
      "Faasos",
      "Behrouz Biryani",
      "Oven Story Pizza",
      "Lunchbox",
      "Firangi Bake",
      "Sweet Truth",
    ]);

    // Two value axes: orders (bottom), cumulative share (top)
    const xAxes = option.xAxis as any[];
    expect(xAxes).toHaveLength(2);
    expect(xAxes[0].name).toBe("Orders");
    expect(xAxes[0].min).toBe(0);
    expect(xAxes[0].position).toBe("bottom");
    expect(xAxes[1].min).toBe(0);
    expect(xAxes[1].max).toBe(100);
    expect(xAxes[1].position).toBe("top");
    expect(xAxes[1].axisLabel?.formatter).toBe("{value}%");
  });

  it("builds bar series using theme.colors[0] and line series using theme.colors[1]", () => {
    const theme = resolveChartTheme("light", "emerald");
    const option = buildLoyaltyParetoOption({
      data: sampleLoyaltyData,
      theme,
      prefersReducedMotion: false,
    });

    const series = option.series as any[];
    expect(series).toHaveLength(2);

    // Bar series
    const barSeries = series[0];
    expect(barSeries.type).toBe("bar");
    expect(barSeries.name).toBe("Orders");
    expect(barSeries.xAxisIndex).toBe(0);
    expect(barSeries.itemStyle?.color).toBe(theme.colors[0]);

    const barValues = barSeries.data.map((d: any) => d.value);
    expect(barValues).toEqual([40, 20, 15, 10, 10, 5]);

    // Line series
    const lineSeries = series[1];
    expect(lineSeries.type).toBe("line");
    expect(lineSeries.name).toBe("Cumulative %");
    expect(lineSeries.xAxisIndex).toBe(1);
    expect(lineSeries.itemStyle?.color).toBe(theme.colors[1]);
    expect(lineSeries.lineStyle?.color).toBe(theme.colors[1]);

    // Total orders: 40 + 20 + 15 + 10 + 10 + 5 = 100
    // Cum percentages: 40%, 60%, 75%, 85%, 95%, 100%
    const lineValues = lineSeries.data.map((d: any) => d.value);
    expect(lineValues).toEqual([40, 60, 75, 85, 95, 100]);
  });

  it("includes 80% Pareto horizontal dashed markLine on secondary Y-axis (Scenario: Pareto)", () => {
    const theme = resolveChartTheme("light", "emerald");
    const option = buildLoyaltyParetoOption({
      data: sampleLoyaltyData,
      theme,
    });

    const series = option.series as any[];
    const lineSeries = series[1];
    expect(lineSeries.markLine).toBeDefined();

    const markData = lineSeries.markLine.data;
    expect(markData).toHaveLength(1);
    expect(markData[0].name).toBe("80% Pareto");
    expect(markData[0].xAxis).toBe(80);
    expect(markData[0].lineStyle?.type).toBe("dashed");
    expect(markData[0].label?.formatter).toBe("80% Pareto");
  });

  it("enforces 600ms cubic-bezier entry animation and bypasses when prefersReducedMotion is true", () => {
    const theme = resolveChartTheme("light", "emerald");

    // Standard motion
    const optNormal = buildLoyaltyParetoOption({
      data: sampleLoyaltyData,
      theme,
      prefersReducedMotion: false,
    });
    expect(optNormal.animation).toBe(true);
    expect(optNormal.animationDuration).toBe(600);
    expect(optNormal.animationEasing).toBe("cubicOut");

    // Reduced motion
    const optReduced = buildLoyaltyParetoOption({
      data: sampleLoyaltyData,
      theme,
      prefersReducedMotion: true,
    });
    expect(optReduced.animation).toBe(false);
    expect(optReduced.animationDuration).toBe(0);
  });

  it("works across all theme modes and accents with valid token colors and no literals", () => {
    for (const mode of VALID_MODES) {
      for (const accent of VALID_ACCENTS) {
        const theme = resolveChartTheme(mode, accent);
        const option = buildLoyaltyParetoOption({
          data: sampleLoyaltyData,
          theme,
        });

        const series = option.series as any[];
        expect(series[0].itemStyle.color).toBe(theme.colors[0]);
        expect(series[1].itemStyle.color).toBe(theme.colors[1]);
        expect(option.legend).toBeDefined();
      }
    }
  });

  it("respects maxItems parameter to limit categories", () => {
    const theme = resolveChartTheme("light", "emerald");
    const option = buildLoyaltyParetoOption({
      data: sampleLoyaltyData,
      theme,
      maxItems: 3,
    });

    expect((option.yAxis as any).data).toHaveLength(3);
    expect((option.yAxis as any).data).toEqual(["Faasos", "Behrouz Biryani", "Oven Story Pizza"]);
  });

  it("handles empty data gracefully without throwing", () => {
    const theme = resolveChartTheme("light", "emerald");
    const option = buildLoyaltyParetoOption({
      data: [],
      theme,
    });

    expect((option.yAxis as any).data).toEqual([]);
    expect(option.series).toEqual([]);
  });
});

describe("LoyaltyParetoChart - Tooltip Formatter (CC-5, CC-6, S-021)", () => {
  it("formats rich tooltip with restaurant name, order count, total spend, AOV, and cumulative %", () => {
    const theme = resolveChartTheme("light", "emerald");

    const params = [
      {
        seriesType: "bar",
        seriesName: "Orders",
        value: 18,
        data: {
          restaurantName: "Faasos",
          orders: 18,
          spend: 5400,
          aov: 300,
          cumPercent: 42,
        },
      },
      {
        seriesType: "line",
        seriesName: "Cumulative %",
        value: 42,
      },
    ];

    const html = formatLoyaltyParetoTooltip(params, theme);

    expect(html).toContain("Faasos");
    expect(html).toContain("18 orders (cumulative 42%)");
    expect(html).toContain(formatRupees(5400));
    expect(html).toContain(formatRupees(300));
  });

  it("returns empty string on empty or null params", () => {
    const theme = resolveChartTheme("light", "emerald");
    expect(formatLoyaltyParetoTooltip(null, theme)).toBe("");
    expect(formatLoyaltyParetoTooltip([], theme)).toBe("");
  });
});

describe("LoyaltyParetoChart - Click to Filter (Scenario: Click, S-020)", () => {
  it("applies restaurant_ids: [item.key] filter patch via useFilters().update", () => {
    const updateSpy = vi.fn();
    const mockFilters = { update: updateSpy };

    const clicked = handleLoyaltyParetoClick(
      {
        dataIndex: 0,
        data: { restaurantKey: "rest_faasos", name: "Faasos" },
      },
      sampleLoyaltyData as any,
      mockFilters,
    );

    expect(clicked).toBe("rest_faasos");
    expect(updateSpy).toHaveBeenCalledWith({ restaurant_ids: ["rest_faasos"] });
  });

  it("calls optional onRestaurantClick callback when provided", () => {
    const updateSpy = vi.fn();
    const clickSpy = vi.fn();

    const clicked = handleLoyaltyParetoClick(
      {
        dataIndex: 1,
        data: { restaurantKey: "rest_behrouz", name: "Behrouz Biryani" },
      },
      sampleLoyaltyData as any,
      { update: updateSpy },
      clickSpy,
    );

    expect(clicked).toBe("rest_behrouz");
    expect(updateSpy).toHaveBeenCalledWith({ restaurant_ids: ["rest_behrouz"] });
    expect(clickSpy).toHaveBeenCalledWith("rest_behrouz", expect.anything());
  });

  it("returns null when params or restaurant identifier is missing", () => {
    expect(handleLoyaltyParetoClick(null, [])).toBeNull();
    expect(handleLoyaltyParetoClick({}, [])).toBeNull();
  });
});

describe("LoyaltyParetoChart - React Component (ChartCard, Popover, Table, CC-1 to CC-12)", () => {
  afterEach(() => {
    clearRegistry();
  });

  it("renders inside ChartCard with title, subtitle, info popover, and computed takeaway caption", () => {
    const expectedCaption = computeLoyaltyParetoTakeaway(sampleLoyaltyData);
    expect(expectedCaption).toBe("Top 4 restaurants account for 85% of all orders");

    const html = renderToString(
      <MemoryRouter>
        <LoyaltyParetoChart data={sampleLoyaltyData} />
      </MemoryRouter>,
    );

    expect(html).toContain("Restaurant loyalty");
    expect(html).toContain("Orders per restaurant, with the share of all orders they add up to.");
    expect(html).toContain(expectedCaption!);
    expect(html).toContain('aria-label="Loyalty Pareto information"');
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-description="Restaurant loyalty chart ranking 6 restaurants by order volume with cumulative order percentage and 80% reference threshold. Total orders: 100."');
  });

  it("supports custom caption override", () => {
    const html = renderToString(
      <MemoryRouter>
        <LoyaltyParetoChart
          data={sampleLoyaltyData}
          caption="Custom Pareto 80/20 insight"
        />
      </MemoryRouter>,
    );
    expect(html).toContain("Custom Pareto 80/20 insight");
  });

  it("renders accessible sortable table view with Restaurant, Orders, Spend, AOV, Cumulative % (CC-7, CC-10)", () => {
    const html = renderToString(
      <MemoryRouter>
        <LoyaltyParetoChart data={sampleLoyaltyData} showTable={true} />
      </MemoryRouter>,
    );

    expect(html).toContain("Restaurant");
    expect(html).toContain("Orders");
    expect(html).toContain("Spend");
    expect(html).toContain("AOV");
    expect(html).toContain("Cumulative %");

    expect(html).toContain("Faasos");
    expect(html).toContain("40");
    expect(html).toContain(formatRupees(12000));
    expect(html).toContain(formatRupees(300));
    expect(html).toContain("40%");

    expect(html).toContain("Behrouz Biryani");
    expect(html).toContain("60%");
  });

  it("renders loading skeleton state (CC-9)", () => {
    const html = renderToString(
      <MemoryRouter>
        <LoyaltyParetoChart isLoading={true} />
      </MemoryRouter>,
    );

    expect(html).toContain("Restaurant loyalty");
    expect(html).toContain("animate-pulse");
  });

  it("renders empty state with default and custom reason (CC-9)", () => {
    const htmlDefault = renderToString(
      <MemoryRouter>
        <LoyaltyParetoChart data={[]} />
      </MemoryRouter>,
    );
    expect(htmlDefault).toContain("No restaurant loyalty data available for the selected filters");

    const htmlCustom = renderToString(
      <MemoryRouter>
        <LoyaltyParetoChart
          data={[]}
          emptyReason="No loyalty records found for date filter"
        />
      </MemoryRouter>,
    );
    expect(htmlCustom).toContain("No loyalty records found for date filter");
  });

  it("renders error state with retry button (CC-9)", () => {
    const onRetry = vi.fn();
    const html = renderToString(
      <MemoryRouter>
        <LoyaltyParetoChart
          error={new Error("Failed to fetch loyalty data")}
          onRetry={onRetry}
        />
      </MemoryRouter>,
    );

    expect(html).toContain("Failed to fetch loyalty data");
    expect(html).toContain("Retry");
  });

  it("registers chart on restaurant dimension for linked hover bus (CC-6, S-021)", () => {
    const mockChart: any = {
      dispatchAction: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      isDisposed: vi.fn(() => false),
      resize: vi.fn(),
    };

    const unregister = registerChart("test-loyalty-chart", mockChart, {
      dimension: "restaurant",
      matcher: (dim, val) => {
        if (dim !== "restaurant") return false;
        const idx = sampleLoyaltyData.findIndex((d) => isDimensionMatch("restaurant", d.name!, val));
        return idx >= 0 ? { type: "highlight", dataIndex: idx } : undefined;
      },
    });

    const entry = getRegisteredChart("test-loyalty-chart");
    expect(entry).toBeDefined();
    expect(entry?.dimension).toBe("restaurant");

    // Matcher test
    const match = entry?.matcher?.("restaurant", "Faasos", mockChart);
    expect(match).toEqual({ type: "highlight", dataIndex: 0 });

    unregister();
    expect(getRegisteredChart("test-loyalty-chart")).toBeUndefined();
  });
});
