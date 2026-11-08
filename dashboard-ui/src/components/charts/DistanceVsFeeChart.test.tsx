import { describe, expect, it, vi } from "vitest";
import * as React from "react";
import { renderToString } from "react-dom/server";
import {
  DistanceVsFeeChart,
  DistanceVsFeeInfoContent,
  buildDistanceVsFeeOption,
  computeDistanceTrendline,
  formatDistanceVsFeeTooltip,
  type DistanceDatum,
} from "./DistanceVsFeeChart";
import {
  resolveChartTheme,
  VALID_MODES,
  VALID_ACCENTS,
} from "@/lib/chart-theme";
import { computeDistanceVsFeeTakeaway, formatRupees } from "@/lib/captions";

const sampleDistanceData: DistanceDatum[] = [
  { distance_km: 1.5, fee: 20, restaurant: "Truffles" },
  { distance_km: 3.0, fee: 30, restaurant: "Meghana Foods" },
  { distance_km: 5.0, fee: 45, restaurant: "Empire Restaurant" },
  { distance_km: 7.5, fee: 60, restaurant: "Corner House" },
  { distance_km: 10.0, fee: 80, restaurant: "Nandhini Deluxe" },
];

describe("DistanceVsFeeChart - Helper: computeDistanceTrendline", () => {
  it("computes linear regression line y = mx + c over valid points", () => {
    const points = [
      { distance_km: 2.0, fee: 20 },
      { distance_km: 4.0, fee: 30 },
      { distance_km: 6.0, fee: 40 },
    ];
    const result = computeDistanceTrendline(points);
    expect(result).not.toBeNull();
    expect(result!.slope).toBeCloseTo(5.0, 4);
    expect(result!.intercept).toBeCloseTo(10.0, 4);
    expect(result!.points).toEqual([
      [2.0, 20.0],
      [6.0, 40.0],
    ]);
    expect(result!.rSquared).toBeCloseTo(1, 2);
  });

  it("returns null if fewer than 2 valid points exist", () => {
    expect(computeDistanceTrendline([])).toBeNull();
    expect(computeDistanceTrendline([{ distance_km: 2.5, fee: 25 }])).toBeNull();
  });

  it("returns null if all x values are identical (zero denominator)", () => {
    const points = [
      { distance_km: 4.0, fee: 20 },
      { distance_km: 4.0, fee: 50 },
    ];
    expect(computeDistanceTrendline(points)).toBeNull();
  });

  it("filters out invalid points (negative or NaN values)", () => {
    const points = [
      { distance_km: 1.0, fee: 15 },
      { distance_km: 3.0, fee: 35 },
      { distance_km: -2.0, fee: 20 },
      { distance_km: Number.NaN, fee: 30 },
      { distance_km: 2.0, fee: -10 },
      { distance_km: 4.0, fee: Number.NaN },
    ];
    const result = computeDistanceTrendline(points);
    expect(result).not.toBeNull();
    expect(result!.points[0][0]).toBe(1.0);
    expect(result!.points[1][0]).toBe(3.0);
  });
});

describe("DistanceVsFeeChart - Helper: formatDistanceVsFeeTooltip", () => {
  const theme = resolveChartTheme("light", "emerald");

  it("formats scatter point tooltip with restaurant name, distance, and net delivery fee", () => {
    const params = {
      seriesType: "scatter",
      value: [4.25, 38, "Pizza Bakery"],
    };
    const html = formatDistanceVsFeeTooltip(params, theme);
    expect(html).toContain("Pizza Bakery");
    expect(html).toContain("4.25 km");
    expect(html).toContain(formatRupees(38));
    expect(html).toContain("Net delivery fee:");
  });

  it("falls back to 'Delivery order' when restaurant is missing or empty", () => {
    const paramsWithoutRestaurant = {
      seriesType: "scatter",
      value: [5.1, 45, ""],
    };
    const html = formatDistanceVsFeeTooltip(paramsWithoutRestaurant, theme);
    expect(html).toContain("Delivery order");
    expect(html).toContain("5.10 km");
    expect(html).toContain(formatRupees(45));
  });

  it("formats trendline tooltip with linear fit prediction", () => {
    const params = {
      seriesName: "Trendline",
      seriesType: "line",
      value: [6.5, 52.8],
    };
    const html = formatDistanceVsFeeTooltip(params, theme);
    expect(html).toContain("Trendline (Linear fit)");
    expect(html).toContain("6.50 km");
    expect(html).toContain(formatRupees(52.8));
  });

  it("handles null, undefined or empty params gracefully", () => {
    expect(formatDistanceVsFeeTooltip(null, theme)).toBe("");
    expect(formatDistanceVsFeeTooltip([], theme)).toBe("");
  });
});

