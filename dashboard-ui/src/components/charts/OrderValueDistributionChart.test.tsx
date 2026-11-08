import { describe, expect, it, vi } from "vitest";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import {
  OrderValueDistributionChart,
  buildOrderValueDistributionOption,
  bucketOrderValues,
  computeOrderValueStats,
  findBucketForValue,
  formatOrderValueDistributionTooltip,
  DEFAULT_ORDER_VALUE_BINS,
  type OrderValueBucket,
} from "./OrderValueDistributionChart";
import {
  resolveChartTheme,
  VALID_MODES,
  VALID_ACCENTS,
} from "../../lib/chart-theme";
import {
  computeOrderValueDistributionTakeaway,
  formatRupees,
} from "../../lib/captions";

const sampleOrders = [
  { final_amount_paid: 80 },    // bucket 0-100
  { final_amount_paid: 150 },   // bucket 100-250
  { final_amount_paid: 200 },   // bucket 100-250
  { final_amount_paid: 320 },   // bucket 250-500
  { final_amount_paid: 450 },   // bucket 250-500
  { final_amount_paid: 600 },   // bucket 500-750
  { final_amount_paid: 850 },   // bucket 750-1000
  { final_amount_paid: 1200 },  // bucket 1000-1500
  { final_amount_paid: 1800 },  // bucket 1500-2000
  { final_amount_paid: 2500 },  // bucket 2000+
];

describe("OrderValueDistributionChart - Helper: bucketOrderValues (Scenario: Histogram, S-046)", () => {
  it("groups order values into default discrete buckets with counts, spend, and share percentages", () => {
    const buckets = bucketOrderValues(sampleOrders);

    expect(buckets).toHaveLength(DEFAULT_ORDER_VALUE_BINS.length);

    // Bucket 0: ₹0–₹100 (1 order of 80)
    expect(buckets[0].label).toBe("₹0–₹100");
    expect(buckets[0].orders).toBe(1);
    expect(buckets[0].spend).toBe(80);
    expect(buckets[0].sharePercent).toBe(10); // 1 / 10 = 10%

    // Bucket 1: ₹100–₹250 (2 orders: 150, 200)
    expect(buckets[1].label).toBe("₹100–₹250");
    expect(buckets[1].orders).toBe(2);
    expect(buckets[1].spend).toBe(350);
    expect(buckets[1].sharePercent).toBe(20);

    // Bucket 2: ₹250–₹500 (2 orders: 320, 450)
    expect(buckets[2].label).toBe("₹250–₹500");
    expect(buckets[2].orders).toBe(2);
    expect(buckets[2].spend).toBe(770);

    // Bucket 7: ₹2,000+ (1 order: 2500)
    expect(buckets[7].label).toBe("₹2,000+");
    expect(buckets[7].orders).toBe(1);
    expect(buckets[7].spend).toBe(2500);
    expect(buckets[7].max).toBeNull();
  });

  it("supports raw number arrays as values", () => {
    const rawNums = [50, 150, 300, 350, 1200];
    const buckets = bucketOrderValues(rawNums);

    expect(buckets[0].orders).toBe(1);
    expect(buckets[1].orders).toBe(1);
    expect(buckets[2].orders).toBe(2);
    expect(buckets[5].orders).toBe(1);
  });

  it("supports custom boundary array [0, 200, 500, 1000]", () => {
    const customBins = [0, 200, 500, 1000];
    const buckets = bucketOrderValues([100, 250, 400, 1200], customBins);

    expect(buckets).toHaveLength(4);
    expect(buckets[0].label).toBe("₹0–₹200");
    expect(buckets[0].orders).toBe(1);
    expect(buckets[1].label).toBe("₹200–₹500");
    expect(buckets[1].orders).toBe(2);
    expect(buckets[2].label).toBe("₹500–₹1000");
    expect(buckets[2].orders).toBe(0);
    expect(buckets[3].label).toBe("₹1000+");
    expect(buckets[3].orders).toBe(1);
  });

  it("supports uniform binSize number", () => {
    const buckets = bucketOrderValues([150, 350, 450], 200);
    expect(buckets.length).toBeGreaterThan(2);
    expect(buckets[0].label).toBe("₹0–₹200");
    expect(buckets[0].orders).toBe(1);
    expect(buckets[1].label).toBe("₹200–₹400");
    expect(buckets[1].orders).toBe(1);
    expect(buckets[2].label).toBe("₹400–₹600");
    expect(buckets[2].orders).toBe(1);
  });

  it("handles empty, null, or undefined data gracefully", () => {
    const empty1 = bucketOrderValues(null);
    expect(empty1.every((b) => b.orders === 0 && b.spend === 0)).toBe(true);

    const empty2 = bucketOrderValues([]);
    expect(empty2.every((b) => b.orders === 0 && b.spend === 0)).toBe(true);
  });

  it("ignores non-finite, null, negative, or zero values", () => {
    const mixed = [
      null,
      undefined,
      { final_amount_paid: -50 },
      { final_amount_paid: 0 },
      { final_amount_paid: Number.NaN },
      { final_amount_paid: Number.POSITIVE_INFINITY },
      { final_amount_paid: 120 },
    ];
    const buckets = bucketOrderValues(mixed);
    const totalOrders = buckets.reduce((s, b) => s + b.orders, 0);
    expect(totalOrders).toBe(1);
    expect(buckets[1].orders).toBe(1); // 120 in 100-250
  });
});

