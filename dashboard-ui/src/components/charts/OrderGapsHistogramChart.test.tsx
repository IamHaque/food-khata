import { describe, expect, it } from "vitest";
import * as React from "react";
import { renderToString } from "react-dom/server";
import {
  bucketOrderGaps,
  buildOrderGapsHistogramOption,
  buildOrderGapsTableRows,
  formatOrderGapsTooltip,
  deriveGapsFromOrders,
  DEFAULT_ORDER_GAP_BINS,
  OrderGapsHistogramChart,
  OrderGapsInfoContent,
} from "./OrderGapsHistogramChart";
import {
  computeOrderGapsTakeaway,
  computeWeightedMedianGap,
} from "@/lib/captions";
import { resolveChartTheme } from "@/lib/chart-theme";

describe("bucketOrderGaps pure bucketing function", () => {
  it("creates standard 8 histogram bins covering all gap days", () => {
    const buckets = bucketOrderGaps([]);
    expect(buckets).toHaveLength(8);
    expect(buckets.map((b) => b.label)).toEqual([
      "0 days (same day)",
      "1 day",
      "2 days",
      "3 days",
      "4–5 days",
      "6–7 days",
      "8–14 days",
      "15+ days",
    ]);
  });

  it("correctly assigns day intervals to standard histogram bins", () => {
    const sampleGaps = [
      { days: 0, orders: 3 },
      { days: 1, orders: 5 },
      { days: 2, orders: 10 },
      { days: 3, orders: 2 },
      { days: 4, orders: 1 },
      { days: 5, orders: 2 }, // 4-5 days = 3
      { days: 6, orders: 1 },
      { days: 7, orders: 1 }, // 6-7 days = 2
      { days: 9, orders: 2 },
      { days: 12, orders: 1 }, // 8-14 days = 3
      { days: 25, orders: 1 }, // 15+ days = 1
    ];

    const buckets = bucketOrderGaps(sampleGaps);
    expect(buckets[0].orders).toBe(3); // 0 days
    expect(buckets[1].orders).toBe(5); // 1 day
    expect(buckets[2].orders).toBe(10); // 2 days
    expect(buckets[3].orders).toBe(2); // 3 days
    expect(buckets[4].orders).toBe(3); // 4-5 days
    expect(buckets[5].orders).toBe(2); // 6-7 days
    expect(buckets[6].orders).toBe(3); // 8-14 days
    expect(buckets[7].orders).toBe(1); // 15+ days

    const totalOrders = 3 + 5 + 10 + 2 + 3 + 2 + 3 + 1; // 29
    expect(buckets[2].sharePercent).toBe(
      Math.round((10 / totalOrders) * 1000) / 10,
    );
  });

  it("handles empty or missing gaps without throwing and keeps 0 values", () => {
    expect(bucketOrderGaps(null)).toHaveLength(DEFAULT_ORDER_GAP_BINS.length);
    expect(bucketOrderGaps(undefined)).toHaveLength(DEFAULT_ORDER_GAP_BINS.length);
    const zeroBuckets = bucketOrderGaps([]);
    expect(zeroBuckets.every((b) => b.orders === 0 && b.sharePercent === 0)).toBe(true);
  });

  it("does not drop high-value gap intervals and places them into 15+ days", () => {
    const buckets = bucketOrderGaps([{ days: 90, orders: 4 }]);
    expect(buckets[7].label).toBe("15+ days");
    expect(buckets[7].orders).toBe(4);
    expect(buckets[7].sharePercent).toBe(100);
  });
});

describe("buildOrderGapsTableRows", () => {
  it("formats table headers and rows conforming to screen-reader table alternative spec", () => {
    const buckets = bucketOrderGaps([
      { days: 1, orders: 4 },
      { days: 2, orders: 6 },
    ]);
    const { tableHeaders, tableRows, tableData } = buildOrderGapsTableRows(buckets);

    expect(tableHeaders).toEqual(["Gap bucket", "Intervals", "Share"]);
    expect(tableRows).toHaveLength(8);
    expect(tableRows[1]).toEqual(["1 day", 4, "40%"]);
    expect(tableRows[2]).toEqual(["2 days", 6, "60%"]);

    expect(tableData[1]).toEqual({
      "Gap bucket": "1 day",
      Intervals: 4,
      Share: "40%",
    });
  });
});

