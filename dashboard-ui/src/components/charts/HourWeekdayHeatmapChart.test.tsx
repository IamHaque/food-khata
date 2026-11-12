import { color as zcolor } from "echarts/core";
import { describe, expect, it, vi } from "vitest";
import * as React from "react";
import { renderToString } from "react-dom/server";
import {
  buildHourWeekdayHeatmapOption,
  normalizeHourWeekdayRows,
  buildHourWeekdayTableRows,
  handleHourWeekdayCellClick,
  HourWeekdayHeatmapChart,
  HOURS,
  WEEKDAY_SHORT_NAMES,
  WEEKDAY_FULL_NAMES,
} from "./HourWeekdayHeatmapChart";
import { computeHourWeekdayTakeaway } from "@/lib/captions";
import { resolveChartTheme } from "@/lib/chart-theme";

describe("HourWeekdayHeatmapChart pure option builder (CC-4, CC-10)", () => {
  // Sample data:
  // Key 116 = weekday 4 (Friday), hour 20 -> 15 orders, 3500 spend
  // Key 133 = weekday 5 (Saturday), hour 13 -> 4 orders, 1200 spend
  // Key 10 = weekday 0 (Monday), hour 10 -> 2 orders, 600 spend
  const sampleData = [
    { key: "116", orders: 15, spend: 3500 },
    { key: "133", orders: 4, spend: 1200 },
    { key: "10", orders: 2, spend: 600 },
  ];

  it("builds a 7x24 heatmap option with correct dimensions, grid, series, and visualMap", () => {
    const theme = resolveChartTheme("light", "emerald");
    const option = buildHourWeekdayHeatmapOption(sampleData, theme) as any;

    // Dimensions: X-axis (24 hours)
    expect(option.xAxis).toBeTruthy();
    expect(option.xAxis.type).toBe("category");
    expect(option.xAxis.data).toHaveLength(24);
    expect(option.xAxis.data[0]).toBe("00:00");
    expect(option.xAxis.data[23]).toBe("23:00");

    // Dimensions: Y-axis (7 days) with inverse: true (Mon at top, Sun at bottom)
    expect(option.yAxis).toBeTruthy();
    expect(option.yAxis.type).toBe("category");
    expect(option.yAxis.inverse).toBe(true);
    expect(option.yAxis.data).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);

    // Grid configuration
    expect(option.grid).toBeTruthy();
    expect(option.grid.containLabel).toBe(true);

    // Series configuration
    expect(Array.isArray(option.series)).toBe(true);
    expect(option.series).toHaveLength(1);
    expect(option.series[0].type).toBe("heatmap");
    expect(option.series[0].data).toHaveLength(168); // 7 * 24 grid cells

    // Verify mapped data point for Friday 20:00 (hour 20, weekday 4)
    const fri20Cell = option.series[0].data.find(
      (d: number[]) => d[0] === 20 && d[1] === 4,
    );
    expect(fri20Cell).toEqual([20, 4, 15, 3500]);

    // VisualMap legend configuration
    expect(option.visualMap).toBeTruthy();
    expect(option.visualMap.type).toBe("continuous");
    expect(option.visualMap.dimension).toBe(2); // orders index
    expect(option.visualMap.min).toBe(0);
    expect(option.visualMap.max).toBe(15);
    expect(option.visualMap.orient).toBe("horizontal");
    expect(option.visualMap.inRange?.color).toBeInstanceOf(Array);
    expect(option.visualMap.inRange.color).toHaveLength(5);
  });

  it("formats rich tooltip with full day name, hour range, order count, and rupees spend", () => {
    const theme = resolveChartTheme("light", "emerald");
    const option = buildHourWeekdayHeatmapOption(sampleData, theme) as any;
    expect(typeof option.tooltip?.formatter).toBe("function");

    // Friday 20:00 - 20:59 with 15 orders (plural)
    const tooltipPlural = option.tooltip.formatter({
      value: [20, 4, 15, 3500],
    });
    expect(tooltipPlural).toContain("Friday, 20:00 - 20:59");
    expect(tooltipPlural).toContain("15 orders");
    expect(tooltipPlural).toContain("₹3,500");

    // Saturday 13:00 - 13:59 with 1 order (singular)
    const tooltipSingular = option.tooltip.formatter({
      data: [13, 5, 1, 450],
    });
    expect(tooltipSingular).toContain("Saturday, 13:00 - 13:59");
    expect(tooltipSingular).toContain("1 order");
    expect(tooltipSingular).toContain("₹450");
  });

  it("adapts visualMap colors and typography to theme mode (light vs dark)", () => {
    const lightTheme = resolveChartTheme("light", "emerald");
    const darkTheme = resolveChartTheme("dark", "indigo");

    const lightOption = buildHourWeekdayHeatmapOption(sampleData, lightTheme) as any;
    const darkOption = buildHourWeekdayHeatmapOption(sampleData, darkTheme) as any;

    // single-hue ramp from a surface tint up to the accent
    expect(zcolor.parse(lightOption.visualMap.inRange.color.at(-1))).toEqual(zcolor.parse(lightTheme["chart-1"]));
    expect(zcolor.parse(darkOption.visualMap.inRange.color.at(-1))).toEqual(zcolor.parse(darkTheme["chart-1"]));
    expect(zcolor.parse(lightOption.visualMap.inRange.color[0])).toEqual(zcolor.parse(lightTheme.rampLow));
  });

  it("honors reducedMotion option to disable animations", () => {
    const option = buildHourWeekdayHeatmapOption(sampleData, {
      reducedMotion: true,
    }) as any;
    expect(option.animation).toBe(false);
    expect(option.animationDuration).toBe(0);
  });

  it("normalizes empty or missing data into 168 zero-filled cells", () => {
    const cells = normalizeHourWeekdayRows(null);
    expect(cells).toHaveLength(168);
    expect(cells.every((c) => c.orders === 0 && c.spend === 0)).toBe(true);
    expect(cells[0].dayName).toBe("Monday");
    expect(cells[0].hourLabel).toBe("00:00");
  });
});

