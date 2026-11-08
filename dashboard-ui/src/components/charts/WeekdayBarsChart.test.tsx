import { describe, expect, it, vi } from "vitest";
import * as React from "react";
import { renderToString } from "react-dom/server";
import {
  buildWeekdayBarsOption,
  normalizeWeekdayBars,
  buildWeekdayTableRows,
  handleWeekdayBarClick,
  WeekdayBarsChart,
} from "./WeekdayBarsChart";
import { resolveChartTheme } from "@/lib/chart-theme";

describe("WeekdayBarsChart pure option builder (CC-2, CC-3, CC-8, CC-12)", () => {
  // Sample weekday data:
  // Keys: 0 = Mon 00:00, 156 = Sun 12:00
  const sampleData = [
    { key: "0", orders: 10, spend: 3000 }, // Mon
    { day: "Tue", orders: 12, spend: 4000 },
    { day: "Wed", orders: 15, spend: 5000 },
    { day: "Thu", orders: 8, spend: 2500 },
    { day: "Fri", orders: 20, spend: 7000 },
    { day: "Sat", orders: 18, spend: 6500 },
    { key: "156", orders: 24, spend: 9200 }, // Sun
  ];

  it("builds dual-axis grouped bars option with 7 days and legend for both metrics", () => {
    const theme = resolveChartTheme("light", "emerald");
    const option = buildWeekdayBarsOption(sampleData, {
      theme,
      activeDayType: "all",
      metricMode: "both",
    }) as any;

    // X-axis: 7 days
    expect(option.xAxis).toBeTruthy();
    expect(option.xAxis.type).toBe("category");
    expect(option.xAxis.data).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);

    // Dual Y-axes (left: Orders, right: Spend)
    expect(Array.isArray(option.yAxis)).toBe(true);
    expect(option.yAxis).toHaveLength(2);
    expect(option.yAxis[0].name).toBe("Orders");
    expect(option.yAxis[1].name).toBe("Spend");

    // Dual series: Orders and Spend
    expect(Array.isArray(option.series)).toBe(true);
    expect(option.series).toHaveLength(2);
    expect(option.series[0].name).toBe("Orders");
    expect(option.series[0].yAxisIndex).toBe(0);
    expect(option.series[0].data).toHaveLength(7);

    expect(option.series[1].name).toBe("Spend");
    expect(option.series[1].yAxisIndex).toBe(1);
    expect(option.series[1].data).toHaveLength(7);

    // Legend
    expect(option.legend).toBeTruthy();
    expect(option.legend.data).toEqual(["Orders", "Spend"]);
  });

  it("supports single metric mode for orders or spend", () => {
    const theme = resolveChartTheme("light", "emerald");

    // Orders only
    const ordersOpt = buildWeekdayBarsOption(sampleData, {
      theme,
      metricMode: "orders",
    }) as any;
    expect(ordersOpt.series).toHaveLength(1);
    expect(ordersOpt.series[0].name).toBe("Orders");
    expect(ordersOpt.yAxis.name).toBe("Orders");

    // Spend only
    const spendOpt = buildWeekdayBarsOption(sampleData, {
      theme,
      metricMode: "spend",
    }) as any;
    expect(spendOpt.series).toHaveLength(1);
    expect(spendOpt.series[0].name).toBe("Spend");
    expect(spendOpt.yAxis.name).toBe("Spend");
  });

  it("visually distinguishes weekend bars (Sat & Sun) by decal pattern AND color", () => {
    const theme = resolveChartTheme("light", "emerald");
    const option = buildWeekdayBarsOption(sampleData, {
      theme,
      activeDayType: "all",
      metricMode: "both",
    }) as any;

    const ordersSeries = option.series[0];
    const spendSeries = option.series[1];

    // Monday through Friday (indices 0..4) MUST have solid decal ("none")
    for (let i = 0; i <= 4; i++) {
      expect(ordersSeries.data[i].itemStyle.decal).toBe("none");
      expect(ordersSeries.data[i].itemStyle.color).toBe(theme.colors[0]);

      expect(spendSeries.data[i].itemStyle.decal).toBe("none");
      expect(spendSeries.data[i].itemStyle.color).toBe(theme.colors[2]);
    }

    // Saturday and Sunday (indices 5 and 6) MUST have line decal pattern AND distinct color
    for (let i = 5; i <= 6; i++) {
      // Decal pattern requirement: diagonal line pattern
      expect(ordersSeries.data[i].itemStyle.decal).toEqual({
        symbol: "line",
        rotation: Math.PI / 4,
      });
      // Color requirement: distinct color token for weekend bars
      expect(ordersSeries.data[i].itemStyle.color).toBe(theme.colors[1]);
      expect(ordersSeries.data[i].itemStyle.color).not.toBe(ordersSeries.data[0].itemStyle.color);

      // Spend series decal and distinct color
      expect(spendSeries.data[i].itemStyle.decal).toEqual({
        symbol: "line",
        rotation: Math.PI / 4,
      });
      expect(spendSeries.data[i].itemStyle.color).toBe(theme.colors[3]);
      expect(spendSeries.data[i].itemStyle.color).not.toBe(spendSeries.data[0].itemStyle.color);
    }
  });

  it("applies selection dimming when filters.day_type is weekday or weekend (CC-10)", () => {
    const theme = resolveChartTheme("light", "emerald");

    // 1. When day_type is 'weekday': weekend bars dim to opacity 0.35
    const weekdayOption = buildWeekdayBarsOption(sampleData, {
      theme,
      activeDayType: "weekday",
    }) as any;
    const weekdayOrders = weekdayOption.series[0].data;
    // Mon-Fri: full opacity (1)
    for (let i = 0; i <= 4; i++) {
      expect(weekdayOrders[i].itemStyle.opacity).toBe(1);
    }
    // Sat-Sun: dimmed (0.35)
    expect(weekdayOrders[5].itemStyle.opacity).toBe(0.35);
    expect(weekdayOrders[6].itemStyle.opacity).toBe(0.35);

    // 2. When day_type is 'weekend': weekday bars dim to opacity 0.35
    const weekendOption = buildWeekdayBarsOption(sampleData, {
      theme,
      activeDayType: "weekend",
    }) as any;
    const weekendOrders = weekendOption.series[0].data;
    // Mon-Fri: dimmed (0.35)
    for (let i = 0; i <= 4; i++) {
      expect(weekendOrders[i].itemStyle.opacity).toBe(0.35);
    }
    // Sat-Sun: full opacity (1)
    expect(weekendOrders[5].itemStyle.opacity).toBe(1);
    expect(weekendOrders[6].itemStyle.opacity).toBe(1);

    // 3. When day_type is 'all': all bars full opacity (1)
    const allOption = buildWeekdayBarsOption(sampleData, {
      theme,
      activeDayType: "all",
    }) as any;
    const allOrders = allOption.series[0].data;
    for (let i = 0; i <= 6; i++) {
      expect(allOrders[i].itemStyle.opacity).toBe(1);
    }
  });

  it("formats rich tooltip with Day, Type, Orders, Spend, and AOV (CC-9)", () => {
    const theme = resolveChartTheme("light", "emerald");
    const option = buildWeekdayBarsOption(sampleData, { theme }) as any;
    expect(typeof option.tooltip?.formatter).toBe("function");

    // Sunday (index 6): 24 orders, ₹9,200 spend -> AOV = 9200 / 24 = ₹383
    const sundayTooltip = option.tooltip.formatter([{ dataIndex: 6 }]);
    expect(sundayTooltip).toContain("Sunday (Weekend)");
    expect(sundayTooltip).toContain("24 orders");
    expect(sundayTooltip).toContain("₹9,200");
    expect(sundayTooltip).toContain("₹383");

    // Monday (index 0): 10 orders, ₹3,000 spend -> AOV = 3000 / 10 = ₹300
    const mondayTooltip = option.tooltip.formatter([{ dataIndex: 0 }]);
    expect(mondayTooltip).toContain("Monday (Weekday)");
    expect(mondayTooltip).toContain("10 orders");
    expect(mondayTooltip).toContain("₹3,000");
    expect(mondayTooltip).toContain("₹300");
  });
});