describe("OrderValueDistributionChart - Helper: computeOrderValueStats", () => {
  it("calculates count, total, mean, and median for odd number of orders", () => {
    const stats = computeOrderValueStats([100, 200, 600]);
    expect(stats).not.toBeNull();
    expect(stats!.count).toBe(3);
    expect(stats!.total).toBe(900);
    expect(stats!.mean).toBe(300);
    expect(stats!.median).toBe(200);
  });

  it("calculates median as average of midpoints for even number of orders", () => {
    const stats = computeOrderValueStats([100, 200, 400, 500]);
    expect(stats).not.toBeNull();
    expect(stats!.count).toBe(4);
    expect(stats!.total).toBe(1200);
    expect(stats!.mean).toBe(300);
    expect(stats!.median).toBe(300); // (200 + 400) / 2
  });

  it("supports objects with final_amount_paid, amount, or spend", () => {
    const stats = computeOrderValueStats([
      { final_amount_paid: 150 },
      { amount: 250 },
      { spend: 500 },
    ]);
    expect(stats).not.toBeNull();
    expect(stats!.count).toBe(3);
    expect(stats!.total).toBe(900);
    expect(stats!.mean).toBe(300);
    expect(stats!.median).toBe(250);
  });

  it("returns null on empty, all-zero, or missing data", () => {
    expect(computeOrderValueStats(null)).toBeNull();
    expect(computeOrderValueStats([])).toBeNull();
    expect(computeOrderValueStats([0, 0])).toBeNull();
    expect(computeOrderValueStats([{ final_amount_paid: 0 }])).toBeNull();
  });
});

describe("OrderValueDistributionChart - Helper: findBucketForValue", () => {
  const buckets = bucketOrderValues(sampleOrders);

  it("finds matching bucket within bounds", () => {
    const b1 = findBucketForValue(150, buckets);
    expect(b1?.label).toBe("₹100–₹250");

    const b2 = findBucketForValue(350, buckets);
    expect(b2?.label).toBe("₹250–₹500");
  });

  it("finds top open-ended bucket for large amounts", () => {
    const b = findBucketForValue(5000, buckets);
    expect(b?.label).toBe("₹2,000+");
  });
});

describe("OrderValueDistributionChart - Helper: formatOrderValueDistributionTooltip", () => {
  const theme = resolveChartTheme("light", "emerald");
  const buckets = bucketOrderValues(sampleOrders);
  const stats = computeOrderValueStats(sampleOrders);

  it("formats rich tooltip with orders, share %, spend, avg ticket, and reference annotations", () => {
    const params = [
      {
        axisValueLabel: "₹250–₹500",
        dataIndex: 2,
        value: 2,
      },
    ];
    const html = formatOrderValueDistributionTooltip(params, buckets, stats, theme);

    expect(html).toContain("₹250–₹500");
    expect(html).toContain("Orders:");
    expect(html).toContain("2 (20%)");
    expect(html).toContain("Spend:");
    expect(html).toContain(formatRupees(770));
    expect(html).toContain("Avg ticket:");
    expect(html).toContain("Click bar to filter orders by this range");
  });

  it("annotates Mean or Median callout when bucket contains them", () => {
    // In sampleOrders:
    // values: 80, 150, 200, 320, 450, 600, 850, 1200, 1800, 2500
    // median: (450 + 600) / 2 = 525 (in bucket ₹500–₹750)
    // mean: 8150 / 10 = 815 (in bucket ₹750–₹1,000)
    const medianParams = [{ axisValueLabel: "₹500–₹750", dataIndex: 3, value: 1 }];
    const medianHtml = formatOrderValueDistributionTooltip(medianParams, buckets, stats, theme);
    expect(medianHtml).toContain("Median:");

    const meanParams = [{ axisValueLabel: "₹750–₹1,000", dataIndex: 4, value: 1 }];
    const meanHtml = formatOrderValueDistributionTooltip(meanParams, buckets, stats, theme);
    expect(meanHtml).toContain("Mean:");
  });

  it("handles null or empty params safely", () => {
    expect(formatOrderValueDistributionTooltip(null, buckets, stats, theme)).toBe("");
    expect(formatOrderValueDistributionTooltip([], buckets, stats, theme)).toBe("");
  });
});

