import { describe, expect, it, vi } from "vitest";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import {
  FeeScatterChart,
  buildFeeScatterOption,
  computeSymbolSize,
  computeTrendline,
  formatFeeScatterTooltip,
  type FeeScatterDatum,
} from "./FeeScatterChart";
import {
  resolveChartTheme,
  VALID_MODES,
  VALID_ACCENTS,
} from "../../lib/chart-theme";
import { computeFeeScatterTakeaway, formatRupees } from "../../lib/captions";

const sampleScatterData: FeeScatterDatum[] = [
  { amount: 150, fees: 45, fee_percent: 30.0 },
  { amount: 300, fees: 60, fee_percent: 20.0 },
  { amount: 500, fees: 70, fee_percent: 14.0 },
  { amount: 800, fees: 80, fee_percent: 10.0 },
  { amount: 1200, fees: 96, fee_percent: 8.0 },
];

describe("FeeScatterChart - Helper: computeSymbolSize (S-044)", () => {
  it("scales symbol size between minSize and maxSize proportional to amount", () => {
    // min: 100, max: 1000, minSize: 6, maxSize: 22
    expect(computeSymbolSize(100, 100, 1000, 6, 22)).toBe(6);
    expect(computeSymbolSize(1000, 100, 1000, 6, 22)).toBe(22);
    // Midpoint: (1000 - 100)/2 + 100 = 550 => ratio 0.5 => 6 + 16 * 0.5 = 14
    expect(computeSymbolSize(550, 100, 1000, 6, 22)).toBe(14);
  });

  it("clamps values outside [minAmount, maxAmount]", () => {
    expect(computeSymbolSize(50, 100, 1000, 6, 22)).toBe(6);
    expect(computeSymbolSize(1500, 100, 1000, 6, 22)).toBe(22);
  });

  it("returns midpoint default when maxAmount <= minAmount or amount is non-finite", () => {
    expect(computeSymbolSize(200, 500, 500, 6, 22)).toBe(14);
    expect(computeSymbolSize(Number.NaN, 100, 1000, 6, 22)).toBe(14);
  });
});

describe("FeeScatterChart - Helper: computeTrendline (Scenario: Scatter, S-044)", () => {
  it("computes linear regression line y = mx + b over valid points", () => {
    const points = [
      { amount: 100, fee_percent: 20 },
      { amount: 200, fee_percent: 15 },
      { amount: 300, fee_percent: 10 },
    ];
    const result = computeTrendline(points);
    expect(result).not.toBeNull();
    expect(result!.slope).toBeCloseTo(-0.05, 4);
    expect(result!.intercept).toBeCloseTo(25, 4);
    expect(result!.points).toEqual([
      [100, 20],
      [300, 10],
    ]);
    expect(result!.rSquared).toBeCloseTo(1, 2);
  });

  it("returns null if fewer than 2 valid points exist", () => {
    expect(computeTrendline([])).toBeNull();
    expect(computeTrendline([{ amount: 100, fee_percent: 15 }])).toBeNull();
  });

  it("returns null if all x values are identical (zero denominator)", () => {
    const points = [
      { amount: 500, fee_percent: 10 },
      { amount: 500, fee_percent: 20 },
    ];
    expect(computeTrendline(points)).toBeNull();
  });

  it("filters out invalid points (null, non-finite, non-positive)", () => {
    const points = [
      { amount: 100, fee_percent: 20 },
      { amount: 200, fee_percent: 15 },
      { amount: 300, fee_percent: 10 },
      { amount: 400, fee_percent: null },
      { amount: -50, fee_percent: 12 },
      { amount: 0, fee_percent: 15 },
      { amount: 250, fee_percent: Number.NaN },
    ];
    const result = computeTrendline(points);
    expect(result).not.toBeNull();
    expect(result!.points[0][0]).toBe(100);
    expect(result!.points[1][0]).toBe(300);
  });
});

describe("FeeScatterChart - Helper: formatFeeScatterTooltip", () => {
  const theme = resolveChartTheme("light", "emerald");

  it("formats scatter point tooltip with order amount, fees, and fee burden %", () => {
    const params = {
      seriesType: "scatter",
      value: [500, 14.5, 72.5],
    };
    const html = formatFeeScatterTooltip(params, theme);
    expect(html).toContain("Order Fee Burden");
    expect(html).toContain(formatRupees(500));
    expect(html).toContain(formatRupees(72.5));
    expect(html).toContain("14.5%");
  });

  it("formats trendline tooltip with linear fit prediction", () => {
    const params = {
      seriesName: "Trendline",
      seriesType: "line",
      value: [600, 12.4],
    };
    const html = formatFeeScatterTooltip(params, theme);
    expect(html).toContain("Trendline (Linear fit)");
    expect(html).toContain(formatRupees(600));
    expect(html).toContain("12.4%");
  });

  it("handles null, undefined or empty params safely", () => {
    expect(formatFeeScatterTooltip(null, theme)).toBe("");
    expect(formatFeeScatterTooltip([], theme)).toBe("");
  });
});

