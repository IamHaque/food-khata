import { describe, expect, it, vi, afterEach } from "vitest";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import {
  DishRankingChart,
  buildDishRankingOption,
  formatDishRankingTooltip,
  handleDishClick,
  normalizeDishRankingData,
  type NormalizedDishItem,
  type DishRankingDatum,
} from "./DishRankingChart";
import {
  resolveChartTheme,
  VALID_MODES,
  VALID_ACCENTS,
} from "../../lib/chart-theme";
import { computeDishRankingTakeaway, formatRupees } from "../../lib/captions";
import { clearRegistry } from "../../lib/highlight-bus";

const sampleDishes: DishRankingDatum[] = [
  { key: "item-1", name: "Chicken Biryani", quantity: 28, amount: 6800 },
  { key: "item-2", name: "Butter Naan", quantity: 24, amount: 1200 },
  { key: "item-3", name: "Paneer Butter Masala", quantity: 18, amount: 5400 },
  { key: "item-4", name: "Dal Makhani", quantity: 14, amount: 3500 },
  { key: "item-5", name: "Garlic Naan", quantity: 12, amount: 720 },
  { key: "item-6", name: "Tandoori Roti", quantity: 10, amount: 300 },
  { key: "item-7", name: "Chicken Tikka", quantity: 8, amount: 2800 },
  { key: "item-8", name: "Jeera Rice", quantity: 7, amount: 1050 },
  { key: "item-9", name: "Mutton Rogan Josh", quantity: 6, amount: 4200 },
  { key: "item-10", name: "Gulab Jamun", quantity: 5, amount: 450 },
  { key: "item-11", name: "Masala Dosa", quantity: 5, amount: 600 },
  { key: "item-12", name: "Idli Sambar", quantity: 4, amount: 320 },
  { key: "item-13", name: "Cold Coffee", quantity: 3, amount: 450 },
  { key: "item-14", name: "Veg Pulao", quantity: 2, amount: 400 },
  { key: "item-15", name: "Lassi", quantity: 2, amount: 160 },
  { key: "item-16", name: "Boondi Raita", quantity: 1, amount: 90 },
  { key: "item-17", name: "Kheer", quantity: 1, amount: 150 },
];

describe("DishRankingChart - Normalization (normalizeDishRankingData)", () => {
  it("normalizes and ranks dishes by quantity volume descending, slicing to top 15", () => {
    const normalized = normalizeDishRankingData(sampleDishes, "quantity", 15);
    expect(normalized).toHaveLength(15);
    expect(normalized[0].name).toBe("Chicken Biryani");
    expect(normalized[0].quantity).toBe(28);
    expect(normalized[0].amount).toBe(6800);
    expect(normalized[0].avgPrice).toBe(243); // 6800 / 28 = 242.85 -> 243

    expect(normalized[1].name).toBe("Butter Naan");
    expect(normalized[1].quantity).toBe(24);

    // Items 16 and 17 should be sliced out
    const names = normalized.map((x) => x.name);
    expect(names).not.toContain("Boondi Raita");
    expect(names).not.toContain("Kheer");
  });

  it("normalizes and ranks dishes by amount expenditure descending when metric='amount'", () => {
    const normalized = normalizeDishRankingData(sampleDishes, "amount", 15);
    expect(normalized).toHaveLength(15);
    // Chicken Biryani (6800), Paneer Butter Masala (5400), Mutton Rogan Josh (4200), Dal Makhani (3500)
    expect(normalized[0].name).toBe("Chicken Biryani");
    expect(normalized[0].amount).toBe(6800);

    expect(normalized[1].name).toBe("Paneer Butter Masala");
    expect(normalized[1].amount).toBe(5400);

    expect(normalized[2].name).toBe("Mutton Rogan Josh");
    expect(normalized[2].amount).toBe(4200);

    expect(normalized[3].name).toBe("Dal Makhani");
    expect(normalized[3].amount).toBe(3500);
  });

  it("aggregates duplicate entries with identical dish names", () => {
    const raw = [
      { name: "Chicken Biryani", quantity: 10, amount: 2500 },
      { name: "Chicken Biryani", quantity: 18, amount: 4300 },
      { name: "Butter Naan", quantity: 5, amount: 250 },
    ];
    const normalized = normalizeDishRankingData(raw, "quantity", 15);
    expect(normalized).toHaveLength(2);
    expect(normalized[0].name).toBe("Chicken Biryani");
    expect(normalized[0].quantity).toBe(28);
    expect(normalized[0].amount).toBe(6800);
    expect(normalized[0].avgPrice).toBe(243);
  });

  it("handles object structures (top_dishes, topDishes, items, rows)", () => {
    const objWithTopDishes = { top_dishes: sampleDishes.slice(0, 3) };
    expect(normalizeDishRankingData(objWithTopDishes)).toHaveLength(3);

    const objWithRows = { rows: sampleDishes.slice(0, 4) };
    expect(normalizeDishRankingData(objWithRows)).toHaveLength(4);
  });

  it("ignores dishes with empty names or non-positive values", () => {
    const dirty = [
      { name: "", quantity: 10, amount: 500 },
      { name: "   ", quantity: 5, amount: 200 },
      { name: "Zero Item", quantity: 0, amount: 0 },
      { name: "Negative Item", quantity: -2, amount: -100 },
      { name: "Valid Dish", quantity: 3, amount: 450 },
    ];
    const normalized = normalizeDishRankingData(dirty, "quantity", 15);
    expect(normalized).toHaveLength(1);
    expect(normalized[0].name).toBe("Valid Dish");
  });
});