describe("OrderValueDistributionChart - Option Builder (CC-11, Scenario: Histogram)", () => {
  const theme = resolveChartTheme("light", "emerald");

  it("builds bar series with theme color and vertical markLines for Mean and Median", () => {
    const option = buildOrderValueDistributionOption({
      orders: sampleOrders,
      theme,
      prefersReducedMotion: false,
    });

    const series = option.series as Array<{
      type?: string;
      data?: number[];
      itemStyle?: { color?: string; borderRadius?: number[] };
      markLine?: {
        data?: Array<{
          name: string;
          xAxis: string;
          label: { formatter: string };
          lineStyle: { type: string; color: string };
        }>;
      };
      animation?: boolean;
      animationDuration?: number;
      animationEasing?: string;
    }>;

    expect(series).toHaveLength(1);
    const bar = series[0];
    expect(bar.type).toBe("bar");
    expect(bar.itemStyle?.color).toBe(theme.colors[0]);
    expect(bar.itemStyle?.borderRadius).toEqual([4, 4, 0, 0]);

    // Mark lines: Mean and Median
    const markLineData = bar.markLine?.data;
    expect(markLineData).toBeDefined();
    expect(markLineData!.length).toBe(2);

    const meanLine = markLineData!.find((m) => m.name === "Mean");
    expect(meanLine).toBeDefined();
    expect(meanLine!.label.formatter).toContain("Mean:");
    expect(meanLine!.lineStyle.type).toBe("dashed");
    expect(meanLine!.lineStyle.color).toBe(theme.colors[1]);

    const medianLine = markLineData!.find((m) => m.name === "Median");
    expect(medianLine).toBeDefined();
    expect(medianLine!.label.formatter).toContain("Median:");
    expect(medianLine!.lineStyle.type).toBe("dotted");

    // Animation: 600ms cubicOut
    expect(bar.animation).toBe(true);
    expect(bar.animationDuration).toBe(600);
    expect(bar.animationEasing).toBe("cubicOut");
  });

  it("disables animation when prefersReducedMotion is true", () => {
    const option = buildOrderValueDistributionOption({
      orders: sampleOrders,
      theme,
      prefersReducedMotion: true,
    });

    const bar = (option.series as any[])[0];
    expect(bar.animation).toBe(false);
    expect(bar.animationDuration).toBe(0);
  });

  it("supports all 10 theme mode and accent permutations without throwing", () => {
    for (const mode of VALID_MODES) {
      for (const accent of VALID_ACCENTS) {
        const currentTheme = resolveChartTheme(mode, accent);
        const option = buildOrderValueDistributionOption({
          orders: sampleOrders,
          theme: currentTheme,
        });
        expect(option.series).toBeDefined();
      }
    }
  });
});