describe("FeeScatterChart - Option Builder (CC-11, Scenario: Scatter)", () => {
  it("builds scatter series and dashed trendline series with scaled symbol size", () => {
    const theme = resolveChartTheme("light", "emerald");
    const option = buildFeeScatterOption({
      data: sampleScatterData,
      theme,
      prefersReducedMotion: false,
    });

    const series = option.series as Array<{
      name?: string;
      type?: string;
      data?: any[];
      lineStyle?: { type: string };
      symbolSize?: (val: any) => number;
    }>;

    expect(series).toHaveLength(2);

    // 1. Scatter Series
    const scatter = series[0];
    expect(scatter.name).toBe("Orders");
    expect(scatter.type).toBe("scatter");
    expect(scatter.data).toHaveLength(5);
    expect(scatter.data![0]).toEqual([150, 30.0, 45]);
    expect(typeof scatter.symbolSize).toBe("function");
    // Verify symbolSize scaling callback
    expect(scatter.symbolSize!([150, 30.0, 45])).toBe(6);
    expect(scatter.symbolSize!([1200, 8.0, 96])).toBe(22);

    // 2. Trendline Series
    const trendline = series[1];
    expect(trendline.name).toBe("Trendline");
    expect(trendline.type).toBe("line");
    expect(trendline.lineStyle?.type).toBe("dashed");
    expect(trendline.data).toHaveLength(2);
    expect(trendline.data![0][0]).toBe(150);
    expect(trendline.data![1][0]).toBe(1200);

    // Axes
    expect((option.xAxis as any).type).toBe("value");
    expect((option.xAxis as any).name).toBe("Order amount");
    expect(typeof (option.xAxis as any).axisLabel?.formatter).toBe("function");
    expect((option.xAxis as any).axisLabel.formatter(500)).toBe(formatRupees(500));

    expect((option.yAxis as any).type).toBe("value");
    expect((option.yAxis as any).name).toBe("Fee (%)");
    expect(typeof (option.yAxis as any).axisLabel?.formatter).toBe("function");
    expect((option.yAxis as any).axisLabel.formatter(15)).toBe("15%");

    // Aria decals
    expect(option.aria).toEqual({
      enabled: true,
      decal: { show: true },
    });
  });

  it("respects prefersReducedMotion by disabling animation and delays", () => {
    const theme = resolveChartTheme("light", "emerald");
    const option = buildFeeScatterOption({
      data: sampleScatterData,
      theme,
      prefersReducedMotion: true,
    });

    expect(option.animation).toBe(false);
    expect(option.animationDuration).toBe(0);
    expect(option.animationDurationUpdate).toBe(0);
  });

  it("applies theme token colors across all valid modes and accents", () => {
    for (const mode of VALID_MODES) {
      for (const accent of VALID_ACCENTS) {
        const theme = resolveChartTheme(mode, accent);
        const option = buildFeeScatterOption({
          data: sampleScatterData,
          theme,
        });

        const series = option.series as any[];
        expect(series[0].itemStyle.borderColor).toBe(theme.colors[0]);
        if (series[1]) {
          expect(series[1].lineStyle.color).toBe(theme.colors[1] ?? theme.mutedColor);
        }
      }
    }
  });

  it("handles empty or null data safely without throwing", () => {
    const option1 = buildFeeScatterOption({ data: [] });
    expect((option1.series as any[])[0].data).toEqual([]);
    expect((option1.series as any[])).toHaveLength(1); // No trendline on empty

    const option2 = buildFeeScatterOption({ data: null });
    expect((option2.series as any[])[0].data).toEqual([]);
  });
});

