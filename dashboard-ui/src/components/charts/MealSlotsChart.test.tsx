import { describe, expect, it, vi } from "vitest";
import * as React from "react";
import { renderToString } from "react-dom/server";
import {
  buildMealSlotsOption,
  normalizeMealSlotRows,
  buildMealSlotsTableRows,
  handleMealSlotClick,
  MealSlotsChart,
  MealSlotsInfoContent,
  MEAL_SLOT_KEYS,
  MEAL_SLOT_LABELS,
  MEAL_SLOT_WINDOWS,
} from "./MealSlotsChart";
import { computeMealSlotsTakeaway } from "@/lib/captions";
import { resolveChartTheme } from "@/lib/chart-theme";

describe("MealSlotsChart pure option builder (CC-3, CC-9)", () => {
  const sampleData = [
    { key: "breakfast", orders: 10, spend: 2500 },
    { key: "lunch", orders: 25, spend: 7500 },
    { key: "snack", orders: 5, spend: 1200 },
    { key: "dinner", orders: 45, spend: 18500 },
    { key: "late_night", orders: 15, spend: 4500 },
  ];

  it("configures polar coordinate system with angle category axis and polar bar series", () => {
    const theme = resolveChartTheme("light", "emerald");
    const option = buildMealSlotsOption(sampleData, theme) as any;

    // Polar coordinate system
    expect(option.polar).toBeTruthy();
    expect(option.polar.radius).toEqual(["18%", "78%"]);

    // Angle axis (5 categories in canonical order)
    expect(option.angleAxis).toBeTruthy();
    expect(option.angleAxis.type).toBe("category");
    expect(option.angleAxis.data).toEqual([
      "Breakfast",
      "Lunch",
      "Snack",
      "Dinner",
      "Late night",
    ]);
    expect(option.angleAxis.startAngle).toBe(90);

    // Radius axis (value axis)
    expect(option.radiusAxis).toBeTruthy();
    expect(option.radiusAxis.min).toBe(0);

    // Series
    expect(Array.isArray(option.series)).toBe(true);
    expect(option.series).toHaveLength(1);
    expect(option.series[0].type).toBe("bar");
    expect(option.series[0].coordinateSystem).toBe("polar");
    expect(option.series[0].data).toHaveLength(5);

    // Check data points order
    const seriesValues = option.series[0].data.map((d: any) => d.value);
    expect(seriesValues).toEqual([10, 25, 5, 45, 15]);
  });

  it("assigns distinct theme colors to each meal slot", () => {
    const theme = resolveChartTheme("light", "emerald");
    const option = buildMealSlotsOption(sampleData, theme) as any;
    const seriesData = option.series[0].data;

    expect(seriesData[0].itemStyle.color).toBe(theme.colors[0]);
    expect(seriesData[1].itemStyle.color).toBe(theme.colors[1]);
    expect(seriesData[2].itemStyle.color).toBe(theme.colors[2]);
    expect(seriesData[3].itemStyle.color).toBe(theme.colors[3]);
    expect(seriesData[4].itemStyle.color).toBe(theme.colors[4]);
  });

  it("dims unselected slots to opacity 0.35 when a meal slot filter is active", () => {
    const theme = resolveChartTheme("light", "emerald");
    const option = buildMealSlotsOption(sampleData, theme, ["dinner"]) as any;
    const seriesData = option.series[0].data;

    // Breakfast (idx 0), Lunch (idx 1), Snack (idx 2), Late night (idx 4) should be dimmed
    expect(seriesData[0].itemStyle.opacity).toBe(0.35);
    expect(seriesData[1].itemStyle.opacity).toBe(0.35);
    expect(seriesData[2].itemStyle.opacity).toBe(0.35);
    expect(seriesData[4].itemStyle.opacity).toBe(0.35);

    // Dinner (idx 3) should be full opacity 1
    expect(seriesData[3].itemStyle.opacity).toBe(1);
  });

  it("keeps all slots at opacity 1 when no slot filter is active", () => {
    const theme = resolveChartTheme("light", "emerald");
    const option = buildMealSlotsOption(sampleData, theme, []) as any;
    const seriesData = option.series[0].data;

    expect(seriesData.every((d: any) => d.itemStyle.opacity === 1)).toBe(true);
  });

  it("keeps multiple selected slots at opacity 1 and dims remaining", () => {
    const theme = resolveChartTheme("light", "emerald");
    const option = buildMealSlotsOption(sampleData, theme, ["lunch", "dinner"]) as any;
    const seriesData = option.series[0].data;

    expect(seriesData[0].itemStyle.opacity).toBe(0.35); // breakfast
    expect(seriesData[1].itemStyle.opacity).toBe(1);    // lunch
    expect(seriesData[2].itemStyle.opacity).toBe(0.35); // snack
    expect(seriesData[3].itemStyle.opacity).toBe(1);    // dinner
    expect(seriesData[4].itemStyle.opacity).toBe(0.35); // late_night
  });

  it("formats rich tooltip with meal slot label, window, orders, share, and rupees spend", () => {
    const theme = resolveChartTheme("light", "emerald");
    const option = buildMealSlotsOption(sampleData, theme) as any;
    expect(typeof option.tooltip?.formatter).toBe("function");

    const dinnerItem = option.series[0].data[3];
    const tooltipHtml = option.tooltip.formatter({
      data: dinnerItem,
      dataIndex: 3,
    });

    expect(tooltipHtml).toContain("Dinner");
    expect(tooltipHtml).toContain("7:00 PM – 11:00 PM");
    expect(tooltipHtml).toContain("45 orders");
    expect(tooltipHtml).toContain("45.0%");
    expect(tooltipHtml).toContain("₹18,500");
  });

  it("adapts to dark mode theme tokens and colors", () => {
    const darkTheme = resolveChartTheme("dark", "indigo");
    const option = buildMealSlotsOption(sampleData, darkTheme) as any;

    expect(option.angleAxis.axisLabel.color).toBe(darkTheme.textColor);
    expect(option.angleAxis.axisLine.lineStyle.color).toBe(darkTheme.axisLineColor);
    expect(option.series[0].data[0].itemStyle.color).toBe(darkTheme.colors[0]);
  });

  it("honors reducedMotion option to disable animations", () => {
    const option = buildMealSlotsOption({
      data: sampleData,
      prefersReducedMotion: true,
    }) as any;

    expect(option.animation).toBe(false);
    expect(option.animationDuration).toBe(0);
  });

  it("normalizes empty or null data into 5 zero-filled canonical slots", () => {
    const slots = normalizeMealSlotRows(null);
    expect(slots).toHaveLength(5);
    expect(slots.map((s) => s.key)).toEqual([
      "breakfast",
      "lunch",
      "snack",
      "dinner",
      "late_night",
    ]);
    expect(slots.every((s) => s.orders === 0 && s.spend === 0)).toBe(true);
  });
});