describe("buildOrderGapsHistogramOption pure option builder", () => {
  const sampleGaps = [
    { days: 1, orders: 6 },
    { days: 2, orders: 12 },
    { days: 5, orders: 4 },
  ];

  it("configures category xAxis, value yAxis, histogram bar styling, and theme tokens", () => {
    const theme = resolveChartTheme("light", "emerald");
    const option = buildOrderGapsHistogramOption({
      gaps: sampleGaps,
      theme,
    }) as any;

    expect(option.xAxis.type).toBe("category");
    expect(option.xAxis.data).toEqual([
      "0 days (same day)",
      "1 day",
      "2 days",
      "3 days",
      "4–5 days",
      "6–7 days",
      "8–14 days",
      "15+ days",
    ]);

    expect(option.yAxis.type).toBe("value");
    expect(option.yAxis.name).toBe("Intervals");

    expect(option.series).toHaveLength(1);
    const series = option.series[0];
    expect(series.type).toBe("bar");
    expect(series.barWidth).toBe("70%");
    expect(series.itemStyle.borderRadius).toEqual([4, 4, 0, 0]);
    expect(series.itemStyle.color).toBe(theme.colors[0]);
  });

  it("adds a vertical markLine for the weighted median gap on category axis", () => {
    const theme = resolveChartTheme("light", "emerald");
    // Median of 6x1 + 12x2 + 4x5 = 22 total.
    // 11th and 12th items fall in 2 days -> median is 2.
    const option = buildOrderGapsHistogramOption({
      gaps: sampleGaps,
      theme,
    }) as any;

    const series = option.series[0];
    expect(series.markLine).toBeDefined();
    expect(series.markLine.data).toHaveLength(1);

    const mark = series.markLine.data[0];
    expect(mark.name).toBe("Median");
    expect(mark.xAxis).toBe("2 days");
    expect(mark.label.formatter).toBe("Median: 2 days");
    expect(mark.lineStyle.type).toBe("dashed");
  });

  it("handles positional parameters and empty data without markLine", () => {
    const theme = resolveChartTheme("dark", "slate");
    const option = buildOrderGapsHistogramOption([], null, theme, true) as any;

    expect(option.series[0].markLine.data).toHaveLength(0);
    expect(option.series[0].animation).toBe(false);
  });
});

describe("formatOrderGapsTooltip", () => {
  it("formats bucket name, intervals count, and share percent matching requirement", () => {
    const theme = resolveChartTheme("light", "emerald");
    const buckets = bucketOrderGaps([
      { days: 2, orders: 18 },
      { days: 5, orders: 46 },
    ]);
    const total = 18 + 46;
    const share = Math.round((18 / total) * 1000) / 10;

    const tooltip = formatOrderGapsTooltip(
      [{ axisValueLabel: "2 days", dataIndex: 2 }],
      buckets,
      2,
      theme,
    );

    expect(tooltip).toContain("2 days");
    expect(tooltip).toContain(`18 (${share}%)`);
    expect(tooltip).toContain(`2 days: 18 intervals (${share}%)`);
    expect(tooltip).toContain("Median gap: 2 days");
  });
});

describe("deriveGapsFromOrders helper", () => {
  it("calculates consecutive calendar day differences from raw order list", () => {
    const orders = [
      { order_date: "2024-01-01" },
      { order_date: "2024-01-01" }, // same day -> 0 days
      { order_date: "2024-01-03" }, // 2 days
      { order_date: "2024-01-07" }, // 4 days
    ];

    const derived = deriveGapsFromOrders(orders);
    expect(derived).toEqual([
      { days: 0, orders: 1 },
      { days: 2, orders: 1 },
      { days: 4, orders: 1 },
    ]);
  });

  it("returns empty array for fewer than 2 dated orders", () => {
    expect(deriveGapsFromOrders([])).toEqual([]);
    expect(deriveGapsFromOrders([{ order_date: "2024-01-01" }])).toEqual([]);
    expect(deriveGapsFromOrders(null)).toEqual([]);
  });
});

describe("OrderGapsHistogramChart React component rendering", () => {
  const sampleGaps = [
    { days: 1, orders: 4 },
    { days: 2, orders: 10 },
    { days: 4, orders: 4 },
    { days: 14, orders: 1 },
  ];

  it("renders ChartCard with title, subtitle, and dynamic takeaway caption", () => {
    const html = renderToString(
      <OrderGapsHistogramChart gaps={sampleGaps} longest_gap={14} />,
    );

    expect(html).toContain("Gap between orders");
    expect(html).toContain(
      "Histogram of days elapsed between consecutive orders",
    );
    expect(html).toContain("Median gap between orders is 2 days");
    expect(html).toContain("longest gap: 14 days");
  });

  it("renders info popover detailing measurement, bucketing, and median calculation", () => {
    const html = renderToString(
      <OrderGapsHistogramChart gaps={sampleGaps} longest_gap={14} />,
    );

    expect(html).toContain("Gap between orders information");

    const popoverHtml = renderToString(<OrderGapsInfoContent />);
    expect(popoverHtml).toContain("Gap Between Orders");
    expect(popoverHtml).toContain("Consecutive Gaps:");
    expect(popoverHtml).toContain("Bucketing:");
    expect(popoverHtml).toContain("Weighted Median:");
  });

  it("renders friendly empty state when fewer than two dated orders are available", () => {
    const htmlEmpty = renderToString(<OrderGapsHistogramChart gaps={[]} />);
    expect(htmlEmpty).toContain(
      "Fewer than two dated orders available to measure gaps between orders",
    );

    const htmlNull = renderToString(<OrderGapsHistogramChart gaps={null} />);
    expect(htmlNull).toContain(
      "Fewer than two dated orders available to measure gaps between orders",
    );
  });

  it("renders informative empty state when date_unavailable_reason is set", () => {
    const html = renderToString(
      <OrderGapsHistogramChart
        gaps={sampleGaps}
        date_unavailable_reason="Receipt dates are missing for imported offline transactions"
      />,
    );

    expect(html).toContain(
      "Receipt dates are missing for imported offline transactions",
    );
  });

  it("renders custom caption when explicitly provided", () => {
    const html = renderToString(
      <OrderGapsHistogramChart
        gaps={sampleGaps}
        caption="Custom gap takeaway note"
      />,
    );

    expect(html).toContain("Custom gap takeaway note");
  });
});