describe("HourWeekdayHeatmapChart takeaway caption generator (CC-3)", () => {
  it("computes peak ordering day and hour takeaway", () => {
    const data = [
      { key: "10", orders: 2, spend: 300 },
      { key: "116", orders: 15, spend: 3500 }, // Friday 20:00
      { key: "25", orders: 4, spend: 800 },
    ];
    expect(computeHourWeekdayTakeaway(data)).toBe(
      "Peak ordering is Friday at 20:00 with 15 orders",
    );
  });

  it("uses singular '1 order' when peak is 1", () => {
    const data = [{ key: "157", orders: 1, spend: 250 }]; // Sunday 13:00
    expect(computeHourWeekdayTakeaway(data)).toBe(
      "Peak ordering is Sunday at 13:00 with 1 order",
    );
  });

  it("returns null for ties, empty arrays, or zero orders", () => {
    expect(computeHourWeekdayTakeaway(null)).toBeNull();
    expect(computeHourWeekdayTakeaway([])).toBeNull();
    expect(
      computeHourWeekdayTakeaway([
        { key: "10", orders: 5 },
        { key: "20", orders: 5 },
      ]),
    ).toBeNull();
    expect(computeHourWeekdayTakeaway([{ key: "10", orders: 0 }])).toBeNull();
  });
});

describe("HourWeekdayHeatmapChart click cross-filtering (CC-5)", () => {
  it("maps cell click on Friday 20:00 to weekday and dinner meal slot", () => {
    const update = vi.fn();
    const filters = { update };
    const onCellClick = vi.fn();

    // Value [hour, weekday, orders, spend]
    const payload = handleHourWeekdayCellClick(
      { value: [20, 4, 15, 3500] },
      filters,
      onCellClick,
    );

    expect(payload).toEqual({
      hour: 20,
      weekday: 4,
      orders: 15,
      spend: 3500,
      mealSlot: "dinner",
      dayType: "weekday",
    });

    expect(update).toHaveBeenCalledWith({
      day_type: "weekday",
      meal_slots: ["dinner"],
    });

    expect(onCellClick).toHaveBeenCalledWith(payload);
  });

  it("maps cell click on Saturday 13:00 to weekend and lunch meal slot", () => {
    const update = vi.fn();
    const filters = { update };
    const onCellClick = vi.fn();

    const payload = handleHourWeekdayCellClick(
      { data: [13, 5, 6, 1800] },
      filters,
      onCellClick,
    );

    expect(payload).toEqual({
      hour: 13,
      weekday: 5,
      orders: 6,
      spend: 1800,
      mealSlot: "lunch",
      dayType: "weekend",
    });

    expect(update).toHaveBeenCalledWith({
      day_type: "weekend",
      meal_slots: ["lunch"],
    });
  });

  it("maps cell click on Sunday 08:00 to weekend and breakfast meal slot", () => {
    const update = vi.fn();
    const filters = { update };

    const payload = handleHourWeekdayCellClick(
      { value: [8, 6, 2, 400] },
      filters,
    );

    expect(payload?.dayType).toBe("weekend");
    expect(payload?.mealSlot).toBe("breakfast");
    expect(update).toHaveBeenCalledWith({
      day_type: "weekend",
      meal_slots: ["breakfast"],
    });
  });

  it("maps late night hour (01:00) to late_night meal slot", () => {
    const update = vi.fn();
    const filters = { update };

    const payload = handleHourWeekdayCellClick(
      { value: [1, 2, 3, 500] }, // Wednesday 01:00
      filters,
    );

    expect(payload?.dayType).toBe("weekday");
    expect(payload?.mealSlot).toBe("late_night");
    expect(update).toHaveBeenCalledWith({
      day_type: "weekday",
      meal_slots: ["late_night"],
    });
  });

  it("returns null for malformed or out-of-range click params", () => {
    const update = vi.fn();
    const filters = { update };

    expect(handleHourWeekdayCellClick(null, filters)).toBeNull();
    expect(handleHourWeekdayCellClick({ value: [25, 4] }, filters)).toBeNull();
    expect(handleHourWeekdayCellClick({ value: [10, 8] }, filters)).toBeNull();
    expect(update).not.toHaveBeenCalled();
  });
});