describe("MealSlotsChart screen reader table rows (CC-7)", () => {
  it("builds tableHeaders and tableRows correctly with formatted rupees", () => {
    const data = [
      { key: "dinner", orders: 40, spend: 16000 },
      { key: "lunch", orders: 10, spend: 4000 },
    ];
    const { tableHeaders, tableRows, tableData } = buildMealSlotsTableRows(data);

    expect(tableHeaders).toEqual(["Meal slot", "Orders", "Spend", "Share"]);
    expect(tableRows).toHaveLength(5);

    // Lunch row
    const lunchRow = tableRows.find((r) => r[0] === "Lunch");
    expect(lunchRow).toEqual(["Lunch", 10, "₹4,000", "20.0%"]);

    // Dinner row
    const dinnerRow = tableRows.find((r) => r[0] === "Dinner");
    expect(dinnerRow).toEqual(["Dinner", 40, "₹16,000", "80.0%"]);

    // Breakfast row (empty)
    const breakfastRow = tableRows.find((r) => r[0] === "Breakfast");
    expect(breakfastRow).toEqual(["Breakfast", 0, "₹0", "0.0%"]);

    // tableData check
    expect(tableData[3]).toEqual({
      "Meal slot": "Dinner",
      Orders: 40,
      Spend: "₹16,000",
      Share: "80.0%",
    });
  });
});

