import { describe, expect, it, vi, afterEach } from "vitest";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import {
  DietSplitTrendChart,
  buildDietDonutOption,
  buildDietTrendOption,
  formatDietDonutTooltip,
  formatDietTrendTooltip,
  getDietColor,
  normalizeDietFilterValue,
  type DietSplitItem,
  type DietMonthlyItem,
} from "./DietSplitTrendChart";
import {
  resolveChartTheme,
  VALID_MODES,
  VALID_ACCENTS,
} from "../../lib/chart-theme";
import { computeDietTakeaway, formatRupees } from "../../lib/captions";
import { clearRegistry } from "../../lib/highlight-bus";

const sampleDietSplit: DietSplitItem[] = [
  { diet: "Veg", quantity: 72, item_lines: 15, line_total: 2500 },
  { diet: "Non-veg", quantity: 20, item_lines: 6, line_total: 1200 },
  { diet: "Unknown", quantity: 8, item_lines: 2, line_total: 400 },
];

const sampleDietMonthly: DietMonthlyItem[] = [
  { month: "2024-01", veg: 30, non_veg: 10, unknown: 2 },
  { month: "2024-02", veg: 42, non_veg: 10, unknown: 6 },
];

describe("DietSplitTrendChart - Color Resolution & Normalization", () => {
  it("resolves distinct semantic token colors for Veg, Non-veg, and Unknown across themes", () => {
    for (const mode of VALID_MODES) {
      for (const accent of VALID_ACCENTS) {
        const theme = resolveChartTheme(mode, accent);
        const vegColor = getDietColor("Veg", theme);
        const nonVegColor = getDietColor("Non-veg", theme);
        const unknownColor = getDietColor("Unknown", theme);

        expect(vegColor).toBeTruthy();
        expect(nonVegColor).toBeTruthy();
        expect(unknownColor).toBeTruthy();

        // Colors should be distinct
        expect(vegColor).not.toBe(nonVegColor);
        expect(vegColor).not.toBe(unknownColor);
        expect(nonVegColor).not.toBe(unknownColor);
      }
    }
  });

  it("normalizes dietary category strings to filter enum values", () => {
    expect(normalizeDietFilterValue("Veg")).toBe("veg");
    expect(normalizeDietFilterValue("veg")).toBe("veg");
    expect(normalizeDietFilterValue("Non-veg")).toBe("nonveg");
    expect(normalizeDietFilterValue("non_veg")).toBe("nonveg");
    expect(normalizeDietFilterValue("NonVeg")).toBe("nonveg");
    expect(normalizeDietFilterValue("Unknown")).toBe("unknown");
    expect(normalizeDietFilterValue("unknown")).toBe("unknown");
    expect(normalizeDietFilterValue("other")).toBe("all");
  });
});

describe("DietSplitTrendChart - Donut Option Builder (CC-11, S-053 Split)", () => {
  it("builds donut pie chart option with radius [50%, 75%] and center text summary", () => {
    const theme = resolveChartTheme("light", "emerald");
    const option = buildDietDonutOption({
      data: sampleDietSplit,
      theme,
      prefersReducedMotion: false,
    });

    // Series checks
    const series = (option.series as any[])[0];
    expect(series.type).toBe("pie");
    expect(series.radius).toEqual(["50%", "75%"]);
    expect(series.center).toEqual(["50%", "50%"]);
    expect(series.data).toHaveLength(3);

    // Data values & colors
    expect(series.data[0].name).toBe("Veg");
    expect(series.data[0].value).toBe(72);
    expect(series.data[0].itemStyle.color).toBe(getDietColor("Veg", theme));

    expect(series.data[1].name).toBe("Non-veg");
    expect(series.data[1].value).toBe(20);

    expect(series.data[2].name).toBe("Unknown");
    expect(series.data[2].value).toBe(8);

    // Center title text
    const title = option.title as any;
    expect(title.text).toBe("100");
    expect(title.subtext).toBe("Total items");
    expect(title.left).toBe("center");
    expect(title.top).toBe("center");

    // Animation & Accessibility
    expect(option.animation).toBe(true);
    expect(option.animationDuration).toBe(600);
    expect(option.animationEasing).toBe("cubicOut");
    expect((option.aria as any).enabled).toBe(true);
  });

  it("bypasses animation when prefersReducedMotion is true", () => {
    const theme = resolveChartTheme("dark", "indigo");
    const option = buildDietDonutOption({
      data: sampleDietSplit,
      theme,
      prefersReducedMotion: true,
    });

    expect(option.animation).toBe(false);
    expect(option.animationDuration).toBe(0);
  });

  it("dims unselected categories when a category filter is active", () => {
    const theme = resolveChartTheme("light", "emerald");
    const option = buildDietDonutOption({
      data: sampleDietSplit,
      theme,
      selectedCategory: "veg",
    });

    const series = (option.series as any[])[0];
    const vegSlice = series.data.find((d: any) => d.name === "Veg");
    const nonVegSlice = series.data.find((d: any) => d.name === "Non-veg");
    const unknownSlice = series.data.find((d: any) => d.name === "Unknown");

    expect(vegSlice.itemStyle.opacity).toBe(1);
    expect(vegSlice.selected).toBe(true);
    expect(nonVegSlice.itemStyle.opacity).toBe(0.35);
    expect(nonVegSlice.selected).toBe(false);
    expect(unknownSlice.itemStyle.opacity).toBe(0.35);
  });
});

