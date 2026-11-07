import { describe, expect, it, vi } from "vitest";
import * as React from "react";
import { renderToString } from "react-dom/server";
import {
  buildCalendarHeatmapOption,
  extractAvailableYears,
  computeCalendarTakeaway,
  handleDayClick,
  CalendarHeatmapChart,
  type CalendarHeatmapDatum,
} from "./CalendarHeatmapChart";
import { resolveChartTheme } from "@/lib/chart-theme";

describe("CalendarHeatmapChart option builder", () => {
  const sampleData: CalendarHeatmapDatum[] = [
    { date: "2024-11-20", orders: 2, spend: 600 },
    { date: "2025-01-15", orders: 3, spend: 1250 },
    { date: "2025-03-22", orders: 1, spend: 350 },
    { date: "2025-07-04", orders: 5, spend: 2100 },
  ];

  it("builds a GitHub-style calendar heatmap option with calendar, series, and visualMap", () => {
    const option = buildCalendarHeatmapOption(sampleData, "2025") as any;

    expect(option.calendar).toBeTruthy();
    expect(option.calendar.range).toBe("2025");
    expect(option.calendar.cellSize).toEqual(["auto", 16]);
    expect(option.calendar.dayLabel).toBeTruthy();
    expect(option.calendar.monthLabel).toBeTruthy();

    expect(Array.isArray(option.series)).toBe(true);
    expect(option.series[0].type).toBe("heatmap");
    expect(option.series[0].coordinateSystem).toBe("calendar");

    // Only 2025 data should be in the series for year 2025
    expect(option.series[0].data.length).toBe(3);
    expect(option.series[0].data).toEqual([
      ["2025-01-15", 3, 1250],
      ["2025-03-22", 1, 350],
      ["2025-07-04", 5, 2100],
    ]);

    expect(option.visualMap).toBeTruthy();
    expect(option.visualMap.dimension).toBe(1);
    expect(option.visualMap.max).toBe(5);
    expect(option.visualMap.inRange?.color).toBeInstanceOf(Array);
    expect(option.visualMap.inRange.color.length).toBeGreaterThan(0);
  });

  it("switches calendar year and filters series data accordingly", () => {
    const opt2024 = buildCalendarHeatmapOption(sampleData, "2024") as any;
    expect(opt2024.calendar.range).toBe("2024");
    expect(opt2024.series[0].data.length).toBe(1);
    expect(opt2024.series[0].data[0][0]).toBe("2024-11-20");

    const opt2025 = buildCalendarHeatmapOption(sampleData, "2025") as any;
    expect(opt2025.calendar.range).toBe("2025");
    expect(opt2025.series[0].data.length).toBe(3);
  });

  it("formats tooltip with date, orders count, and spend in en-IN rupees", () => {
    const option = buildCalendarHeatmapOption(sampleData, "2025") as any;
    expect(typeof option.tooltip?.formatter).toBe("function");

    // Scenario: Tooltip with multiple orders
    const tooltipMultiple = option.tooltip.formatter({
      value: ["2025-01-15", 3, 1250],
    });
    expect(tooltipMultiple).toContain("2025-01-15");
    expect(tooltipMultiple).toContain("3 orders");
    expect(tooltipMultiple).toContain("₹1,250");

    // Scenario: Tooltip with 1 order (singular)
    const tooltipSingle = option.tooltip.formatter({
      value: ["2025-03-22", 1, 350],
    });
    expect(tooltipSingle).toContain("2025-03-22");
    expect(tooltipSingle).toContain("1 order");
    expect(tooltipSingle).toContain("₹350");

    // Scenario: Tooltip lookup by date
    const tooltipLookup = option.tooltip.formatter({
      name: "2025-07-04",
    });
    expect(tooltipLookup).toContain("2025-07-04");
    expect(tooltipLookup).toContain("5 orders");
    expect(tooltipLookup).toContain("₹2,100");
  });

  it("honors reducedMotion option", () => {
    const option = buildCalendarHeatmapOption(sampleData, {
      year: "2025",
      reducedMotion: true,
    }) as any;
    expect(option.animation).toBe(false);
    expect(option.animationDuration).toBe(0);
  });

  it("uses theme token colors across light and dark themes", () => {
    const darkTheme = resolveChartTheme("dark", "indigo");
    const option = buildCalendarHeatmapOption(sampleData, {
      year: "2025",
      theme: darkTheme,
    }) as any;

    expect(option.calendar.itemStyle.borderColor).toBe(darkTheme.border);
    expect(option.visualMap.inRange.color[3]).toBe(darkTheme["chart-1"]);
  });
});