describe("WeekdayBarsChart click interactions (CC-6)", () => {
  const normalized = normalizeWeekdayBars([
    { day: "Mon", orders: 10, spend: 3000 },
    { day: "Sat", orders: 18, spend: 6500 },
  ]);

  it("toggles day_type: 'weekday' when clicking a weekday bar (Mon-Fri)", () => {
    const applyCrossFilter = vi.fn();
    const onBarClick = vi.fn();
    const filters = { applyCrossFilter };

    const clicked = handleWeekdayBarClick(
      { dataIndex: 0 }, // Monday
      filters,
      onBarClick,
      normalized,
    );

    expect(clicked?.dayShort).toBe("Mon");
    expect(clicked?.dayType).toBe("weekday");
    expect(applyCrossFilter).toHaveBeenCalledWith("weekday", "Mon");
    expect(onBarClick).toHaveBeenCalledWith(clicked);
  });

  it("toggles day_type: 'weekend' when clicking a weekend bar (Sat-Sun)", () => {
    const applyCrossFilter = vi.fn();
    const onBarClick = vi.fn();
    const filters = { applyCrossFilter };

    const clicked = handleWeekdayBarClick(
      { dataIndex: 5 }, // Saturday
      filters,
      onBarClick,
      normalized,
    );

    expect(clicked?.dayShort).toBe("Sat");
    expect(clicked?.dayType).toBe("weekend");
    expect(applyCrossFilter).toHaveBeenCalledWith("weekday", "Sat");
    expect(onBarClick).toHaveBeenCalledWith(clicked);
  });

  it("supports filters.update fallback when applyCrossFilter is not present", () => {
    const update = vi.fn();
    const filters = { update, filters: { day_type: "all" } };

    handleWeekdayBarClick({ dataIndex: 6 }, filters, undefined, normalized);
    expect(update).toHaveBeenCalledWith({ day_type: "weekend" });

    // Toggling off when already weekend
    const filtersActive = { update, filters: { day_type: "weekend" } };
    handleWeekdayBarClick({ dataIndex: 5 }, filtersActive, undefined, normalized);
    expect(update).toHaveBeenCalledWith({ day_type: "all" });
  });

  it("returns null on invalid click params", () => {
    const applyCrossFilter = vi.fn();
    const filters = { applyCrossFilter };

    expect(handleWeekdayBarClick(null, filters, undefined, normalized)).toBeNull();
    expect(handleWeekdayBarClick({ dataIndex: 99 }, filters, undefined, normalized)).toBeNull();
    expect(applyCrossFilter).not.toHaveBeenCalled();
  });
});

