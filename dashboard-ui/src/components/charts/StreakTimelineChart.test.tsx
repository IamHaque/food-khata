import { describe, expect, it } from "vitest";
import * as React from "react";
import { renderToString } from "react-dom/server";
import {
  StreakTimelineChart,
  StreakTimelineInfoContent,
  buildStreakTimelineOption,
  buildStreakTimelineTableRows,
  formatStreakTimelineTooltip,
  formatTimelineDate,
  formatTooltipDate,
  findLongestStreakRange,
  parseISODateToUtcDays,
} from "./StreakTimelineChart";
import { computeStreakTimelineTakeaway } from "@/lib/captions";
import { resolveChartTheme } from "@/lib/chart-theme";

describe("findLongestStreakRange helper", () => {
  it("finds multi-day streak accurately with start and end dates", () => {
    const calendar = [
      { date: "2025-03-10", orders: 1, spend: 100 },
      { date: "2025-03-11", orders: 2, spend: 200 },
      { date: "2025-03-12", orders: 1, spend: 150 },
      { date: "2025-03-13", orders: 3, spend: 400 },
      { date: "2025-03-14", orders: 1, spend: 100 },
      { date: "2025-03-15", orders: 1, spend: 100 },
    ];
    const range = findLongestStreakRange(calendar);
    expect(range).toEqual({
      startDate: "2025-03-10",
      endDate: "2025-03-15",
      length: 6,
      orders: 9,
      spend: 1050,
    });
  });

  it("handles single-day streak when all order days are isolated", () => {
    const calendar = [
      { date: "2025-03-01", orders: 1, spend: 100 },
      { date: "2025-03-05", orders: 4, spend: 450 },
      { date: "2025-03-10", orders: 2, spend: 250 },
    ];
    const range = findLongestStreakRange(calendar);
    expect(range?.length).toBe(1);
    expect(range?.startDate).toBe("2025-03-05");
    expect(range?.endDate).toBe("2025-03-05");
    expect(range?.orders).toBe(4);
  });

  it("handles gaps between ordering days and isolates the longest streak", () => {
    const calendar = [
      { date: "2025-02-01", orders: 1 },
      { date: "2025-02-02", orders: 1 }, // 2-day streak
      { date: "2025-02-10", orders: 1 },
      { date: "2025-02-11", orders: 2 },
      { date: "2025-02-12", orders: 1 },
      { date: "2025-02-13", orders: 1 }, // 4-day streak
      { date: "2025-02-20", orders: 1 },
    ];
    const range = findLongestStreakRange(calendar);
    expect(range?.startDate).toBe("2025-02-10");
    expect(range?.endDate).toBe("2025-02-13");
    expect(range?.length).toBe(4);
    expect(range?.orders).toBe(5);
  });

  it("breaks ties in streak length: prefers higher order count, then most recent date", () => {
    // Tie in length, different order counts
    const calendarWithDiffOrders = [
      { date: "2025-01-01", orders: 1 },
      { date: "2025-01-02", orders: 1 }, // 2 days, 2 orders
      { date: "2025-01-10", orders: 3 },
      { date: "2025-01-11", orders: 2 }, // 2 days, 5 orders
    ];
    expect(findLongestStreakRange(calendarWithDiffOrders)?.startDate).toBe("2025-01-10");

    // Tie in length and orders: prefers more recent date
    const calendarWithSameOrders = [
      { date: "2025-01-01", orders: 2 },
      { date: "2025-01-02", orders: 2 }, // 2 days, 4 orders
      { date: "2025-02-01", orders: 2 },
      { date: "2025-02-02", orders: 2 }, // 2 days, 4 orders
    ];
    expect(findLongestStreakRange(calendarWithSameOrders)?.startDate).toBe("2025-02-01");
  });

  it("handles unordered entries and duplicate dates correctly", () => {
    const unordered = [
      { date: "2025-03-03", orders: 1, spend: 100 },
      { date: "2025-03-01", orders: 2, spend: 200 },
      { date: "2025-03-02", orders: 1, spend: 150 },
      { date: "2025-03-02", orders: 1, spend: 50 }, // duplicate date
    ];
    const range = findLongestStreakRange(unordered);
    expect(range?.startDate).toBe("2025-03-01");
    expect(range?.endDate).toBe("2025-03-03");
    expect(range?.length).toBe(3);
    expect(range?.orders).toBe(5);
    expect(range?.spend).toBe(500);
  });

  it("returns null for empty, null, or all-zero orders", () => {
    expect(findLongestStreakRange(null)).toBeNull();
    expect(findLongestStreakRange([])).toBeNull();
    expect(findLongestStreakRange([{ date: "2025-01-01", orders: 0 }])).toBeNull();
  });
});