describe("MealSlotsChart click interaction (CC-4)", () => {
  it("triggers crossFilter via applyCrossFilter on slot click", () => {
    const applyCrossFilter = vi.fn();
    const filters = { applyCrossFilter };
    const onSlotClick = vi.fn();

    const clicked = handleMealSlotClick(
      { data: { key: "dinner" } },
      filters as any,
      onSlotClick,
    );

    expect(clicked).toBe("dinner");
    expect(applyCrossFilter).toHaveBeenCalledWith("meal_slot", "dinner", false);
    expect(onSlotClick).toHaveBeenCalledWith("dinner", false);
  });

  it("handles shift-click for multi-selection", () => {
    const applyCrossFilter = vi.fn();
    const filters = { applyCrossFilter };
    const onSlotClick = vi.fn();

    const clicked = handleMealSlotClick(
      {
        data: { key: "lunch" },
        event: { event: { shiftKey: true } },
      },
      filters as any,
      onSlotClick,
    );

    expect(clicked).toBe("lunch");
    expect(applyCrossFilter).toHaveBeenCalledWith("meal_slot", "lunch", true);
    expect(onSlotClick).toHaveBeenCalledWith("lunch", true);
  });

  it("updates filters directly via update() if applyCrossFilter is not present", () => {
    const update = vi.fn();
    const filters = { meal_slots: ["lunch"], update };

    // Clicking dinner adds it or toggles it
    handleMealSlotClick({ dataIndex: 3 }, filters as any); // 3 = dinner
    expect(update).toHaveBeenCalledWith({ meal_slots: ["dinner"] });

    // Clicking lunch when lunch is already single selected deselects it
    handleMealSlotClick({ dataIndex: 1 }, filters as any); // 1 = lunch
    expect(update).toHaveBeenCalledWith({ meal_slots: [] });
  });

  it("resolves slot key from category label name", () => {
    const applyCrossFilter = vi.fn();
    const clicked = handleMealSlotClick(
      { name: "Late night" },
      { applyCrossFilter } as any,
    );
    expect(clicked).toBe("late_night");
    expect(applyCrossFilter).toHaveBeenCalledWith("meal_slot", "late_night", false);
  });
});

describe("MealSlotsChart React component rendering (CC-1, CC-2, CC-8)", () => {
  const sampleData = [
    { key: "breakfast", orders: 10, spend: 2500 },
    { key: "lunch", orders: 20, spend: 6000 },
    { key: "snack", orders: 5, spend: 1000 },
    { key: "dinner", orders: 45, spend: 18500 },
    { key: "late_night", orders: 10, spend: 3000 },
  ];

  it("renders ChartCard with title, subtitle, and dynamic takeaway caption", () => {
    const html = renderToString(<MealSlotsChart data={sampleData} />);

    expect(html).toContain("Meal slots");
    expect(html).toContain(
      "Distribution across breakfast, lunch, snack, dinner, and late night",
    );
    expect(html).toContain(
      "Dinner is your most frequent meal slot with 45 orders (₹18,500)",
    );
  });

  it("renders info popover with 5 meal slot windows", () => {
    const html = renderToString(<MealSlotsChart data={sampleData} />);
    expect(html).toContain("Meal slots information");

    const popoverHtml = renderToString(<MealSlotsInfoContent />);
    expect(popoverHtml).toContain("Breakfast:");
    expect(popoverHtml).toContain("6:00 AM – 11:00 AM");
    expect(popoverHtml).toContain("Lunch:");
    expect(popoverHtml).toContain("11:00 AM – 4:00 PM");
    expect(popoverHtml).toContain("Snack:");
    expect(popoverHtml).toContain("4:00 PM – 7:00 PM");
    expect(popoverHtml).toContain("Dinner:");
    expect(popoverHtml).toContain("7:00 PM – 11:00 PM");
    expect(popoverHtml).toContain("Late night:");
    expect(popoverHtml).toContain("11:00 PM – 6:00 AM");
  });

  it("renders empty state when timing_unavailable_reason is provided", () => {
    const html = renderToString(
      <MealSlotsChart
        data={sampleData}
        timing_unavailable_reason="Order timestamps are missing from delivery receipts"
      />,
    );

    expect(html).toContain(
      "Order timestamps are missing from delivery receipts",
    );
  });

  it("renders empty state when data is empty or total orders is 0", () => {
    const htmlEmpty = renderToString(<MealSlotsChart data={[]} />);
    expect(htmlEmpty).toContain("No meal slot data available.");

    const htmlZero = renderToString(
      <MealSlotsChart
        data={[
          { key: "breakfast", orders: 0, spend: 0 },
          { key: "lunch", orders: 0, spend: 0 },
        ]}
      />,
    );
    expect(htmlZero).toContain(
      "No orders recorded across meal slots in this period.",
    );
  });

  it("renders custom caption when passed explicitly", () => {
    const html = renderToString(
      <MealSlotsChart data={sampleData} caption="Custom takeaway override text" />,
    );
    expect(html).toContain("Custom takeaway override text");
  });

  it("renders error state when error is passed", () => {
    const html = renderToString(
      <MealSlotsChart
        data={sampleData}
        error={new Error("Failed to fetch meal slot analytics")}
      />,
    );
    expect(html).toContain("Failed to fetch meal slot analytics");
  });
});