describe("WeekdayBarsChart accessibility table alternative (CC-4)", () => {
  const sampleData = [
    { day: "Mon", orders: 10, spend: 3000 },
    { day: "Sun", orders: 24, spend: 9200 },
  ];

  it("builds tableHeaders and tableRows correctly with INR formatted Spend and AOV", () => {
    const result = buildWeekdayTableRows(sampleData);

    expect(result.tableHeaders).toEqual(["Weekday", "Type", "Orders", "Spend", "AOV"]);
    expect(result.tableRows).toHaveLength(7);

    // Monday
    expect(result.tableRows[0]).toEqual(["Monday", "Weekday", 10, "₹3,000", "₹300"]);
    // Sunday
    expect(result.tableRows[6]).toEqual(["Sunday", "Weekend", 24, "₹9,200", "₹383"]);

    expect(result.tableData[0]).toEqual({
      Weekday: "Monday",
      Type: "Weekday",
      Orders: 10,
      Spend: "₹3,000",
      AOV: "₹300",
    });
    expect(result.tableData[6]).toEqual({
      Weekday: "Sunday",
      Type: "Weekend",
      Orders: 24,
      Spend: "₹9,200",
      AOV: "₹383",
    });
  });

  it("renders table view when showTable prop is true", () => {
    const html = renderToString(<WeekdayBarsChart data={sampleData} showTable />);

    expect(html).toContain('aria-label="Toggle table view"');
    expect(html).toContain("Weekday");
    expect(html).toContain("Type");
    expect(html).toContain("Orders");
    expect(html).toContain("Spend");
    expect(html).toContain("AOV");
    expect(html).toContain("Monday");
    expect(html).toContain("Sunday");
    expect(html).toContain("₹9,200");
  });
});

describe("WeekdayBarsChart React component rendering and empty states (CC-1, CC-5)", () => {
  const sampleData = [
    { day: "Mon", orders: 5, spend: 1500 },
    { day: "Tue", orders: 7, spend: 2100 },
    { day: "Wed", orders: 8, spend: 2400 },
    { day: "Thu", orders: 9, spend: 2800 },
    { day: "Fri", orders: 10, spend: 3500 },
    { day: "Sat", orders: 0, spend: 0 },
    { day: "Sun", orders: 24, spend: 9200 },
  ];

  it("renders inside ChartCard with title, subtitle, caption takeaway, info popover, and SegmentedControl", () => {
    const html = renderToString(<WeekdayBarsChart data={sampleData} />);

    expect(html).toContain("Weekday breakdown");
    expect(html).toContain("Distribution across days with weekend pattern distinction");
    expect(html).toContain(
      "Sunday is your busiest day with 24 orders (₹9,200); weekends account for 38% of total orders",
    );
    expect(html).toContain('aria-label="Weekday breakdown information"');
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain("Both");
    expect(html).toContain("Orders");
    expect(html).toContain("Spend");
    expect(html).toContain('role="img"');
  });

  it("renders empty state when date_unavailable_reason is present", () => {
    const html = renderToString(
      <WeekdayBarsChart
        data={[]}
        date_unavailable_reason="Order timestamps unavailable due to missing date headers"
      />,
    );

    expect(html).toContain("Order timestamps unavailable due to missing date headers");
  });

  it("renders empty state when data is empty or all orders zero", () => {
    const htmlEmpty = renderToString(<WeekdayBarsChart data={[]} />);
    expect(htmlEmpty).toContain("No weekday order data available");

    const htmlZero = renderToString(
      <WeekdayBarsChart
        data={[{ weekday: 0, orders: 0, spend: 0 }]}
      />,
    );
    expect(htmlZero).toContain("No weekday order data available");
  });
});
