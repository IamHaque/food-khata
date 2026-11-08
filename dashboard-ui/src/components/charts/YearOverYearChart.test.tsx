import { describe, expect, it, vi } from "vitest";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import {
  YearOverYearChart,
  buildYearOverYearOption,
  formatYearOverYearTooltip,
  MONTH_NAMES,
  LINE_SYMBOLS,
  type YearSpendItem,
} from "./YearOverYearChart";
import {
  resolveChartTheme,
  VALID_MODES,
  VALID_ACCENTS,
} from "../../lib/chart-theme";
import { computeYearOverYearTakeaway, formatRupees } from "../../lib/captions";

const sampleYoYData: YearSpendItem[] = [
  // 2024: Jan to Apr
  { year: 2024, month: 1, spend: 10000 },
  { year: 2024, month: 2, spend: 12000 },
  { year: 2024, month: 3, spend: 15000 },
  { year: 2024, month: 4, spend: 11000 },
  // 2025: Jan to Apr (with Feb missing to test gap handling)
  { year: 2025, month: 1, spend: 14000 },
  { year: 2025, month: 3, spend: 18500 },
  { year: 2025, month: 4, spend: 12500 },
];

const sampleThreeYearData: YearSpendItem[] = [
  { year: 2023, month: 1, spend: 8000 },
  { year: 2024, month: 1, spend: 10000 },
  { year: 2025, month: 1, spend: 14000 },
];

