import { describe, expect, it } from "vitest";
import * as React from "react";
import { renderToString } from "react-dom/server";
import {
  CumulativeSpendChart,
  buildCumulativeSpendOption,
  formatMilestoneLabel,
  formatCumulativeSpendTooltip,
  processCumulativeSpendData,
  DEFAULT_MILESTONE_STEP,
  type CumulativeSpendDatum,
} from "./CumulativeSpendChart";
import {
  resolveChartTheme,
  VALID_MODES,
  VALID_ACCENTS,
} from "../../lib/chart-theme";
import { computeCumulativeSpendTakeaway, formatRupees } from "../../lib/captions";

const sampleMonthlyData: CumulativeSpendDatum[] = [
  { month: "2024-01", spend: 6000, orders: 12 },
  { month: "2024-02", spend: 7000, orders: 14 }, // cumulative = 13000 -> crossed 10k
  { month: "2024-03", spend: 5000, orders: 10 }, // cumulative = 18000 -> none
  { month: "2024-04", spend: 14000, orders: 20 }, // cumulative = 32000 -> crossed 20k, 30k
  { month: "2024-05", spend: 3000, orders: 6 }, // cumulative = 35000 -> none
];

describe("CumulativeSpendChart - Helper: formatMilestoneLabel (S-045)", () => {
  it("formats round thousands as ₹Xk", () => {
    expect(formatMilestoneLabel(10000)).toBe("₹10k");
    expect(formatMilestoneLabel(20000)).toBe("₹20k");
    expect(formatMilestoneLabel(50000)).toBe("₹50k");
    expect(formatMilestoneLabel(100000)).toBe("₹100k");
    expect(formatMilestoneLabel(150000)).toBe("₹150k");
  });

  it("formats non-round amounts using formatRupees", () => {
    expect(formatMilestoneLabel(12500)).toBe(formatRupees(12500));
    expect(formatMilestoneLabel(0)).toBe(formatRupees(0));
  });
});

describe("CumulativeSpendChart - Helper: processCumulativeSpendData (S-045)", () => {
  it("computes running cumulative total and identifies milestone threshold crossings", () => {
    const processed = processCumulativeSpendData(sampleMonthlyData, DEFAULT_MILESTONE_STEP);
    expect(processed).toHaveLength(5);

    // Month 1: 6000
    expect(processed[0].label).toBe("2024-01");
    expect(processed[0].spend).toBe(6000);
    expect(processed[0].cumulative).toBe(6000);
    expect(processed[0].milestones).toEqual([]);

    // Month 2: 7000 -> cum 13000 -> crossed 10k
    expect(processed[1].label).toBe("2024-02");
    expect(processed[1].spend).toBe(7000);
    expect(processed[1].cumulative).toBe(13000);
    expect(processed[1].milestones).toEqual([10000]);

    // Month 3: 5000 -> cum 18000
    expect(processed[2].label).toBe("2024-03");
    expect(processed[2].spend).toBe(5000);
    expect(processed[2].cumulative).toBe(18000);
    expect(processed[2].milestones).toEqual([]);

    // Month 4: 14000 -> cum 32000 -> crossed 20k and 30k
    expect(processed[3].label).toBe("2024-04");
    expect(processed[3].spend).toBe(14000);
    expect(processed[3].cumulative).toBe(32000);
    expect(processed[3].milestones).toEqual([20000, 30000]);

    // Month 5: 3000 -> cum 35000
    expect(processed[4].label).toBe("2024-05");
    expect(processed[4].spend).toBe(3000);
    expect(processed[4].cumulative).toBe(35000);
    expect(processed[4].milestones).toEqual([]);
  });

  it("handles empty, null, or undefined data gracefully", () => {
    expect(processCumulativeSpendData(null)).toEqual([]);
    expect(processCumulativeSpendData(undefined)).toEqual([]);
    expect(processCumulativeSpendData([])).toEqual([]);
  });

  it("handles non-finite or negative values safely", () => {
    const raw: CumulativeSpendDatum[] = [
      { month: "2024-01", spend: Number.NaN },
      { month: "2024-02", spend: -100 },
      { month: "2024-03", spend: 10000 },
    ];
    const processed = processCumulativeSpendData(raw, 10000);
    expect(processed[0].spend).toBe(0);
    expect(processed[0].cumulative).toBe(0);
    expect(processed[1].spend).toBe(0);
    expect(processed[1].cumulative).toBe(0);
    expect(processed[2].spend).toBe(10000);
    expect(processed[2].cumulative).toBe(10000);
    expect(processed[2].milestones).toEqual([10000]);
  });

  it("supports amount and date aliases", () => {
    const raw: CumulativeSpendDatum[] = [
      { date: "2024-01", amount: 15000 },
    ];
    const processed = processCumulativeSpendData(raw, 10000);
    expect(processed[0].label).toBe("2024-01");
    expect(processed[0].spend).toBe(15000);
    expect(processed[0].cumulative).toBe(15000);
    expect(processed[0].milestones).toEqual([10000]);
  });
});