describe("HourWeekdayHeatmapChart screen reader table alternative (CC-7)", () => {
  const sampleData = [
    { key: "10", orders: 2, spend: 600 },
    { key: "116", orders: 15, spend: 3500 },
  ];

  it("builds tableHeaders and tableRows correctly", () => {
    const result = buildHourWeekdayTableRows(sampleData, true);

    expect(result.tableHeaders).toEqual(["Day", "Hour", "Orders", "Spend"]);
    expect(result.tableRows).toHaveLength(2);
    expect(result.tableRows[0]).toEqual(["Monday", "10:00 - 10:59", 2, 600]);
    expect(result.tableRows[1]).toEqual(["Friday", "20:00 - 20:59", 15, 3500]);

    expect(result.tableData).toEqual([
      { Day: "Monday", Hour: "10:00 - 10:59", Orders: 2, Spend: 600 },
      { Day: "Friday", Hour: "20:00 - 20:59", Orders: 15, Spend: 3500 },
    ]);
  });

  it("renders accessible table toggle and table content when showTable is true", () => {
    const html = renderToString(
      <HourWeekdayHeatmapChart data={sampleData} showTable />,
    );

    expect(html).toContain('aria-label="Toggle table view"');
    expect(html).toContain('aria-label="Download CSV"');
    expect(html).toContain("Day");
    expect(html).toContain("Hour");
    expect(html).toContain("Orders");
    expect(html).toContain("Spend");
    expect(html).toContain("Monday");
    expect(html).toContain("Friday");
    expect(html).toContain("10:00 - 10:59");
    expect(html).toContain("20:00 - 20:59");
  });
});

describe("HourWeekdayHeatmapChart component rendering and empty states (CC-1, CC-2, CC-8, CC-9)", () => {
  const sampleData = [
    { key: "116", orders: 15, spend: 3500 },
  ];

  it("renders chart card with title, subtitle, caption, and info popover", () => {
    const html = renderToString(
      <HourWeekdayHeatmapChart data={sampleData} />,
    );

    expect(html).toContain("Hour and weekday heatmap");
    expect(html).toContain("Order distribution across 7 days and 24 hours");
    expect(html).toContain("Peak ordering is Friday at 20:00 with 15 orders");
    expect(html).toContain('aria-label="Hour and weekday heatmap information"');
    expect(html).toContain('role="img"');
  });

  it("handles timing_unavailable_reason gracefully in empty state", () => {
    const html = renderToString(
      <HourWeekdayHeatmapChart
        data={[]}
        timing_unavailable_reason="more than 80% of dates or times are missing or invalid"
      />,
    );

    expect(html).toContain("more than 80% of dates or times are missing or invalid");
    expect(html).not.toContain('role="img"');
  });

  it("handles empty or zero data with default empty reason", () => {
    const html = renderToString(
      <HourWeekdayHeatmapChart data={[]} />,
    );

    expect(html).toContain("No order timing data available");
  });

  it("renders loading skeleton when isLoading is true", () => {
    const html = renderToString(
      <HourWeekdayHeatmapChart data={sampleData} isLoading />,
    );

    expect(html).toContain("animate-pulse");
  });

  it("renders error state when error is provided", () => {
    const html = renderToString(
      <HourWeekdayHeatmapChart
        data={sampleData}
        error={new Error("Failed to load behavior chart")}
        onRetry={() => {}}
      />,
    );

    expect(html).toContain("Failed to load behavior chart");
    expect(html).toContain("Retry");
  });

  it("accepts custom title and subtitle props", () => {
    const html = renderToString(
      <HourWeekdayHeatmapChart
        data={sampleData}
        title="Ordering rhythm by day and hour"
        subtitle="Weekly heatmap view"
      />,
    );

    expect(html).toContain("Ordering rhythm by day and hour");
    expect(html).toContain("Weekly heatmap view");
  });
});