describe("date formatting helpers", () => {
  it("formats timeline date as MMM d, yyyy", () => {
    expect(formatTimelineDate("2025-03-10")).toBe("Mar 10, 2025");
    expect(formatTimelineDate("2025-01-05")).toBe("Jan 5, 2025");
    expect(formatTimelineDate("2024-12-31")).toBe("Dec 31, 2024");
  });

  it("formats tooltip date as dd MMM yyyy", () => {
    expect(formatTooltipDate("2025-03-10")).toBe("10 Mar 2025");
    expect(formatTooltipDate("2025-01-05")).toBe("05 Jan 2025");
    expect(formatTooltipDate("2024-12-31")).toBe("31 Dec 2024");
  });

  it("computes UTC days differences across month boundaries safely", () => {
    const feb28 = parseISODateToUtcDays("2025-02-28");
    const mar01 = parseISODateToUtcDays("2025-03-01");
    expect(mar01 - feb28).toBe(1);
  });
});

describe("buildStreakTimelineOption pure option builder", () => {
  const sampleCalendar = [
    { date: "2025-03-10", orders: 1, spend: 120 },
    { date: "2025-03-11", orders: 2, spend: 300 },
    { date: "2025-03-12", orders: 1, spend: 150 },
    { date: "2025-03-13", orders: 2, spend: 280 },
    { date: "2025-03-14", orders: 1, spend: 110 },
    { date: "2025-03-15", orders: 2, spend: 400 },
  ];

  it("creates category xAxis, value yAxis, and applies theme tokens", () => {
    const theme = resolveChartTheme("light", "emerald");
    const option = buildStreakTimelineOption(sampleCalendar, 6, theme) as any;

    expect(option.xAxis.type).toBe("category");
    expect(option.xAxis.data).toEqual([
      "2025-03-10",
      "2025-03-11",
      "2025-03-12",
      "2025-03-13",
      "2025-03-14",
      "2025-03-15",
    ]);
    expect(option.xAxis.axisLabel.formatter("2025-03-10")).toBe("Mar 10, 2025");

    expect(option.yAxis.type).toBe("value");
    expect(option.yAxis.name).toBe("Orders");
    expect(option.yAxis.minInterval).toBe(1);

    expect(option.series).toHaveLength(1);
    expect(option.series[0].type).toBe("bar");
  });

  it("configures markArea spanning the longest streak with accent color and label", () => {
    const theme = resolveChartTheme("light", "emerald");
    const option = buildStreakTimelineOption(sampleCalendar, 6, theme) as any;

    const series = option.series[0];
    expect(series.markArea).toBeDefined();
    expect(series.markArea.data).toHaveLength(1);

    const markAreaItem = series.markArea.data[0];
    expect(markAreaItem[0].xAxis).toBe("2025-03-10");
    expect(markAreaItem[1].xAxis).toBe("2025-03-15");
    expect(markAreaItem[0].name).toBe("Longest streak: 6 days");
    expect(markAreaItem[0].label.formatter).toBe("Longest streak: 6 days");
    expect(markAreaItem[0].itemStyle.color).toBe(theme.colors[1]);
    expect(markAreaItem[0].itemStyle.opacity).toBe(0.18);
  });

  it("highlights bars within the streak using theme.colors[1] and non-streak bars with theme.colors[0]", () => {
    const theme = resolveChartTheme("light", "emerald");
    const extendedCalendar = [
      { date: "2025-03-01", orders: 1, spend: 100 }, // isolated
      ...sampleCalendar, // 2025-03-10 to 2025-03-15 (longest streak)
    ];
    const option = buildStreakTimelineOption(extendedCalendar, 6, theme) as any;

    const data = option.series[0].data;
    // 2025-03-01 is not part of the streak -> theme.colors[0]
    expect(data[0].itemStyle.color).toBe(theme.colors[0]);
    // 2025-03-10 is part of the streak -> theme.colors[1]
    expect(data[1].itemStyle.color).toBe(theme.colors[1]);
  });

  it("configures animation entry and reduced motion bypass", () => {
    const theme = resolveChartTheme("dark", "indigo");
    const optNormal = buildStreakTimelineOption(sampleCalendar, 6, theme, false) as any;
    expect(optNormal.animation).toBe(true);
    expect(optNormal.animationDuration).toBe(600);
    expect(optNormal.animationEasing).toBe("cubicOut");

    const optReduced = buildStreakTimelineOption(sampleCalendar, 6, theme, true) as any;
    expect(optReduced.animation).toBe(false);
    expect(optReduced.animationDuration).toBe(0);
  });

  it("handles empty calendar without crashing and omits markArea", () => {
    const theme = resolveChartTheme("light", "emerald");
    const option = buildStreakTimelineOption([], null, theme) as any;
    expect(option.series[0].data).toHaveLength(0);
    expect(option.series[0].markArea).toBeUndefined();
  });
});