describe("CumulativeSpendChart - Helper: formatCumulativeSpendTooltip (CC-5, S-045)", () => {
  const theme = resolveChartTheme("light", "emerald");
  const processed = processCumulativeSpendData(sampleMonthlyData, 10000);

  it("formats tooltip with month, monthly spend, cumulative spend, and milestone indication", () => {
    const params = [
      {
        axisValueLabel: "2024-02",
        dataIndex: 1,
        value: 13000,
      },
    ];
    const html = formatCumulativeSpendTooltip(params, processed, theme);
    expect(html).toContain("2024-02");
    expect(html).toContain(formatRupees(7000));
    expect(html).toContain(formatRupees(13000));
    expect(html).toContain("Milestone reached");
    expect(html).toContain("₹10k");
  });

  it("omits milestone callout when no milestone was reached in that month", () => {
    const params = [
      {
        axisValueLabel: "2024-01",
        dataIndex: 0,
        value: 6000,
      },
    ];
    const html = formatCumulativeSpendTooltip(params, processed, theme);
    expect(html).toContain("2024-01");
    expect(html).toContain(formatRupees(6000));
    expect(html).not.toContain("Milestone reached");
  });

  it("handles multiple milestones reached in a single month", () => {
    const params = [
      {
        axisValueLabel: "2024-04",
        dataIndex: 3,
        value: 32000,
      },
    ];
    const html = formatCumulativeSpendTooltip(params, processed, theme);
    expect(html).toContain("2024-04");
    expect(html).toContain("₹20k, ₹30k");
  });

  it("handles null or empty params gracefully", () => {
    expect(formatCumulativeSpendTooltip(null, processed, theme)).toBe("");
    expect(formatCumulativeSpendTooltip([], processed, theme)).toBe("");
  });
});

describe("CumulativeSpendChart - Option Builder (CC-11, Scenario: Line, S-045)", () => {
  it("builds line series with 0.15 opacity area style and milestone markPoints", () => {
    const theme = resolveChartTheme("light", "emerald");
    const option = buildCumulativeSpendOption({
      data: sampleMonthlyData,
      theme,
      prefersReducedMotion: false,
    });

    const series = option.series as Array<{
      name?: string;
      type?: string;
      smooth?: boolean;
      data?: number[];
      areaStyle?: { opacity?: number; color?: string };
      lineStyle?: { color?: string; width?: number };
      markPoint?: {
        data?: Array<{ name: string; coord: [string, number]; value: string }>;
        itemStyle?: { color?: string };
      };
      animation?: boolean;
      animationDuration?: number;
      animationEasing?: string;
    }>;

    expect(series).toHaveLength(1);
    const lineSeries = series[0];
    expect(lineSeries.type).toBe("line");
    expect(lineSeries.smooth).toBe(true);
    expect(lineSeries.areaStyle?.opacity).toBe(0.15);
    expect(lineSeries.lineStyle?.color).toBe(theme.colors[0]);
    expect(lineSeries.areaStyle?.color).toBe(theme.colors[0]);
    expect(lineSeries.data).toEqual([6000, 13000, 18000, 32000, 35000]);

    // 3 milestones crossed: 10k (Month 2), 20k and 30k (Month 4)
    expect(lineSeries.markPoint?.data).toHaveLength(3);
    expect(lineSeries.markPoint?.data?.[0]).toEqual({
      name: "Milestone ₹10k",
      coord: ["2024-02", 13000],
      value: "₹10k",
    });
    expect(lineSeries.markPoint?.data?.[1]).toEqual({
      name: "Milestone ₹20k",
      coord: ["2024-04", 32000],
      value: "₹20k",
    });
    expect(lineSeries.markPoint?.data?.[2]).toEqual({
      name: "Milestone ₹30k",
      coord: ["2024-04", 32000],
      value: "₹30k",
    });
    expect(lineSeries.markPoint?.itemStyle?.color).toBe(theme.primary);

    // Animation: 600ms cubic bezier
    expect(lineSeries.animation).toBe(true);
    expect(lineSeries.animationDuration).toBe(600);
    expect(lineSeries.animationEasing).toBe("cubicOut");
  });

  it("disables animation when prefersReducedMotion is true", () => {
    const theme = resolveChartTheme("dark", "indigo");
    const option = buildCumulativeSpendOption({
      data: sampleMonthlyData,
      theme,
      prefersReducedMotion: true,
    });

    const series = (option.series as any[])[0];
    expect(series.animation).toBe(false);
    expect(series.animationDuration).toBe(0);
  });

  it("supports all 10 theme mode/accent permutations without throwing", () => {
    for (const mode of VALID_MODES) {
      for (const accent of VALID_ACCENTS) {
        const theme = resolveChartTheme(mode, accent);
        const option = buildCumulativeSpendOption({
          data: sampleMonthlyData,
          theme,
        });
        expect(option.series).toBeDefined();
      }
    }
  });
});

