import { describe, expect, it, vi } from "vitest";
import * as React from "react";
import { renderToString } from "react-dom/server";
import {
  buildDailySpendCalendarOption,
  extractDailySpendAvailableYears,
  mergeDailySpendData,
  handleDailySpendDayClick,
  DailySpendCalendarChart,
} from "./DailySpendCalendarChart";
import { resolveChartTheme } from "@/lib/chart-theme";
import { computeDailySpendTakeaway } from "@/lib/captions";

describe("DailySpendCalendarChart option builder (CC-11, Scenario: Calendar)", () => {
  const sampleDaily = [
    { date: "2024-11-20", spend: 650 },
    { date: "2025-01-15", spend: 1250 },
    { date: "2025-03-22", spend: 350 },
    { date: "2025-10-24", spend: 3450 },
  ];

  const sampleCalendar = [
    { date: "2024-11-20", orders: 2, spend: 650 },
    { date: "2025-01-15", orders: 3, spend: 1250 },
    { date: "2025-03-22", orders: 1, spend: 350 },
    { date: "2025-10-24", orders: 4, spend: 3450 },
  ];

  it("builds a GitHub-style calendar heatmap option with calendar coordinate system and heatmap series", () => {
    const option = buildDailySpendCalendarOption({
      data: sampleDaily,
      calendar: sampleCalendar,
      year: "2025",
    }) as any;

    expect(option.calendar).toBeTruthy();
    expect(option.calendar.range).toBe("2025");
    expect(option.calendar.cellSize).toEqual(["auto", 16]);
    expect(option.calendar.dayLabel).toBeTruthy();
    expect(option.calendar.monthLabel).toBeTruthy();

    expect(Array.isArray(option.series)).toBe(true);
    expect(option.series[0].type).toBe("heatmap");
    expect(option.series[0].coordinateSystem).toBe("calendar");

    // Only 2025 dates should be in the series for year 2025
    expect(option.series[0].data.length).toBe(3);
    expect(option.series[0].data).toEqual([
      ["2025-01-15", 1250, 3],
      ["2025-03-22", 350, 1],
      ["2025-10-24", 3450, 4],
    ]);
  });

  it("configures visualMap legend horizontally mapped to spend dimension (dimension: 1)", () => {
    const option = buildDailySpendCalendarOption({
      data: sampleDaily,
      calendar: sampleCalendar,
      year: "2025",
    }) as any;

    expect(option.visualMap).toBeTruthy();
    expect(option.visualMap.dimension).toBe(1);
    expect(option.visualMap.orient).toBe("horizontal");
    expect(option.visualMap.left).toBe("center");
    expect(option.visualMap.bottom).toBe(0);
    expect(option.visualMap.min).toBe(0);
    expect(option.visualMap.max).toBe(3450);
    expect(option.visualMap.text).toEqual(["High", "₹0"]);
    expect(option.visualMap.inRange?.color).toBeInstanceOf(Array);
    expect(option.visualMap.inRange.color.length).toBeGreaterThan(0);
    expect(typeof option.visualMap.formatter).toBe("function");
    expect(option.visualMap.formatter(1500)).toBe("₹1,500");
  });

  it("supports positional argument call signature", () => {
    const option = buildDailySpendCalendarOption(sampleDaily, "2024") as any;
    expect(option.calendar.range).toBe("2024");
    expect(option.series[0].data.length).toBe(1);
    expect(option.series[0].data[0][0]).toBe("2024-11-20");
    expect(option.series[0].data[0][1]).toBe(650);
  });

  it("formats tooltip with Date, Spend in formatRupees, and Orders count", () => {
    const option = buildDailySpendCalendarOption({
      data: sampleDaily,
      calendar: sampleCalendar,
      year: "2025",
    }) as any;

    expect(typeof option.tooltip?.formatter).toBe("function");

    // Multiple orders tooltip
    const tooltipMultiple = option.tooltip.formatter({
      value: ["2025-10-24", 3450, 4],
    });
    expect(tooltipMultiple).toContain("2025-10-24");
    expect(tooltipMultiple).toContain("₹3,450");
    expect(tooltipMultiple).toContain("4 orders");

    // Single order tooltip
    const tooltipSingle = option.tooltip.formatter({
      value: ["2025-03-22", 350, 1],
    });
    expect(tooltipSingle).toContain("2025-03-22");
    expect(tooltipSingle).toContain("₹350");
    expect(tooltipSingle).toContain("1 order");

    // Lookup by date name
    const tooltipNameLookup = option.tooltip.formatter({
      name: "2025-01-15",
    });
    expect(tooltipNameLookup).toContain("2025-01-15");
    expect(tooltipNameLookup).toContain("₹1,250");
    expect(tooltipNameLookup).toContain("3 orders");

    // Empty date
    expect(option.tooltip.formatter({})).toBe("");
  });

  it("uses 600ms entry animation, bypassed when reducedMotion is true", () => {
    const normalOption = buildDailySpendCalendarOption({
      data: sampleDaily,
      year: "2025",
      reducedMotion: false,
    }) as any;
    expect(normalOption.animation).toBe(true);
    expect(normalOption.animationDuration).toBe(600);

    const reducedOption = buildDailySpendCalendarOption({
      data: sampleDaily,
      year: "2025",
      reducedMotion: true,
    }) as any;
    expect(reducedOption.animation).toBe(false);
    expect(reducedOption.animationDuration).toBe(0);
  });

  it("adapts colors to custom ChartTheme", () => {
    const darkTheme = resolveChartTheme("dark", "rose");
    const option = buildDailySpendCalendarOption({
      data: sampleDaily,
      year: "2025",
      theme: darkTheme,
    }) as any;

    expect(option.calendar.itemStyle.borderColor).toBe(darkTheme.border);
    expect(option.calendar.splitLine.lineStyle.color).toBe(darkTheme.splitLine);
    expect(option.visualMap.textStyle.color).toBe(darkTheme.mutedColor);
  });
});

