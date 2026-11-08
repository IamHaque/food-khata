import { describe, expect, it } from "vitest";
import * as React from "react";
import { renderToString } from "react-dom/server";
import {
  OrdersPerWeekChart,
  OrdersPerWeekInfoContent,
  aggregateOrdersByWeek,
  buildOrdersPerWeekOption,
  buildOrdersPerWeekTableRows,
  formatOrdersPerWeekTooltip,
} from "./OrdersPerWeekChart";
import { resolveChartTheme } from "@/lib/chart-theme";

describe("aggregateOrdersByWeek helper", () => {
  it("aggregates single week calendar entries accurately", () => {
    const calendar = [
      { date: "2025-03-10", orders: 2, spend: 500 }, // Mon
      { date: "2025-03-12", orders: 1, spend: 300 }, // Wed
      { date: "2025-03-15", orders: 3, spend: 800 }, // Sat
    ];
    const weeks = aggregateOrdersByWeek(calendar);
    expect(weeks).toHaveLength(1);
    expect(weeks[0].week).toBe("2025-W11");
    expect(weeks[0].label).toBe("Mar 10");
    expect(weeks[0].startDate).toBe("2025-03-10");
    expect(weeks[0].endDate).toBe("2025-03-16");
    expect(weeks[0].orders).toBe(6);
    expect(weeks[0].movingAverage).toBe(6);
  });

  it("calculates trailing 4-week simple moving average (SMA) correctly across multi-week spans", () => {
    const calendar = [
      // Week 1 (Mar 3 - Mar 9): 4 orders
      { date: "2025-03-03", orders: 4 },
      // Week 2 (Mar 10 - Mar 16): 6 orders
      { date: "2025-03-10", orders: 6 },
      // Week 3 (Mar 17 - Mar 23): 2 orders
      { date: "2025-03-17", orders: 2 },
      // Week 4 (Mar 24 - Mar 30): 8 orders
      { date: "2025-03-24", orders: 8 },
      // Week 5 (Mar 31 - Apr 6): 4 orders
      { date: "2025-03-31", orders: 4 },
    ];
    const weeks = aggregateOrdersByWeek(calendar);
    expect(weeks).toHaveLength(5);

    // Week 0: mean(4) = 4
    expect(weeks[0].orders).toBe(4);
    expect(weeks[0].movingAverage).toBe(4);

    // Week 1: mean(4, 6) = 5
    expect(weeks[1].orders).toBe(6);
    expect(weeks[1].movingAverage).toBe(5);

    // Week 2: mean(4, 6, 2) = 12 / 3 = 4
    expect(weeks[2].orders).toBe(2);
    expect(weeks[2].movingAverage).toBe(4);

    // Week 3: mean(4, 6, 2, 8) = 20 / 4 = 5
    expect(weeks[3].orders).toBe(8);
    expect(weeks[3].movingAverage).toBe(5);

    // Week 4: window shifts to trailing 4 weeks: mean(6, 2, 8, 4) = 20 / 4 = 5
    expect(weeks[4].orders).toBe(4);
    expect(weeks[4].movingAverage).toBe(5);
  });

  it("fills intervening weeks with 0 orders for sparse calendars", () => {
    const calendar = [
      { date: "2025-03-03", orders: 5 }, // Week 10
      // Week 11 & Week 12 have no orders
      { date: "2025-03-24", orders: 3 }, // Week 13
    ];
    const weeks = aggregateOrdersByWeek(calendar);
    expect(weeks).toHaveLength(4);

    expect(weeks[0].week).toBe("2025-W10");
    expect(weeks[0].orders).toBe(5);
    expect(weeks[0].movingAverage).toBe(5);

    expect(weeks[1].week).toBe("2025-W11");
    expect(weeks[1].orders).toBe(0);
    expect(weeks[1].movingAverage).toBe(2.5); // (5 + 0) / 2

    expect(weeks[2].week).toBe("2025-W12");
    expect(weeks[2].orders).toBe(0);
    expect(weeks[2].movingAverage).toBe(1.67); // (5 + 0 + 0) / 3

    expect(weeks[3].week).toBe("2025-W13");
    expect(weeks[3].orders).toBe(3);
    expect(weeks[3].movingAverage).toBe(2); // (5 + 0 + 0 + 3) / 4
  });

  it("handles unordered calendar items and duplicate dates gracefully", () => {
    const calendar = [
      { date: "2025-03-12", orders: 2 },
      { date: "2025-03-05", orders: 3 },
      { date: "2025-03-05", orders: 1 }, // duplicate date
      { date: "2025-03-10", orders: 1 },
    ];
    const weeks = aggregateOrdersByWeek(calendar);
    expect(weeks).toHaveLength(2);
    expect(weeks[0].orders).toBe(4); // 3 + 1
    expect(weeks[1].orders).toBe(3); // 2 + 1
  });

  it("returns empty array for empty, null, or invalid calendars", () => {
    expect(aggregateOrdersByWeek(null)).toEqual([]);
    expect(aggregateOrdersByWeek(undefined)).toEqual([]);
    expect(aggregateOrdersByWeek([])).toEqual([]);
    expect(aggregateOrdersByWeek([{ date: "invalid-date", orders: 3 }])).toEqual([]);
  });
});

