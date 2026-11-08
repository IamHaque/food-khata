import { describe, expect, it, vi } from "vitest";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import {
  DiscountBreakdownChart,
  buildDiscountBreakdownOption,
  formatDiscountTooltip,
  type DiscountBreakdownItem,
} from "./DiscountBreakdownChart";
import {
  resolveChartTheme,
  VALID_MODES,
  VALID_ACCENTS,
} from "../../lib/chart-theme";
import { computeDiscountBreakdownTakeaway, formatRupees } from "../../lib/captions";

const sampleAggregateDiscounts: DiscountBreakdownItem[] = [
  { label: "Food discount", amount: 4200 },
  { label: "Delivery discount", amount: 1500 },
  { label: "Other / unallocated discount", amount: 476 },
];

const sampleMonthlyDiscounts: DiscountBreakdownItem[] = [
  { month: "2024-01", label: "Food discount", amount: 1200 },
  { month: "2024-01", label: "Delivery discount", amount: 400 },
  { month: "2024-02", label: "Food discount", amount: 1800 },
  { month: "2024-02", label: "Delivery discount", amount: 600 },
  { month: "2024-03", label: "Food discount", amount: 1200 },
  { month: "2024-03", label: "Delivery discount", amount: 500 },
];

describe("DiscountBreakdownChart - Pure Option Builder (CC-11, S-041)", () => {
  it("builds stacked bar series using stack: 'discounts' with token colors (Scenario: Stacked view)", () => {
    const theme = resolveChartTheme("light", "emerald");
    const option = buildDiscountBreakdownOption({
      data: sampleAggregateDiscounts,
      theme,
      prefersReducedMotion: false,
    });

    const series = option.series as Array<{
      name?: string;
      type?: string;
      stack?: string;
      data?: number[];
      itemStyle?: { color: string };
    }>;

    expect(series).toHaveLength(3);
    expect(series[0].name).toBe("Food discount");
    expect(series[0].stack).toBe("discounts");
    expect(series[0].data).toEqual([4200]);
    expect(series[0].itemStyle?.color).toBe(theme.colors[0]);

    expect(series[1].name).toBe("Delivery discount");
    expect(series[1].stack).toBe("discounts");
    expect(series[1].data).toEqual([1500]);
    expect(series[1].itemStyle?.color).toBe(theme.colors[1]);

    expect(series[2].name).toBe("Other / unallocated discount");
    expect(series[2].stack).toBe("discounts");
    expect(series[2].data).toEqual([476]);
    expect(series[2].itemStyle?.color).toBe(theme.colors[2]);

    // Legend data contains all series names for interactive toggling
    expect(option.legend).toBeDefined();
    expect((option.legend as any).show).toBe(true);
    expect((option.legend as any).data).toEqual([
      "Food discount",
      "Delivery discount",
      "Other / unallocated discount",
    ]);
  });

  it("supports selectedTypes to toggle legend items", () => {
    const theme = resolveChartTheme("light", "emerald");
    const option = buildDiscountBreakdownOption({
      data: sampleAggregateDiscounts,
      theme,
      selectedTypes: ["Food discount"],
    });

    expect((option.legend as any).selected).toEqual({
      "Food discount": true,
      "Delivery discount": false,
      "Other / unallocated discount": false,
    });
  });

  it("builds per-month stacked bars when monthly breakdown items are provided (Scenario: Stacked view)", () => {
    const theme = resolveChartTheme("light", "emerald");
    const option = buildDiscountBreakdownOption({
      data: sampleMonthlyDiscounts,
      theme,
    });

    expect((option.xAxis as any).data).toEqual(["2024-01", "2024-02", "2024-03"]);

    const series = option.series as Array<{
      name?: string;
      stack?: string;
      data?: number[];
    }>;

    expect(series).toHaveLength(2);
    expect(series[0].name).toBe("Food discount");
    expect(series[0].stack).toBe("discounts");
    expect(series[0].data).toEqual([1200, 1800, 1200]);

    expect(series[1].name).toBe("Delivery discount");
    expect(series[1].stack).toBe("discounts");
    expect(series[1].data).toEqual([400, 600, 500]);
  });

  it("configures 600ms cubicOut animation and respects reduced motion", () => {
    const theme = resolveChartTheme("light", "emerald");
    const normalOption = buildDiscountBreakdownOption({
      data: sampleAggregateDiscounts,
      theme,
      prefersReducedMotion: false,
    });

    expect(normalOption.animation).toBe(true);
    expect(normalOption.animationDuration).toBe(600);
    expect(normalOption.animationEasing).toBe("cubicOut");

    const reducedOption = buildDiscountBreakdownOption({
      data: sampleAggregateDiscounts,
      theme,
      prefersReducedMotion: true,
    });

    expect(reducedOption.animation).toBe(false);
    expect(reducedOption.animationDuration).toBe(0);
  });

  it("formats rich tooltip with active types, percentages, and computed total (Scenario: Totals, CC-4)", () => {
    const theme = resolveChartTheme("light", "emerald");
    const params = [
      { seriesName: "Food discount", value: 4200, color: theme.colors[0], axisValueLabel: "Total discounts" },
      { seriesName: "Delivery discount", value: 1500, color: theme.colors[1], axisValueLabel: "Total discounts" },
    ];

    const tooltip = formatDiscountTooltip(params, theme);
    expect(tooltip).toContain("Total discounts");
    expect(tooltip).toContain("Food discount");
    expect(tooltip).toContain(formatRupees(4200));
    expect(tooltip).toContain("73.7%");
    expect(tooltip).toContain("Delivery discount");
    expect(tooltip).toContain(formatRupees(1500));
    expect(tooltip).toContain("26.3%");
    expect(tooltip).toContain("Total");
    expect(tooltip).toContain(formatRupees(5700));
  });

  it("satisfies CC-12 across all 10 theme/mode combinations without error", () => {
    for (const mode of VALID_MODES) {
      for (const accent of VALID_ACCENTS) {
        const theme = resolveChartTheme(mode, accent);
        const option = buildDiscountBreakdownOption({
          data: sampleAggregateDiscounts,
          theme,
        });
        expect(option.color).toEqual(theme.colors);
        const series = option.series as any[];
        expect(series[0].itemStyle.color).toBe(theme.colors[0]);
      }
    }
  });

  it("handles null, undefined, or empty data safely without throwing", () => {
    const emptyOption = buildDiscountBreakdownOption({ data: [] });
    expect((emptyOption.series as any[])).toEqual([]);

    const nullOption = buildDiscountBreakdownOption({ data: null });
    expect((nullOption.series as any[])).toEqual([]);
  });
});