describe("DishRankingChart - Option Builder (CC-11, Scenario: Ranking)", () => {
  it("builds horizontal bar option with yAxis categories inverse=true and xAxis value", () => {
    const theme = resolveChartTheme("light", "emerald");
    const option = buildDishRankingOption({
      data: sampleDishes,
      metric: "quantity",
      theme,
      prefersReducedMotion: false,
    });

    // Horizontal bar: yAxis is category with inverse: true (top dish at top)
    const yAxis = option.yAxis as any;
    expect(yAxis.type).toBe("category");
    expect(yAxis.inverse).toBe(true);
    expect(yAxis.data[0]).toBe("Chicken Biryani");
    expect(yAxis.data).toHaveLength(15);

    // Value axis
    const xAxis = option.xAxis as any;
    expect(xAxis.type).toBe("value");

    // Series
    const series = (option.series as any[])[0];
    expect(series.type).toBe("bar");
    expect(series.name).toBe("Quantity");
    expect(series.itemStyle.color).toBe(theme.colors[0]);
    expect(series.animationDuration).toBe(600);
    expect(series.animationEasing).toBe("cubicOut");
    expect(series.data[0].value).toBe(28);

    // Complementary label formatter in quantity mode
    const labelFormatter = series.label.formatter;
    expect(labelFormatter({ dataIndex: 0 })).toBe("28 (₹6,800)");
  });

  it("builds option for amount metric with rupee formatting on xAxis and complementary order count label", () => {
    const theme = resolveChartTheme("dark", "indigo");
    const option = buildDishRankingOption({
      data: sampleDishes,
      metric: "amount",
      theme,
      prefersReducedMotion: false,
    });

    const series = (option.series as any[])[0];
    expect(series.name).toBe("Amount");
    expect(series.itemStyle.color).toBe(theme.colors[0]);
    expect(series.data[0].dishName).toBe("Chicken Biryani");
    expect(series.data[0].value).toBe(6800);

    // Label shows rupee amount with orders complement
    const labelFormatter = series.label.formatter;
    expect(labelFormatter({ dataIndex: 0 })).toBe("₹6,800 (28 orders)");

    // xAxis label formats rupee
    const xAxis = option.xAxis as any;
    expect(xAxis.axisLabel.formatter(5000)).toBe("₹5,000");
  });

  it("disables animation when prefersReducedMotion=true", () => {
    const theme = resolveChartTheme("light", "rose");
    const option = buildDishRankingOption({
      data: sampleDishes,
      metric: "quantity",
      theme,
      prefersReducedMotion: true,
    });

    expect(option.animation).toBe(false);
    const series = (option.series as any[])[0];
    expect(series.animation).toBe(false);
    expect(series.animationDuration).toBe(0);
  });

  it("renders correctly across all VALID_MODES and VALID_ACCENTS", () => {
    for (const mode of VALID_MODES) {
      for (const accent of VALID_ACCENTS) {
        const theme = resolveChartTheme(mode, accent);
        const option = buildDishRankingOption({
          data: sampleDishes.slice(0, 5),
          metric: "quantity",
          theme,
        });

        const series = (option.series as any[])[0];
        expect(series.itemStyle.color).toBe(theme.colors[0]);
        expect(option.textStyle).toBeDefined();
      }
    }
  });

  it("supports legacy positional arguments buildDishRankingOption(data, metric, theme)", () => {
    const theme = resolveChartTheme("light", "amber");
    const option = buildDishRankingOption(sampleDishes.slice(0, 5), "amount", theme);
    const series = (option.series as any[])[0];
    expect(series.name).toBe("Amount");
    expect(series.itemStyle.color).toBe(theme.colors[0]);
  });
});