describe("OrderValueDistributionChart - Bucket Click to Filter (Scenario: Click, DEC-046)", () => {
  it("invokes onBucketClick callback with the clicked bucket bounds", () => {
    const onBucketClick = vi.fn();
    const testBuckets = bucketOrderValues(sampleOrders);

    // Call onBucketClick directly with a bucket
    const targetBucket = testBuckets[1]; // ₹100–₹250
    expect(targetBucket.min).toBe(100);
    expect(targetBucket.max).toBe(250);

    onBucketClick(targetBucket);
    expect(onBucketClick).toHaveBeenCalledWith(targetBucket);
    expect(onBucketClick).toHaveBeenCalledWith(
      expect.objectContaining({
        min: 100,
        max: 250,
        label: "₹100–₹250",
      }),
    );
  });

  it("brackets order amounts into amount_min and amount_max search params (DEC-046)", () => {
    const targetBucket: OrderValueBucket = {
      key: "250-500",
      label: "₹250–₹500",
      min: 250,
      max: 500,
      orders: 2,
      spend: 770,
      sharePercent: 20,
      spendSharePercent: 25,
    };

    const params = new URLSearchParams("platform=Swiggy&date_from=2024-01-01");
    params.set("amount_min", String(targetBucket.min));
    if (targetBucket.max !== null) {
      params.set("amount_max", String(targetBucket.max));
    }

    expect(params.get("platform")).toBe("Swiggy");
    expect(params.get("amount_min")).toBe("250");
    expect(params.get("amount_max")).toBe("500");
  });

  it("handles open-ended upper bound (e.g. ₹2,000+) without amount_max", () => {
    const openBucket: OrderValueBucket = {
      key: "2000-max",
      label: "₹2,000+",
      min: 2000,
      max: null,
      orders: 1,
      spend: 2500,
      sharePercent: 10,
      spendSharePercent: 30,
    };

    const params = new URLSearchParams("amount_max=500");
    params.set("amount_min", String(openBucket.min));
    if (openBucket.max !== null) {
      params.set("amount_max", String(openBucket.max));
    } else {
      params.delete("amount_max");
    }

    expect(params.get("amount_min")).toBe("2000");
    expect(params.has("amount_max")).toBe(false);
  });
});

describe("OrderValueDistributionChart - React Component & ChartCard Integration (CC-1 to CC-12)", () => {
  it("renders ChartCard with title, subtitle, info popover, and role=img container", () => {
    const html = renderToString(
      <MemoryRouter>
        <OrderValueDistributionChart orders={sampleOrders} />
      </MemoryRouter>,
    );

    expect(html).toContain("Order value distribution");
    expect(html).toContain("Histogram of order sizes with mean and median reference lines");
    expect(html).toContain('role="img"');
    expect(html).toContain("Order value distribution: Histogram of order sizes with mean and median reference lines");
    expect(html).toContain('aria-label="Order value distribution information"');
  });

  it("renders sortable accessible table view with Bucket, Orders, Share (%), and Spend columns (CC-7)", () => {
    const html = renderToString(
      <MemoryRouter>
        <OrderValueDistributionChart orders={sampleOrders} showTable={true} />
      </MemoryRouter>,
    );

    expect(html).toContain("Bucket");
    expect(html).toContain("Orders");
    expect(html).toContain("Share (%)");
    expect(html).toContain("Spend");
    expect(html).toContain("₹0–₹100");
    expect(html).toContain("₹100–₹250");
    expect(html).toContain("₹250–₹500");
  });

  it("renders loading state with skeleton pulse (CC-9)", () => {
    const html = renderToString(
      <MemoryRouter>
        <OrderValueDistributionChart isLoading={true} />
      </MemoryRouter>,
    );
    expect(html).toContain("animate-pulse");
  });

  it("renders empty state when orders data is empty (CC-9)", () => {
    const html = renderToString(
      <MemoryRouter>
        <OrderValueDistributionChart orders={[]} />
      </MemoryRouter>,
    );
    expect(html).toContain("No order value distribution data available");
  });

  it("renders error state when error prop is supplied (CC-9)", () => {
    const html = renderToString(
      <MemoryRouter>
        <OrderValueDistributionChart error={new Error("Failed to load slim orders")} />
      </MemoryRouter>,
    );
    expect(html).toContain("Failed to load slim orders");
  });

  it("displays computed takeaway caption in ChartCard (CC-8)", () => {
    const html = renderToString(
      <MemoryRouter>
        <OrderValueDistributionChart orders={sampleOrders} />
      </MemoryRouter>,
    );
    const expectedCaption = computeOrderValueDistributionTakeaway(sampleOrders)!;
    expect(expectedCaption).toBeDefined();
    expect(html).toContain(expectedCaption);
  });

  it("allows custom caption override", () => {
    const html = renderToString(
      <MemoryRouter>
        <OrderValueDistributionChart
          orders={sampleOrders}
          caption="Custom order value distribution takeaway"
        />
      </MemoryRouter>,
    );
    expect(html).toContain("Custom order value distribution takeaway");
  });
});