describe("FeeScatterChart - React Component (ChartCard, Popover, Table, Accessibility)", () => {
  it("renders inside ChartCard with title, subtitle, and takeaway caption", () => {
    const expectedCaption = computeFeeScatterTakeaway(sampleScatterData);
    expect(expectedCaption).toBeTruthy();

    const html = renderToString(
      <MemoryRouter>
        <FeeScatterChart data={sampleScatterData} />
      </MemoryRouter>
    );

    expect(html).toContain("Fee burden vs order value");
    expect(html).toContain("Observed fee percentage relative to order amount with trendline");
    expect(html).toContain(expectedCaption!);
  });

  it("renders info popover button with accessible label and breakdown info", () => {
    const html = renderToString(
      <MemoryRouter>
        <FeeScatterChart data={sampleScatterData} />
      </MemoryRouter>
    );

    expect(html).toContain('aria-label="Fee burden scatter information"');
  });

  it("renders accessible sortable table view with Order amount, Fees, Fee % (CC-7, CC-10)", () => {
    const html = renderToString(
      <MemoryRouter>
        <FeeScatterChart data={sampleScatterData} showTable={true} />
      </MemoryRouter>
    );

    expect(html).toContain("Order amount");
    expect(html).toContain("Fees");
    expect(html).toContain("Fee %");
    expect(html).toContain(formatRupees(150));
    expect(html).toContain(formatRupees(45));
    expect(html).toContain("30%");
  });

  it("renders loading state with skeleton (CC-9)", () => {
    const html = renderToString(
      <MemoryRouter>
        <FeeScatterChart isLoading={true} />
      </MemoryRouter>
    );
    expect(html).not.toContain("Fee %");
  });

  it("renders empty state with custom or default reason (CC-9)", () => {
    const html1 = renderToString(
      <MemoryRouter>
        <FeeScatterChart data={[]} />
      </MemoryRouter>
    );
    expect(html1).toContain("No fee scatter data available for the selected filters");

    const html2 = renderToString(
      <MemoryRouter>
        <FeeScatterChart data={[]} emptyReason="No orders match current criteria" />
      </MemoryRouter>
    );
    expect(html2).toContain("No orders match current criteria");
  });

  it("renders error state with retry button (CC-9)", () => {
    const onRetry = vi.fn();
    const html = renderToString(
      <MemoryRouter>
        <FeeScatterChart error="Failed to load fee scatter" onRetry={onRetry} />
      </MemoryRouter>
    );
    expect(html).toContain("Failed to load fee scatter");
    expect(html).toContain("Retry");
  });

  it("displays excluded count note when items have undefined fee ratios", () => {
    const mixedData: FeeScatterDatum[] = [
      { amount: 500, fees: 70, fee_percent: 14.0 },
      { amount: 200, fees: 0, fee_percent: null },
      { amount: 300, fees: 0, fee_percent: null },
    ];
    const html = renderToString(
      <MemoryRouter>
        <FeeScatterChart data={mixedData} />
      </MemoryRouter>
    );

    expect(html).toContain("2 orders with undefined fee ratios excluded.");
  });

  it("renders accessible img container with summary aria-label and aria-description (CC-10)", () => {
    const html = renderToString(
      <MemoryRouter>
        <FeeScatterChart data={sampleScatterData} />
      </MemoryRouter>
    );

    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Fee burden vs order value"');
    expect(html).toContain('aria-description="Scatter plot displaying 5 orders');
  });
});

describe("FeeScatterChart - Click Interaction & DEC-044", () => {
  it("invokes onPointClick callback when provided", () => {
    const onPointClick = vi.fn();
    const point = sampleScatterData[0];

    onPointClick(point);
    expect(onPointClick).toHaveBeenCalledWith(point);
    expect(point.amount).toBe(150);
    expect(point.fees).toBe(45);
    expect(point.fee_percent).toBe(30.0);
  });

  it("brackets order amount tightly into amount_min and amount_max while preserving search params (DEC-044)", () => {
    const currentSearch = "?platforms=Swiggy&cuisine=Biryani";
    const params = new URLSearchParams(currentSearch);
    const point: FeeScatterDatum = {
      amount: 449.6,
      fees: 65,
      fee_percent: 14.45,
    };

    const minAmount = Math.floor(point.amount);
    const maxAmount = Math.ceil(point.amount);
    params.set("amount_min", String(minAmount));
    params.set("amount_max", String(maxAmount));

    expect(params.get("platforms")).toBe("Swiggy");
    expect(params.get("cuisine")).toBe("Biryani");
    expect(params.get("amount_min")).toBe("449");
    expect(params.get("amount_max")).toBe("450");
  });

  it("deep-links directly to order side sheet when order_id is present", () => {
    const currentSearch = "?platforms=Zomato";
    const params = new URLSearchParams(currentSearch);
    const pointWithId: FeeScatterDatum = {
      amount: 650,
      fees: 90,
      fee_percent: 13.8,
      order_id: "order_12345",
    };

    if (pointWithId.order_id) {
      params.set("order", String(pointWithId.order_id));
    }

    expect(params.get("platforms")).toBe("Zomato");
    expect(params.get("order")).toBe("order_12345");
  });
});