describe("DishRankingChart - Tooltip Formatter (formatDishRankingTooltip, CC-5)", () => {
  it("formats rich tooltip with rank, dish name, quantity, spend, and avg price", () => {
    const theme = resolveChartTheme("light", "emerald");
    const displayed = normalizeDishRankingData(sampleDishes, "quantity", 15);

    const tooltipHtml = formatDishRankingTooltip({ dataIndex: 0 }, displayed, theme);
    expect(tooltipHtml).toContain("Chicken Biryani");
    expect(tooltipHtml).toContain("#1");
    expect(tooltipHtml).toContain("28 orders");
    expect(tooltipHtml).toContain(formatRupees(6800));
    expect(tooltipHtml).toContain(formatRupees(243)); // avg price
  });

  it("handles singular order text formatting", () => {
    const theme = resolveChartTheme("light", "emerald");
    const single: NormalizedDishItem[] = [
      { key: "dish-1", name: "Chef Special", quantity: 1, amount: 750, avgPrice: 750 },
    ];
    const tooltipHtml = formatDishRankingTooltip({ dataIndex: 0 }, single, theme);
    expect(tooltipHtml).toContain("1 order");
    expect(tooltipHtml).not.toContain("1 orders");
  });
});

describe("DishRankingChart - Click to Search Filter (handleDishClick, Scenario: Click, S-020)", () => {
  it("updates global search filter with dish name on click", () => {
    const displayed = normalizeDishRankingData(sampleDishes, "quantity", 15);
    const mockUpdate = vi.fn();
    const mockOnDishClick = vi.fn();

    const clickedDish = handleDishClick(
      { dataIndex: 0 },
      displayed,
      { update: mockUpdate },
      mockOnDishClick,
    );

    expect(clickedDish).toBe("Chicken Biryani");
    expect(mockUpdate).toHaveBeenCalledWith({ search: "Chicken Biryani" });
    expect(mockOnDishClick).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Chicken Biryani", quantity: 28, amount: 6800 }),
    );
  });

  it("falls back to params.name when dataIndex is out of range", () => {
    const mockUpdate = vi.fn();
    const clickedDish = handleDishClick(
      { name: "Special Paratha" },
      [],
      { update: mockUpdate },
    );

    expect(clickedDish).toBe("Special Paratha");
    expect(mockUpdate).toHaveBeenCalledWith({ search: "Special Paratha" });
  });

  it("returns null if no dish name is present", () => {
    const mockUpdate = vi.fn();
    expect(handleDishClick(null, [], { update: mockUpdate })).toBeNull();
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe("DishRankingChart - React Component (ChartCard, SegmentedControl, Table, Accessibility)", () => {
  afterEach(() => {
    clearRegistry();
  });

  it("renders inside ChartCard with title, subtitle, info popover, takeaway caption, and SegmentedControl", () => {
    const expectedCaption = computeDishRankingTakeaway(sampleDishes, "quantity");
    expect(expectedCaption).toBe("Top dish is Chicken Biryani with 28 orders (₹6,800)");

    const html = renderToString(
      <MemoryRouter>
        <DishRankingChart data={sampleDishes} />
      </MemoryRouter>,
    );

    // ChartCard Header & Popover
    expect(html).toContain("Top dishes ranking");
    expect(html).toContain("Leaderboard of most ordered items by volume and expenditure");
    expect(html).toContain(expectedCaption!);
    expect(html).toContain('aria-label="Dish ranking information"');

    // SegmentedControl buttons
    expect(html).toContain("Quantity");
    expect(html).toContain("Amount");

    // Accessibility attributes
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Top dishes ranking"');
    expect(html).toContain('aria-description="Horizontal bar chart showing top 15 dishes ranked by order volume. Top dish is Chicken Biryani with 28 orders."');
  });

  it("supports custom caption override", () => {
    const html = renderToString(
      <MemoryRouter>
        <DishRankingChart
          data={sampleDishes}
          caption="Custom dish leaderboard caption"
        />
      </MemoryRouter>,
    );
    expect(html).toContain("Custom dish leaderboard caption");
  });

  it("renders in Amount mode when defaultMetric='amount'", () => {
    const expectedCaption = computeDishRankingTakeaway(sampleDishes, "amount");
    expect(expectedCaption).toBe("Top dish is Chicken Biryani with ₹6,800 (28 orders)");

    const html = renderToString(
      <MemoryRouter>
        <DishRankingChart
          data={sampleDishes}
          defaultMetric="amount"
        />
      </MemoryRouter>,
    );

    expect(html).toContain(expectedCaption!);
    expect(html).toContain('aria-description="Horizontal bar chart showing top 15 dishes ranked by expenditure. Top dish is Chicken Biryani with ₹6,800 spend."');
  });

  it("renders accessible sortable table view (CC-5, CC-10)", () => {
    const html = renderToString(
      <MemoryRouter>
        <DishRankingChart
          data={sampleDishes}
          showTable={true}
        />
      </MemoryRouter>,
    );

    // Table Headers
    expect(html).toContain("Rank");
    expect(html).toContain("Dish");
    expect(html).toContain("Quantity");
    expect(html).toContain("Amount");
    expect(html).toContain("Avg price");

    // Top rows content
    expect(html).toContain("Chicken Biryani");
    expect(html).toContain("28");
    expect(html).toContain(formatRupees(6800));
    expect(html).toContain(formatRupees(243));

    expect(html).toContain("Butter Naan");
    expect(html).toContain("24");
    expect(html).toContain(formatRupees(1200));
    expect(html).toContain(formatRupees(50));
  });

  it("renders EmptyState when data is empty", () => {
    const html = renderToString(
      <MemoryRouter>
        <DishRankingChart
          data={[]}
          emptyReason="No dishes recorded in this time period."
        />
      </MemoryRouter>,
    );

    expect(html).toContain("No dishes recorded in this time period.");
  });

  it("renders Skeleton when isLoading=true", () => {
    const html = renderToString(
      <MemoryRouter>
        <DishRankingChart
          data={sampleDishes}
          isLoading={true}
        />
      </MemoryRouter>,
    );

    // ChartCard renders Skeleton loading pulse
    expect(html).toContain("animate-pulse");
  });

  it("renders ErrorState when error is passed", () => {
    const html = renderToString(
      <MemoryRouter>
        <DishRankingChart
          data={sampleDishes}
          error="Failed to load dish leaderboard."
        />
      </MemoryRouter>,
    );

    expect(html).toContain("Failed to load dish leaderboard.");
  });
});