describe("buildOrdersPerWeekOption pure builder", () => {
  const weeklyData = [
    { week: "2025-W10", label: "Mar 3", orders: 4, movingAverage: 4, startDate: "2025-03-03", endDate: "2025-03-09" },
    { week: "2025-W11", label: "Mar 10", orders: 6, movingAverage: 5, startDate: "2025-03-10", endDate: "2025-03-16" },
  ];

  it("constructs proper ECharts option structure with dual series and legend", () => {
    const theme = resolveChartTheme("light", "emerald");
    const option = buildOrdersPerWeekOption(weeklyData, 4.5, theme, false);

    expect(option.legend).toBeDefined();
    const legend = option.legend as { data: string[] };
    expect(legend.data).toEqual(["Weekly orders", "4-week moving avg"]);

    const series = option.series as any[];
    expect(series).toHaveLength(2);

    // Series 1: Weekly orders
    expect(series[0].name).toBe("Weekly orders");
    expect(series[0].type).toBe("line");
    expect(series[0].data).toEqual([4, 6]);
    expect(series[0].smooth).toBe(false);
    expect(series[0].showSymbol).toBe(true);
    expect(series[0].symbol).toBe("circle");
    expect(series[0].itemStyle.color).toBe(theme.colors[0]);

    // Series 2: 4-week moving avg
    expect(series[1].name).toBe("4-week moving avg");
    expect(series[1].type).toBe("line");
    expect(series[1].data).toEqual([4, 5]);
    expect(series[1].smooth).toBe(true);
    expect(series[1].showSymbol).toBe(false);
    expect(series[1].lineStyle.type).toBe("dashed");
    expect(series[1].itemStyle.color).toBe(theme.colors[1]);
  });

  it("attaches horizontal benchmark markLine when orders_per_week is provided", () => {
    const theme = resolveChartTheme("light", "emerald");
    const option = buildOrdersPerWeekOption(weeklyData, 4.2, theme);
    const series = option.series as any[];

    expect(series[0].markLine).toBeDefined();
    expect(series[0].markLine.data[0].yAxis).toBe(4.2);
    expect(series[0].markLine.data[0].label.formatter).toContain("Overall avg: 4.2/wk");
  });

  it("omits markLine when orders_per_week is null, zero, or negative", () => {
    const theme = resolveChartTheme("light", "emerald");
    const optionNull = buildOrdersPerWeekOption(weeklyData, null, theme);
    const seriesNull = optionNull.series as any[];
    expect(seriesNull[0].markLine).toBeUndefined();

    const optionZero = buildOrdersPerWeekOption(weeklyData, 0, theme);
    const seriesZero = optionZero.series as any[];
    expect(seriesZero[0].markLine).toBeUndefined();
  });

  it("disables animations when prefersReducedMotion is true", () => {
    const theme = resolveChartTheme("light", "emerald");
    const option = buildOrdersPerWeekOption(weeklyData, 4.2, theme, true);
    expect(option.animation).toBe(false);
    expect(option.animationDuration).toBe(0);
  });
});