describe("Data normalization & Year Extraction", () => {
  it("merges daily spend data and calendar data cleanly", () => {
    const daily = [{ date: "2025-04-10", spend: 900 }];
    const calendar = [{ date: "2025-04-10", orders: 2, spend: 900 }];

    const merged = mergeDailySpendData(daily, calendar);
    expect(merged.length).toBe(1);
    expect(merged[0]).toEqual({
      date: "2025-04-10",
      spend: 900,
      orders: 2,
      cumulative: undefined,
      rolling_30: undefined,
    });
  });

  it("extracts unique sorted years", () => {
    const rows = [
      { date: "2023-11-01" },
      { date: "2025-02-14" },
      { date: "2024-08-20" },
      { date: "2025-10-31" },
    ];
    expect(extractDailySpendAvailableYears(rows)).toEqual(["2023", "2024", "2025"]);
  });

  it("defaults to current year when rows are empty", () => {
    const years = extractDailySpendAvailableYears([]);
    expect(years.length).toBe(1);
    expect(years[0]).toBe(String(new Date().getFullYear()));
  });
});

describe("Scenario: Day click filter (CC-5)", () => {
  it("clicking a day sets date_from and date_to in FilterContext and invokes onDayClick", () => {
    const update = vi.fn();
    const filters = { update };
    const onDayClick = vi.fn();

    const clicked = handleDailySpendDayClick(
      { value: ["2025-10-24", 3450, 4] },
      filters,
      onDayClick,
    );
    expect(clicked).toBe("2025-10-24");
    expect(update).toHaveBeenCalledWith({
      date_from: "2025-10-24",
      date_to: "2025-10-24",
    });
    expect(onDayClick).toHaveBeenCalledWith("2025-10-24");
  });

  it("handles click from date string or object property", () => {
    const update = vi.fn();
    const filters = { update };

    expect(handleDailySpendDayClick({ date: "2025-05-19" }, filters)).toBe("2025-05-19");
    expect(handleDailySpendDayClick({ name: "2025-06-20" }, filters)).toBe("2025-06-20");
    expect(handleDailySpendDayClick({ value: "2025-07-21" }, filters)).toBe("2025-07-21");
    expect(update).toHaveBeenCalledTimes(3);
  });

  it("returns null and does not update filters on invalid params", () => {
    const update = vi.fn();
    const filters = { update };

    expect(handleDailySpendDayClick(null, filters)).toBeNull();
    expect(handleDailySpendDayClick({ value: "invalid" }, filters)).toBeNull();
    expect(update).not.toHaveBeenCalled();
  });
});