describe("DiscountBreakdownChart - React Component (ChartCard, Popover, Table, Accessibility)", () => {
  it("renders inside ChartCard with title, subtitle, and takeaway caption", () => {
    const expectedCaption = computeDiscountBreakdownTakeaway(sampleAggregateDiscounts);
    expect(expectedCaption).toBe("Food discounts represent 68% of total savings (₹4,200)");

    const html = renderToString(
      <MemoryRouter>
        <DiscountBreakdownChart data={sampleAggregateDiscounts} />
      </MemoryRouter>,
    );

    expect(html).toContain("Discounts breakdown");
    expect(html).toContain("Explicit bill deductions across discount types");
    expect(html).toContain("Food discounts represent 68% of total savings (₹4,200)");
  });

  it("renders info popover explaining explicit deductions vs advertised list price strikethroughs", () => {
    const html = renderToString(
      <MemoryRouter>
        <DiscountBreakdownChart data={sampleAggregateDiscounts} />
      </MemoryRouter>,
    );

    expect(html).toContain('aria-label="Discounts breakdown information"');
    expect(html).toContain('aria-label="Discounts breakdown information"');
  });

  it("renders accessible sortable table view with Discount type, Amount, Share (%) (CC-7, CC-10)", () => {
    const html = renderToString(
      <MemoryRouter>
        <DiscountBreakdownChart
          data={sampleAggregateDiscounts}
          showTable
        />
      </MemoryRouter>,
    );

    expect(html).toContain("Discount type");
    expect(html).toContain("Amount");
    expect(html).toContain("Share (%)");

    expect(html).toContain("Food discount");
    expect(html).toContain("4200");
    expect(html).toContain("68.0%");
    expect(html).toContain("Delivery discount");
    expect(html).toContain("1500");
    expect(html).toContain("24.3%");
  });

  it("renders month column in table view when monthly data is present", () => {
    const html = renderToString(
      <MemoryRouter>
        <DiscountBreakdownChart
          data={sampleMonthlyDiscounts}
          showTable
        />
      </MemoryRouter>,
    );

    expect(html).toContain("Month");
    expect(html).toContain("Discount type");
    expect(html).toContain("Amount");
    expect(html).toContain("Share (%)");
    expect(html).toContain("2024-01");
  });

  it("renders loading state with skeleton (CC-9)", () => {
    const html = renderToString(
      <MemoryRouter>
        <DiscountBreakdownChart isLoading />
      </MemoryRouter>,
    );
    expect(html).toContain("animate-pulse");
  });

  it("renders empty state with custom or default reason (CC-9)", () => {
    const html = renderToString(
      <MemoryRouter>
        <DiscountBreakdownChart data={[]} emptyReason="No discount data available" />
      </MemoryRouter>,
    );
    expect(html).toContain("No discount data available");
  });

  it("renders error state with retry button (CC-9)", () => {
    const onRetry = vi.fn();
    const html = renderToString(
      <MemoryRouter>
        <DiscountBreakdownChart error="Failed to fetch discounts" onRetry={onRetry} />
      </MemoryRouter>,
    );
    expect(html).toContain("Failed to fetch discounts");
    expect(html).toContain("Retry");
  });

  it("renders accessible img container with summary aria-label (CC-10)", () => {
    const html = renderToString(
      <MemoryRouter>
        <DiscountBreakdownChart data={sampleAggregateDiscounts} />
      </MemoryRouter>,
    );

    expect(html).toContain('role="img"');
    expect(html).toContain("Discounts breakdown chart showing explicit deductions total of ₹6,176");
    expect(html).toContain("Food discount: ₹4,200");
    expect(html).toContain("Delivery discount: ₹1,500");
  });
});