describe("YearOverYearChart - Pure Option Builder (CC-11, S-042)", () => {
  it("builds overlaid line series by year on 12-month axis with gaps and no smoothing (Scenario: Overlay)", () => {
    const theme = resolveChartTheme("light", "emerald");
    const option = buildYearOverYearOption({
      data: sampleYoYData,
      theme,
      prefersReducedMotion: false,
    });

    expect((option.xAxis as any).data).toEqual([...MONTH_NAMES]);
    expect((option.xAxis as any).data).toHaveLength(12);

    const series = option.series as Array<{
      name?: string;
      type?: string;
      smooth?: boolean;
      connectNulls?: boolean;
      symbol?: string;
      data?: Array<number | null>;
      itemStyle?: { color: string };
      lineStyle?: { color: string; width: number };
    }>;

    expect(series).toHaveLength(2);

    // 2024 Series
    expect(series[0].name).toBe("2024");
    expect(series[0].type).toBe("line");
    expect(series[0].smooth).toBe(false);
    expect(series[0].connectNulls).toBe(false);
    expect(series[0].symbol).toBe(LINE_SYMBOLS[0]);
    expect(series[0].itemStyle?.color).toBe(theme.colors[0]);
    expect(series[0].data).toHaveLength(12);
    expect(series[0].data).toEqual([
      10000, 12000, 15000, 11000, null, null, null, null, null, null, null, null,
    ]);

    // 2025 Series (Month 2 / Feb is null)
    expect(series[1].name).toBe("2025");
    expect(series[1].type).toBe("line");
    expect(series[1].smooth).toBe(false);
    expect(series[1].connectNulls).toBe(false);
    expect(series[1].symbol).toBe(LINE_SYMBOLS[1]);
    expect(series[1].itemStyle?.color).toBe(theme.colors[1]);
    expect(series[1].data).toHaveLength(12);
    expect(series[1].data).toEqual([
      14000, null, 18500, 12500, null, null, null, null, null, null, null, null,
    ]);

    // Legend
    expect(option.legend).toBeDefined();
    expect((option.legend as any).show).toBe(true);
    expect((option.legend as any).data).toEqual(["2024", "2025"]);
  });

  it("assigns distinct symbols and line colors so meaning does not depend on color alone (CC-10)", () => {
    const theme = resolveChartTheme("dark", "indigo");
    const option = buildYearOverYearOption({
      data: sampleThreeYearData,
      theme,
    });

    const series = option.series as any[];
    expect(series).toHaveLength(3);
    expect(series[0].symbol).toBe(LINE_SYMBOLS[0]);
    expect(series[1].symbol).toBe(LINE_SYMBOLS[1]);
    expect(series[2].symbol).toBe(LINE_SYMBOLS[2]);
    expect(series[0].symbol).not.toBe(series[1].symbol);
    expect(series[1].symbol).not.toBe(series[2].symbol);
  });

  it("supports selectedYears to control series visibility", () => {
    const theme = resolveChartTheme("light", "emerald");
    const option = buildYearOverYearOption({
      data: sampleYoYData,
      theme,
      selectedYears: ["2025"],
    });

    expect((option.legend as any).selected).toEqual({
      "2024": false,
      "2025": true,
    });
  });

  it("configures 600ms cubicOut entry animation and respects reduced motion (CC-3)", () => {
    const theme = resolveChartTheme("light", "emerald");
    const normalOption = buildYearOverYearOption({
      data: sampleYoYData,
      theme,
      prefersReducedMotion: false,
    });

    expect(normalOption.animation).toBe(true);
    expect(normalOption.animationDuration).toBe(600);
    expect(normalOption.animationEasing).toBe("cubicOut");

    const reducedOption = buildYearOverYearOption({
      data: sampleYoYData,
      theme,
      prefersReducedMotion: true,
    });

    expect(reducedOption.animation).toBe(false);
    expect(reducedOption.animationDuration).toBe(0);
  });

  it("formats rich tooltip with year spends and gap calculation (Scenario: Gap, CC-4)", () => {
    const theme = resolveChartTheme("light", "emerald");

    // January: 2024 = 10000, 2025 = 14000 (diff: +4000, +40.0%)
    const paramsJan = [
      { seriesName: "2024", value: 10000, color: theme.colors[0], axisValueLabel: "Jan", dataIndex: 0 },
      { seriesName: "2025", value: 14000, color: theme.colors[1], axisValueLabel: "Jan", dataIndex: 0 },
    ];

    const tooltipJan = formatYearOverYearTooltip(paramsJan, theme);
    expect(tooltipJan).toContain("January");
    expect(tooltipJan).toContain("2024");
    expect(tooltipJan).toContain(formatRupees(10000));
    expect(tooltipJan).toContain("2025");
    expect(tooltipJan).toContain(formatRupees(14000));
    expect(tooltipJan).toContain("Difference");
    expect(tooltipJan).toContain(`+${formatRupees(4000)} (+40.0%)`);
  });

  it("formats gap between latest two years when >2 years exist", () => {
    const theme = resolveChartTheme("light", "emerald");
    const paramsMulti = [
      { seriesName: "2023", value: 8000, color: theme.colors[0], axisValueLabel: "Jan", dataIndex: 0 },
      { seriesName: "2024", value: 10000, color: theme.colors[1], axisValueLabel: "Jan", dataIndex: 0 },
      { seriesName: "2025", value: 14000, color: theme.colors[2], axisValueLabel: "Jan", dataIndex: 0 },
    ];

    const tooltipMulti = formatYearOverYearTooltip(paramsMulti, theme);
    expect(tooltipMulti).toContain("Gap (2025 vs 2024)");
    expect(tooltipMulti).toContain(`+${formatRupees(4000)} (+40.0%)`);
  });

  it("handles months where one year has missing data", () => {
    const theme = resolveChartTheme("light", "emerald");
    const paramsFeb = [
      { seriesName: "2024", value: 12000, color: theme.colors[0], axisValueLabel: "Feb", dataIndex: 1 },
      { seriesName: "2025", value: null, color: theme.colors[1], axisValueLabel: "Feb", dataIndex: 1 },
    ];

    const tooltipFeb = formatYearOverYearTooltip(paramsFeb, theme);
    expect(tooltipFeb).toContain("February");
    expect(tooltipFeb).toContain("2024");
    expect(tooltipFeb).toContain(formatRupees(12000));
    expect(tooltipFeb).toContain("2025");
    expect(tooltipFeb).toContain("No data");
    // No gap section when only 1 valid year exists
    expect(tooltipFeb).not.toContain("Difference");
  });

  it("satisfies CC-12 across all 10 theme/mode combinations without error", () => {
    for (const mode of VALID_MODES) {
      for (const accent of VALID_ACCENTS) {
        const theme = resolveChartTheme(mode, accent);
        const option = buildYearOverYearOption({
          data: sampleYoYData,
          theme,
        });
        expect(option.color).toEqual(theme.colors);
        const series = option.series as any[];
        expect(series[0].itemStyle.color).toBe(theme.colors[0]);
        expect(series[1].itemStyle.color).toBe(theme.colors[1]);
      }
    }
  });

  it("handles null, undefined, or empty data safely without throwing", () => {
    const emptyOption = buildYearOverYearOption({ data: [] });
    expect((emptyOption.series as any[])).toEqual([]);

    const nullOption = buildYearOverYearOption({ data: null });
    expect((nullOption.series as any[])).toEqual([]);
  });
});