describe("Scenario: Unallocated spend note", () => {
  const sampleData = [{ date: "2025-01-01", spend: 500, orders: 1 }];

  it("displays explanatory note when unallocatedSpend is present", () => {
    const html = renderToString(
      <DailySpendCalendarChart
        data={sampleData}
        unallocatedSpend={1250}
      />,
    );
    expect(html).toContain("Spend without a valid recorded date: ₹1,250 (orders without a parseable date are excluded from the calendar heatmap).");
  });

  it("does not render unallocated spend note when unallocatedSpend is undefined or null", () => {
    const html = renderToString(
      <DailySpendCalendarChart
        data={sampleData}
      />,
    );
    expect(html).not.toContain("Spend without a valid recorded date:");
  });
});

describe("DailySpendCalendarChart React component & ChartCard integration (CC-1 to CC-12)", () => {
  const sampleData = [
    { date: "2024-12-15", spend: 1200, orders: 2 },
    { date: "2025-01-10", spend: 850, orders: 1 },
    { date: "2025-10-24", spend: 3450, orders: 4 },
  ];

  it("renders ChartCard with title, subtitle, accessible img role, and info popover trigger", () => {
    const html = renderToString(
      <DailySpendCalendarChart
        data={sampleData}
        unallocatedSpend={450}
      />,
    );
    expect(html).toContain("Daily spend calendar");
    expect(html).toContain("Daily expenditure heatmap across active calendar dates");
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Daily spend calendar information"');
    expect(html).toContain("Spend without a valid recorded date: ₹450 (orders without a parseable date are excluded from the calendar heatmap).");
  });

  it("renders year selector dropdown with available years", () => {
    const html = renderToString(<DailySpendCalendarChart data={sampleData} />);
    expect(html).toContain('aria-label="Calendar year"');
    expect(html).toContain("<option");
    expect(html).toContain("2024");
    expect(html).toContain("2025");
  });

  it("renders segmented control when yearSelectorVariant='segmented'", () => {
    const html = renderToString(
      <DailySpendCalendarChart data={sampleData} yearSelectorVariant="segmented" />,
    );
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('role="radio"');
    expect(html).toContain("2024");
    expect(html).toContain("2025");
  });

  it("displays computed takeaway caption in ChartCard (CC-8)", () => {
    const expectedCaption = computeDailySpendTakeaway(sampleData, "2025");
    expect(expectedCaption).toBe("Highest daily spend in 2025 was ₹3,450 on 2025-10-24");

    const html = renderToString(
      <DailySpendCalendarChart data={sampleData} year="2025" />,
    );
    expect(html).toContain("Highest daily spend in 2025 was ₹3,450 on 2025-10-24");
  });

  it("allows custom caption override", () => {
    const html = renderToString(
      <DailySpendCalendarChart
        data={sampleData}
        caption="Custom calendar takeaway"
      />,
    );
    expect(html).toContain("Custom calendar takeaway");
  });

  it("exposes tableData and toolbar actions for Table view and CSV export (CC-7)", () => {
    const html = renderToString(
      <DailySpendCalendarChart data={sampleData} />,
    );
    expect(html).toContain('aria-label="Toggle table view"');
    expect(html).toContain('aria-label="Download CSV"');
  });

  it("renders loading skeleton when isLoading is true", () => {
    const html = renderToString(
      <DailySpendCalendarChart data={sampleData} isLoading />,
    );
    expect(html).toContain("animate-pulse");
  });

  it("renders empty state when isEmpty or data is empty", () => {
    const html = renderToString(
      <DailySpendCalendarChart data={[]} emptyReason="No recorded daily spend" />,
    );
    expect(html).toContain("No recorded daily spend");
  });

  it("renders error state when error prop is supplied", () => {
    const onRetry = vi.fn();
    const html = renderToString(
      <DailySpendCalendarChart
        data={sampleData}
        error="Network error loading spend"
        onRetry={onRetry}
      />,
    );
    expect(html).toContain("Network error loading spend");
    expect(html).toContain("Retry");
  });
});