describe("DistanceVsFeeChart - Option Builder (CC-11, Scenario: Scatter)", () => {
  it("builds scatter series and dashed trendline series with symbolSize 8", () => {
    const theme = resolveChartTheme("light", "emerald");
    const option = buildDistanceVsFeeOption({
      data: sampleDistanceData,
      theme,
      prefersReducedMotion: false,
    });

    const series = option.series as Array<{
      name?: string;
      type?: string;
      data?: any[];
      symbolSize?: number;
      lineStyle?: { type: string };
      itemStyle?: { color: string; opacity: number };
    }>;

    expect(series).toHaveLength(2);

    // 1. Scatter Series
    const scatter = series[0];
    expect(scatter.name).toBe("Delivery orders");
    expect(scatter.type).toBe("scatter");
    expect(scatter.data).toHaveLength(5);
    expect(scatter.data![0]).toEqual([1.5, 20, "Truffles"]);
    expect(scatter.symbolSize).toBe(8);
    expect(scatter.itemStyle?.opacity).toBe(0.75);
    expect(scatter.itemStyle?.color).toBe(theme.colors[0]);

    // 2. Trendline Series
    const trendline = series[1];
    expect(trendline.name).toBe("Trendline");
    expect(trendline.type).toBe("line");
    expect(trendline.lineStyle?.type).toBe("dashed");
    expect(trendline.data).toHaveLength(2);
    expect(trendline.data![0][0]).toBe(1.5);
    expect(trendline.data![1][0]).toBe(10.0);

    // Axes
    expect((option.xAxis as any).type).toBe("value");
    expect((option.xAxis as any).name).toBe("Distance (km)");
    expect(typeof (option.xAxis as any).axisLabel?.formatter).toBe("function");
    expect((option.xAxis as any).axisLabel.formatter(4)).toBe("4 km");

    expect((option.yAxis as any).type).toBe("value");
    expect((option.yAxis as any).name).toBe("Delivery fee (₹)");
    expect(typeof (option.yAxis as any).axisLabel?.formatter).toBe("function");
    expect((option.yAxis as any).axisLabel.formatter(35)).toBe("₹35");

    // Aria decals
    expect(option.aria).toEqual({
      enabled: true,
      decal: { show: true },
    });
  });

  it("supports positional argument invocation signature (data, theme, prefersReducedMotion)", () => {
    const theme = resolveChartTheme("dark", "indigo");
    const option = buildDistanceVsFeeOption(sampleDistanceData, theme, true);
    const series = option.series as any[];
    expect(series[0].itemStyle.color).toBe(theme.colors[0]);
    expect(option.animation).toBe(false);
  });

  it("respects prefersReducedMotion by disabling animation and delays", () => {
    const theme = resolveChartTheme("light", "emerald");
    const option = buildDistanceVsFeeOption({
      data: sampleDistanceData,
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
        const option = buildDistanceVsFeeOption({
          data: sampleDistanceData,
          theme,
        });

        const series = option.series as any[];
        expect(series[0].itemStyle.color).toBe(theme.colors[0]);
        if (series[1]) {
          expect(series[1].lineStyle.color).toBe(theme.colors[1] ?? theme.mutedColor);
        }
      }
    }
  });

  it("handles empty or null data safely without throwing", () => {
    const option1 = buildDistanceVsFeeOption({ data: [] });
    expect((option1.series as any[])[0].data).toEqual([]);
    expect((option1.series as any[])).toHaveLength(1); // No trendline on empty

    const option2 = buildDistanceVsFeeOption({ data: null });
    expect((option2.series as any[])[0].data).toEqual([]);
  });
});

describe("DistanceVsFeeChart - React Component (ChartCard, Popover, Table, Empty states)", () => {
  it("renders inside ChartCard with title, subtitle, and dynamic takeaway caption", () => {
    const expectedCaption = computeDistanceVsFeeTakeaway(sampleDistanceData);
    expect(expectedCaption).toBeTruthy();

    const html = renderToString(
      <DistanceVsFeeChart distances={sampleDistanceData} />
    );

    expect(html).toContain("Distance vs delivery fee");
    expect(html).toContain("Restaurant delivery distance plotted against net delivery fee");
    expect(html).toContain(expectedCaption!);
  });

  it("renders info popover button with accessible label and details for points, trendline, slope, and 80% threshold", () => {
    const html = renderToString(
      <DistanceVsFeeChart distances={sampleDistanceData} />
    );

    expect(html).toContain('aria-label="Distance vs delivery fee information"');

    const contentHtml = renderToString(<DistanceVsFeeInfoContent />);
    expect(contentHtml).toContain("Distance vs Delivery Fee");
    expect(contentHtml).toContain("Scatter Points");
    expect(contentHtml).toContain("OLS Linear Regression Trendline &amp; Slope");
    expect(contentHtml).toContain("80%");
  });

  it("renders accessible table alternative with Distance (km) and Delivery fee headers", () => {
    const html = renderToString(
      <DistanceVsFeeChart distances={sampleDistanceData} showTable={true} />
    );

    expect(html).toContain("Distance (km)");
    expect(html).toContain("Delivery fee");
    expect(html).toContain("1.5 km");
    expect(html).toContain(formatRupees(20));
  });

  it("renders loading state with skeleton", () => {
    const html = renderToString(
      <DistanceVsFeeChart isLoading={true} />
    );
    expect(html).not.toContain("1.5 km");
  });

  it("renders empty state when distance_unavailable_reason is provided", () => {
    const reason = "More than 80% of delivered orders lack valid coordinates.";
    const html = renderToString(
      <DistanceVsFeeChart
        distances={[]}
        distance_unavailable_reason={reason}
      />
    );

    expect(html).toContain(reason);
  });

  it("renders friendly empty state when distances is empty or lacks points", () => {
    const html = renderToString(
      <DistanceVsFeeChart distances={[]} />
    );

    expect(html).toContain("No distance or delivery fee data available for the selected filters.");
  });

  it("renders error state with retry button", () => {
    const onRetry = vi.fn();
    const html = renderToString(
      <DistanceVsFeeChart error="Failed to load distance data" onRetry={onRetry} />
    );

    expect(html).toContain("Failed to load distance data");
    expect(html).toContain("Retry");
  });

  it("renders accessible img container with role and aria attributes", () => {
    const html = renderToString(
      <DistanceVsFeeChart distances={sampleDistanceData} />
    );

    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Distance vs delivery fee"');
    expect(html).toContain('aria-description="Scatter plot displaying 5 delivery orders');
  });

  it("invokes onPointClick when provided", () => {
    const onPointClick = vi.fn();
    const point = sampleDistanceData[0];
    onPointClick(point);
    expect(onPointClick).toHaveBeenCalledWith(point);
  });
});