describe("DietSplitTrendChart - Trend Option Builder (CC-11, S-053 Trend)", () => {
  it("builds monthly stacked bar series with Veg, Non-veg, and Unknown progression", () => {
    const theme = resolveChartTheme("light", "emerald");
    const option = buildDietTrendOption({
      data: sampleDietMonthly,
      theme,
      prefersReducedMotion: false,
    });

    // X-Axis
    expect((option.xAxis as any).data).toEqual(["2024-01", "2024-02"]);

    // Stacked Series
    const series = option.series as any[];
    expect(series).toHaveLength(3);

    // Veg
    expect(series[0].name).toBe("Veg");
    expect(series[0].type).toBe("bar");
    expect(series[0].stack).toBe("diet");
    expect(series[0].data).toEqual([30, 42]);
    expect(series[0].itemStyle.color).toBe(getDietColor("Veg", theme));

    // Non-veg
    expect(series[1].name).toBe("Non-veg");
    expect(series[1].type).toBe("bar");
    expect(series[1].stack).toBe("diet");
    expect(series[1].data).toEqual([10, 10]);
    expect(series[1].itemStyle.color).toBe(getDietColor("Non-veg", theme));

    // Unknown
    expect(series[2].name).toBe("Unknown");
    expect(series[2].type).toBe("bar");
    expect(series[2].stack).toBe("diet");
    expect(series[2].data).toEqual([2, 6]);
    expect(series[2].itemStyle.color).toBe(getDietColor("Unknown", theme));

    // Legend
    expect((option.legend as any).data).toEqual(["Veg", "Non-veg", "Unknown"]);

    // Animation & Accessibility
    expect(option.animation).toBe(true);
    expect(option.animationDuration).toBe(600);
    expect(option.animationEasing).toBe("cubicOut");
  });

  it("bypasses trend animation when prefersReducedMotion is true", () => {
    const theme = resolveChartTheme("dark", "rose");
    const option = buildDietTrendOption({
      data: sampleDietMonthly,
      theme,
      prefersReducedMotion: true,
    });

    expect(option.animation).toBe(false);
    expect(option.animationDuration).toBe(0);
  });
});

describe("DietSplitTrendChart - Tooltip Formatters", () => {
  it("formats donut tooltip with quantity, item lines, spend, and share percentage", () => {
    const theme = resolveChartTheme("light", "emerald");
    const html = formatDietDonutTooltip(
      {
        name: "Veg",
        value: 72,
        color: theme.colors[0],
        data: sampleDietSplit[0],
      },
      100,
      theme,
    );

    expect(html).toContain("Veg");
    expect(html).toContain("Quantity:");
    expect(html).toContain("72");
    expect(html).toContain("Item lines:");
    expect(html).toContain("15");
    expect(html).toContain("Spend:");
    expect(html).toContain(formatRupees(2500));
    expect(html).toContain("Share:");
    expect(html).toContain("72.0%");
  });

  it("formats trend tooltip with month, all series breakdown, and total items", () => {
    const theme = resolveChartTheme("light", "emerald");
    const params = [
      { axisValueLabel: "2024-01", seriesName: "Veg", value: 30, color: theme.colors[0] },
      { axisValueLabel: "2024-01", seriesName: "Non-veg", value: 10, color: theme.colors[1] },
      { axisValueLabel: "2024-01", seriesName: "Unknown", value: 2, color: theme.colors[2] },
    ];
    const html = formatDietTrendTooltip(params, theme);

    expect(html).toContain("2024-01");
    expect(html).toContain("Veg:");
    expect(html).toContain("30");
    expect(html).toContain("Non-veg:");
    expect(html).toContain("10");
    expect(html).toContain("Unknown:");
    expect(html).toContain("2");
    expect(html).toContain("Total items:");
    expect(html).toContain("42");
  });

  it("returns empty string gracefully for invalid tooltip params", () => {
    const theme = resolveChartTheme("light", "emerald");
    expect(formatDietDonutTooltip(null, 100, theme)).toBe("");
    expect(formatDietTrendTooltip([], theme)).toBe("");
  });
});