describe("formatStreakTimelineTooltip", () => {
  const theme = resolveChartTheme("light", "emerald");
  const calendarMap = new Map([
    ["2025-03-10", { orders: 1, spend: 120 }],
    ["2025-03-11", { orders: 2, spend: 300 }],
    ["2025-03-20", { orders: 3, spend: 450 }],
  ]);
  const range = {
    startDate: "2025-03-10",
    endDate: "2025-03-11",
    length: 2,
    orders: 3,
    spend: 420,
  };

  it("renders tooltip for day inside the longest streak with streak indicator", () => {
    const tooltip = formatStreakTimelineTooltip(
      { axisValueLabel: "2025-03-11" },
      calendarMap,
      range,
      theme,
    );
    expect(tooltip).toContain("11 Mar 2025");
    expect(tooltip).toContain("2 orders");
    expect(tooltip).toContain("₹300");
    expect(tooltip).toContain("★ Part of longest streak (Day 2 of 2)");
  });

  it("renders tooltip for day outside the streak without streak badge", () => {
    const tooltip = formatStreakTimelineTooltip(
      { axisValueLabel: "2025-03-20" },
      calendarMap,
      range,
      theme,
    );
    expect(tooltip).toContain("20 Mar 2025");
    expect(tooltip).toContain("3 orders");
    expect(tooltip).toContain("₹450");
    expect(tooltip).not.toContain("★ Part of longest streak");
  });
});

describe("buildStreakTimelineTableRows screen-reader table alternative", () => {
  it("generates correct table headers, rows, and data", () => {
    const calendar = [
      { date: "2025-03-10", orders: 1, spend: 120 },
      { date: "2025-03-11", orders: 2, spend: 300 },
      { date: "2025-03-20", orders: 1, spend: 150 },
    ];
    const { tableHeaders, tableRows, tableData } = buildStreakTimelineTableRows(
      calendar,
      2,
    );

    expect(tableHeaders).toEqual(["Date", "Orders", "Spend", "Streak"]);
    expect(tableRows).toHaveLength(3);
    expect(tableRows[0]).toEqual([
      "2025-03-10",
      1,
      "₹120",
      "Part of longest streak (Day 1 of 2)",
    ]);
    expect(tableRows[1]).toEqual([
      "2025-03-11",
      2,
      "₹300",
      "Part of longest streak (Day 2 of 2)",
    ]);
    expect(tableRows[2]).toEqual(["2025-03-20", 1, "₹150", "-"]);

    expect(tableData[0]).toEqual({
      Date: "2025-03-10",
      Orders: 1,
      Spend: 120,
      Streak: "Part of longest streak (Day 1 of 2)",
    });
  });

  it("returns empty arrays for missing calendar data", () => {
    const { tableHeaders, tableRows, tableData } = buildStreakTimelineTableRows(null);
    expect(tableHeaders).toEqual(["Date", "Orders", "Spend", "Streak"]);
    expect(tableRows).toHaveLength(0);
    expect(tableData).toHaveLength(0);
  });
});

describe("StreakTimelineChart React component rendering", () => {
  const sampleCalendar = [
    { date: "2025-03-10", orders: 1, spend: 120 },
    { date: "2025-03-11", orders: 2, spend: 300 },
    { date: "2025-03-12", orders: 1, spend: 150 },
    { date: "2025-03-13", orders: 2, spend: 280 },
    { date: "2025-03-14", orders: 1, spend: 110 },
    { date: "2025-03-15", orders: 2, spend: 400 },
  ];

  it("renders ChartCard with title, subtitle, and dynamic takeaway caption", () => {
    const html = renderToString(
      <StreakTimelineChart
        calendar={sampleCalendar}
        longest_streak={6}
      />,
    );

    expect(html).toContain("Ordering streak timeline");
    expect(html).toContain(
      "Order days across time with longest streak highlighted and labelled",
    );
    expect(html).toContain(
      "Longest ordering streak was 6 consecutive days (2025-03-10 to 2025-03-15) with 9 orders",
    );
  });

  it("renders info popover detailing consecutive days, calculation, and highlighting", () => {
    const html = renderToString(
      <StreakTimelineChart
        calendar={sampleCalendar}
        longest_streak={6}
      />,
    );

    expect(html).toContain("Ordering streak timeline information");

    const popoverHtml = renderToString(<StreakTimelineInfoContent />);
    expect(popoverHtml).toContain("Ordering Streak Timeline");
    expect(popoverHtml).toContain("Consecutive Days:");
    expect(popoverHtml).toContain("Longest Streak:");
    expect(popoverHtml).toContain("Timeline Highlighting:");
  });

  it("renders friendly empty state when calendar has no orders", () => {
    const htmlEmpty = renderToString(<StreakTimelineChart calendar={[]} />);
    expect(htmlEmpty).toContain("No order streak data recorded");

    const htmlNull = renderToString(<StreakTimelineChart calendar={null} />);
    expect(htmlNull).toContain("No order streak data recorded");

    const htmlZeros = renderToString(
      <StreakTimelineChart calendar={[{ date: "2025-01-01", orders: 0 }]} />,
    );
    expect(htmlZeros).toContain("No order streak data recorded");
  });

  it("renders custom caption when provided", () => {
    const html = renderToString(
      <StreakTimelineChart
        calendar={sampleCalendar}
        caption="Custom streak takeaway note"
      />,
    );
    expect(html).toContain("Custom streak takeaway note");
  });
});