describe("CumulativeSpendChart - Component Rendering & ChartCard Integration (CC-1 to CC-12)", () => {
  it("renders ChartCard with title, subtitle, info popover, and role=img container", () => {
    const html = renderToString(
      <CumulativeSpendChart data={sampleMonthlyData} />
    );

    expect(html).toContain("Cumulative spend");
    expect(html).toContain("Running total of expenditures with milestone markers");
    expect(html).toContain('role="img"');
    expect(html).toContain("Cumulative spend: Running total of expenditures with milestone markers");
    expect(html).toContain("aria-label=\"Cumulative spend information\"");
  });

  it("renders sortable table view with Month, Spend, Cumulative total, and Milestone columns", () => {
    const html = renderToString(
      <CumulativeSpendChart data={sampleMonthlyData} showTable={true} />
    );

    expect(html).toContain("Month");
    expect(html).toContain("Spend");
    expect(html).toContain("Cumulative total");
    expect(html).toContain("Milestone");
    expect(html).toContain("2024-01");
    expect(html).toContain("2024-02");
    expect(html).toContain("₹10k");
    expect(html).toContain("₹20k, ₹30k");
  });

  it("renders loading state with skeleton pulse", () => {
    const html = renderToString(
      <CumulativeSpendChart isLoading={true} />
    );
    expect(html).toContain("animate-pulse");
  });

  it("renders empty state when data is empty or spend is all zero", () => {
    const htmlEmpty = renderToString(
      <CumulativeSpendChart data={[]} />
    );
    expect(htmlEmpty).toContain("No monthly spending data recorded");

    const htmlZero = renderToString(
      <CumulativeSpendChart data={[{ month: "2024-01", spend: 0 }]} />
    );
    expect(htmlZero).toContain("No monthly spending data recorded");
  });

  it("renders error state when error prop is supplied", () => {
    const html = renderToString(
      <CumulativeSpendChart error={new Error("Failed to load monthly spending")} />
    );
    expect(html).toContain("Failed to load monthly spending");
  });

  it("displays computed takeaway caption in ChartCard", () => {
    const html = renderToString(
      <CumulativeSpendChart data={sampleMonthlyData} />
    );
    const expectedCaption = computeCumulativeSpendTakeaway(sampleMonthlyData)!;
    expect(expectedCaption).toBe(
      "Total spend reached ₹35,000 across 5 months, crossing 3 milestones"
    );
    expect(html).toContain(expectedCaption);
  });

  it("allows custom caption override", () => {
    const html = renderToString(
      <CumulativeSpendChart
        data={sampleMonthlyData}
        caption="Custom cumulative takeaway caption"
      />
    );
    expect(html).toContain("Custom cumulative takeaway caption");
  });
});