describe("formatOrdersPerWeekTooltip", () => {
  const weeklyData = [
    { week: "2025-W10", label: "Mar 3", orders: 5, movingAverage: 4.5, startDate: "2025-03-03", endDate: "2025-03-09" },
  ];
  const theme = resolveChartTheme("light", "emerald");

  it("formats rich tooltip with orders, moving average, and benchmark comparison", () => {
    const html = formatOrdersPerWeekTooltip(
      [{ dataIndex: 0 }],
      weeklyData,
      4.2,
      theme,
    );

    expect(html).toContain("Mar 3 (2025-03-03 to 2025-03-09)");
    expect(html).toContain("5 orders");
    expect(html).toContain("4.5 orders");
    expect(html).toContain("+0.8 vs overall avg (4.2/wk)");
  });

  it("handles negative comparison vs overall benchmark", () => {
    const html = formatOrdersPerWeekTooltip(
      [{ dataIndex: 0 }],
      weeklyData,
      6.0,
      theme,
    );
    expect(html).toContain("-1.0 vs overall avg (6.0/wk)");
  });

  it("handles tooltip when benchmark is omitted", () => {
    const html = formatOrdersPerWeekTooltip(
      [{ dataIndex: 0 }],
      weeklyData,
      null,
      theme,
    );
    expect(html).toContain("5 orders");
    expect(html).toContain("4.5 orders");
    expect(html).not.toContain("vs overall avg");
  });
});

describe("buildOrdersPerWeekTableRows", () => {
  it("generates headers, rows, and structured data", () => {
    const weeklyData = [
      { week: "2025-W10", label: "Mar 3", orders: 4, movingAverage: 4, startDate: "2025-03-03", endDate: "2025-03-09" },
      { week: "2025-W11", label: "Mar 10", orders: 6, movingAverage: 5, startDate: "2025-03-10", endDate: "2025-03-16" },
    ];
    const { tableHeaders, tableRows, tableData } = buildOrdersPerWeekTableRows(weeklyData);

    expect(tableHeaders).toEqual(["Week", "Orders", "4-Week Moving Avg"]);
    expect(tableRows).toEqual([
      ["Mar 3", 4, 4],
      ["Mar 10", 6, 5],
    ]);
    expect(tableData).toEqual([
      { Week: "Mar 3", Orders: 4, "4-Week Moving Avg": 4 },
      { Week: "Mar 10", Orders: 6, "4-Week Moving Avg": 5 },
    ]);
  });

  it("handles empty or null weeklyData", () => {
    const res = buildOrdersPerWeekTableRows([]);
    expect(res.tableHeaders).toEqual(["Week", "Orders", "4-Week Moving Avg"]);
    expect(res.tableRows).toEqual([]);
    expect(res.tableData).toEqual([]);
  });
});

describe("OrdersPerWeekChart React Component", () => {
  it("renders friendly empty state when calendar has no data or zero orders", () => {
    const html = renderToString(<OrdersPerWeekChart calendar={[]} />);
    expect(html).toContain("Weekly ordering rhythm");
    expect(html).toContain("No weekly ordering data available");
  });

  it("renders chart container with accessible role and aria-label when data is present", () => {
    const calendar = [
      { date: "2025-03-10", orders: 3 },
      { date: "2025-03-17", orders: 5 },
    ];
    const html = renderToString(
      <OrdersPerWeekChart
        calendar={calendar}
        orders_per_week={4}
      />,
    );
    expect(html).toContain("Weekly ordering rhythm");
    expect(html).toContain("Weekly order volume and 4-week moving average");
    expect(html).toContain('role="img"');
    expect(html).toContain("Weekly ordering rhythm line chart with 4-week moving average");
    expect(html).toContain("Averaging 4 orders per week");
  });

  it("renders OrdersPerWeekInfoContent popover details", () => {
    const html = renderToString(<OrdersPerWeekInfoContent />);
    expect(html).toContain("Weekly Ordering Rhythm");
    expect(html).toContain("Weekly Grouping");
    expect(html).toContain("4-Week Moving Average");
    expect(html).toContain("Overall Average Benchmark");
  });
});