describe("extractAvailableYears & computeCalendarTakeaway", () => {
  const sampleData: CalendarHeatmapDatum[] = [
    { date: "2023-12-31", orders: 1, spend: 200 },
    { date: "2024-05-10", orders: 4, spend: 1100 },
    { date: "2024-08-15", orders: 2, spend: 500 },
  ];

  it("extracts unique sorted years from dataset", () => {
    const years = extractAvailableYears(sampleData);
    expect(years).toEqual(["2023", "2024"]);
  });

  it("defaults to current year when dataset is empty", () => {
    const years = extractAvailableYears([]);
    expect(years.length).toBe(1);
    expect(years[0]).toMatch(/^\d{4}$/);
  });

  it("computes busiest day takeaway caption for the given year", () => {
    const caption2024 = computeCalendarTakeaway(sampleData, "2024");
    expect(caption2024).toContain("Busiest day in 2024 was 2024-05-10 with 4 orders");
  });

  it("returns null takeaway when no data matches", () => {
    const caption = computeCalendarTakeaway([], "2025");
    expect(caption).toBeNull();
  });
});

describe("CalendarHeatmapChart component rendering", () => {
  const sampleData: CalendarHeatmapDatum[] = [
    { date: "2024-06-01", orders: 1, spend: 300 },
    { date: "2025-01-01", orders: 2, spend: 500 },
    { date: "2025-02-14", orders: 4, spend: 1600 },
  ];

  it("renders GitHub-style calendar chart inside ChartCard with title and subtitle", () => {
    const html = renderToString(
      <CalendarHeatmapChart
        data={sampleData}
        title="Order activity calendar"
        subtitle="GitHub-style calendar showing orders per day"
      />,
    );
    expect(html).toContain("Order activity calendar");
    expect(html).toContain("GitHub-style calendar showing orders per day");
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Order activity calendar"');
  });

  it("renders year selector dropdown with available years", () => {
    const html = renderToString(<CalendarHeatmapChart data={sampleData} />);
    expect(html).toContain('aria-label="Calendar year"');
    expect(html).toContain("<option");
    expect(html).toContain("2024");
    expect(html).toContain("2025");
  });

  it("renders segmented control when yearSelectorVariant='segmented'", () => {
    const html = renderToString(
      <CalendarHeatmapChart data={sampleData} yearSelectorVariant="segmented" />,
    );
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('role="radio"');
    expect(html).toContain("2024");
    expect(html).toContain("2025");
  });

  it("renders loading skeleton when isLoading is true", () => {
    const html = renderToString(
      <CalendarHeatmapChart data={sampleData} isLoading />,
    );
    expect(html).toContain("animate-pulse");
  });

  it("renders empty state when isEmpty or data is empty", () => {
    const html = renderToString(
      <CalendarHeatmapChart data={[]} emptyReason="No recorded activity" />,
    );
    expect(html).toContain("No recorded activity");
  });

  it("renders error state when error prop is set", () => {
    const onRetry = vi.fn();
    const html = renderToString(
      <CalendarHeatmapChart
        data={sampleData}
        error="Failed to load calendar"
        onRetry={onRetry}
      />,
    );
    expect(html).toContain("Failed to load calendar");
    expect(html).toContain("Retry");
  });

  it("exposes tableData with Date, Orders, and Spend", () => {
    const html = renderToString(
      <CalendarHeatmapChart data={sampleData} />
    );
    expect(html).toContain('aria-label="Toggle table view"');
    expect(html).toContain('aria-label="Download CSV"');
  });
});

describe("Scenario: Click (CC-5)", () => {
  it("clicking a day sets date_from and date_to to that day in FilterContext", () => {
    const update = vi.fn();
    const filters = { update };
    const onDayClick = vi.fn();

    const clicked = handleDayClick(
      { value: ["2025-04-12", 2, 800] },
      filters,
      onDayClick,
    );
    expect(clicked).toBe("2025-04-12");
    expect(update).toHaveBeenCalledWith({
      date_from: "2025-04-12",
      date_to: "2025-04-12",
    });
    expect(onDayClick).toHaveBeenCalledWith("2025-04-12");
  });

  it("handles click from calendar cell date property", () => {
    const update = vi.fn();
    const filters = { update };

    const clicked = handleDayClick({ date: "2025-10-31" }, filters);
    expect(clicked).toBe("2025-10-31");
    expect(update).toHaveBeenCalledWith({
      date_from: "2025-10-31",
      date_to: "2025-10-31",
    });
  });

  it("ignores clicks that do not contain a valid date", () => {
    const update = vi.fn();
    const filters = { update };

    const clicked = handleDayClick({ value: "invalid" }, filters);
    expect(clicked).toBeNull();
    expect(update).not.toHaveBeenCalled();
  });
});