describe("DietSplitTrendChart - React Component (ChartCard, SegmentedControl, Table, CC-1 to CC-12)", () => {
  afterEach(() => {
    clearRegistry();
  });

  it("renders inside ChartCard with title, subtitle, info popover, takeaway caption, and SegmentedControl", () => {
    const expectedCaption = computeDietTakeaway(sampleDietSplit);
    expect(expectedCaption).toBe("Veg items represent 72% of total order quantity");

    const html = renderToString(
      <MemoryRouter>
        <DietSplitTrendChart
          diet={sampleDietSplit}
          diet_monthly={sampleDietMonthly}
        />
      </MemoryRouter>,
    );

    // ChartCard Header & Popover
    expect(html).toContain("Dietary classification");
    expect(html).toContain("Veg, non-veg, and unknown split with monthly volume trend");
    expect(html).toContain(expectedCaption!);
    expect(html).toContain('aria-label="Dietary classification information"');

    // SegmentedControl buttons
    expect(html).toContain("Split");
    expect(html).toContain("Trend");

    // Accessibility attributes
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Dietary classification"');
    expect(html).toContain('aria-description="Dietary classification donut breakdown: Veg: 72 items, Non-veg: 20 items, Unknown: 8 items"');
  });

  it("supports custom caption override", () => {
    const html = renderToString(
      <MemoryRouter>
        <DietSplitTrendChart
          diet={sampleDietSplit}
          diet_monthly={sampleDietMonthly}
          caption="Custom dietary classification caption"
        />
      </MemoryRouter>,
    );
    expect(html).toContain("Custom dietary classification caption");
  });

  it("renders Trend view when defaultViewMode='trend'", () => {
    const html = renderToString(
      <MemoryRouter>
        <DietSplitTrendChart
          diet={sampleDietSplit}
          diet_monthly={sampleDietMonthly}
          defaultViewMode="trend"
        />
      </MemoryRouter>,
    );

    expect(html).toContain('aria-description="Monthly dietary volume trend across 2 months"');
  });

  it("renders accessible sortable table view in Split mode (CC-7, CC-10)", () => {
    const html = renderToString(
      <MemoryRouter>
        <DietSplitTrendChart
          diet={sampleDietSplit}
          diet_monthly={sampleDietMonthly}
          showTable={true}
        />
      </MemoryRouter>,
    );

    // Headers
    expect(html).toContain("Diet");
    expect(html).toContain("Quantity");
    expect(html).toContain("Item lines");
    expect(html).toContain("Line total");
    expect(html).toContain("Share (%)");

    // Row values
    expect(html).toContain("Veg");
    expect(html).toContain("72");
    expect(html).toContain("15");
    expect(html).toContain(formatRupees(2500));
    expect(html).toContain("72.0%");

    expect(html).toContain("Non-veg");
    expect(html).toContain("20");
    expect(html).toContain("6");
    expect(html).toContain(formatRupees(1200));
    expect(html).toContain("20.0%");
  });

  it("renders accessible sortable table view in Trend mode (CC-7, CC-10)", () => {
    const html = renderToString(
      <MemoryRouter>
        <DietSplitTrendChart
          diet={sampleDietSplit}
          diet_monthly={sampleDietMonthly}
          viewMode="trend"
          showTable={true}
        />
      </MemoryRouter>,
    );

    // Headers for monthly trend table
    expect(html).toContain("Month");
    expect(html).toContain("Veg");
    expect(html).toContain("Non-veg");
    expect(html).toContain("Unknown");
    expect(html).toContain("Total");

    // Row values
    expect(html).toContain("2024-01");
    expect(html).toContain("30");
    expect(html).toContain("10");
    expect(html).toContain("2");
    expect(html).toContain("42");
  });

  it("displays diet_unavailable_reason when present (Scenario: Unavailable, CC-9)", () => {
    const reason = "More than 80% of item lines lack dietary classification.";
    const html = renderToString(
      <MemoryRouter>
        <DietSplitTrendChart
          diet={sampleDietSplit}
          diet_monthly={sampleDietMonthly}
          diet_unavailable_reason={reason}
        />
      </MemoryRouter>,
    );

    expect(html).toContain(reason);
  });

  it("renders empty state when data is empty (CC-9)", () => {
    const html = renderToString(
      <MemoryRouter>
        <DietSplitTrendChart diet={[]} diet_monthly={[]} />
      </MemoryRouter>,
    );

    expect(html).toContain("No dietary data available.");
  });

  it("renders loading skeleton state (CC-9)", () => {
    const html = renderToString(
      <MemoryRouter>
        <DietSplitTrendChart isLoading={true} />
      </MemoryRouter>,
    );

    expect(html).toContain("Dietary classification");
    expect(html).toContain("animate-pulse");
  });

  it("renders error state with retry button (CC-9)", () => {
    const onRetry = vi.fn();
    const html = renderToString(
      <MemoryRouter>
        <DietSplitTrendChart
          error={new Error("Failed to load dietary breakdown")}
          onRetry={onRetry}
        />
      </MemoryRouter>,
    );

    expect(html).toContain("Failed to load dietary breakdown");
    expect(html).toContain("Retry");
  });
});