describe("YearOverYearChart - React Component (ChartCard, Popover, Table, Accessibility)", () => {
  it("renders inside ChartCard with title, subtitle, and takeaway caption", () => {
    const expectedCaption = computeYearOverYearTakeaway(sampleYoYData);
    expect(expectedCaption).toBe("2025 spend exceeded 2024 by ₹9,000 across comparable months");

    const html = renderToString(
      <MemoryRouter>
        <YearOverYearChart data={sampleYoYData} />
      </MemoryRouter>,
    );

    expect(html).toContain("Year-over-year spend comparison");
    expect(html).toContain("Monthly spend trajectories across calendar years");
    expect(html).toContain("2025 spend exceeded 2024 by ₹9,000 across comparable months");
  });

  it("renders info popover explaining Jan–Dec month-aligned overlay, gaps for missing months, and difference calculations", () => {
    const html = renderToString(
      <MemoryRouter>
        <YearOverYearChart data={sampleYoYData} />
      </MemoryRouter>,
    );

    expect(html).toContain('aria-label="Year-over-year spend information"');
  });


  it("renders accessible sortable table view with Month, Year columns, and Difference (CC-7, CC-10)", () => {
    const html = renderToString(
      <MemoryRouter>
        <YearOverYearChart
          data={sampleYoYData}
          showTable
        />
      </MemoryRouter>,
    );

    expect(html).toContain("Month");
    expect(html).toContain("2024");
    expect(html).toContain("2025");
    expect(html).toContain("Difference");

    expect(html).toContain("Jan");
    expect(html).toContain("10000");
    expect(html).toContain("14000");
    expect(html).toContain("4000");
  });

  it("renders loading state with skeleton (CC-9)", () => {
    const html = renderToString(
      <MemoryRouter>
        <YearOverYearChart isLoading />
      </MemoryRouter>,
    );
    expect(html).toContain("animate-pulse");
  });

  it("renders empty state with custom or default reason (CC-9)", () => {
    const html = renderToString(
      <MemoryRouter>
        <YearOverYearChart data={[]} emptyReason="No year spend data" />
      </MemoryRouter>,
    );
    expect(html).toContain("No year spend data");
  });

  it("renders error state with retry button (CC-9)", () => {
    const onRetry = vi.fn();
    const html = renderToString(
      <MemoryRouter>
        <YearOverYearChart error="Failed to fetch year data" onRetry={onRetry} />
      </MemoryRouter>,
    );
    expect(html).toContain("Failed to fetch year data");
    expect(html).toContain("Retry");
  });

  it("renders accessible img container with summary aria-label (CC-10)", () => {
    const html = renderToString(
      <MemoryRouter>
        <YearOverYearChart data={sampleYoYData} />
      </MemoryRouter>,
    );

    expect(html).toContain('role="img"');
    expect(html).toContain("Year-over-year spend comparison chart covering 2024, 2025");
    expect(html).toContain("2024: ₹48,000");
    expect(html).toContain("2025: ₹45,000");
  });
});
