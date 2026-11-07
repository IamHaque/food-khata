import { describe, expect, it, vi, beforeEach } from "vitest";
import * as React from "react";
import { renderToString } from "react-dom/server";
import {
  OverviewKpis,
  Sparkline,
  Delta,
  KpiValue,
  KPI_DEFINITIONS,
  normalizeOverviewKpisData,
  handleSparklineHover,
  handleSparklineLeave,
} from "./OverviewKpis";
import { emitHighlight, emitClear } from "@/lib/highlight-bus";

vi.mock("@/lib/highlight-bus", () => ({
  emitHighlight: vi.fn(),
  emitClear: vi.fn(),
  registerChart: vi.fn(() => () => {}),
}));

const mockData = {
  kpis: { spend: 1000, orders: 10, aov: 100, fees: 50 },
  comparison: { percent_change: { spend: 5, orders: -2, aov: 3, fees: 1 } },
  charts: {
    kpi_history: [
      { month: "Jan", spend: 900, orders: 9, aov: 100, fees: 40 },
      { month: "Feb", spend: 1000, orders: 10, aov: 100, fees: 50 },
    ],
    behavior: { orders_per_week: 2.5 },
    food: { cuisines: [{ name: "Biryani" }] },
  },
};

describe("OverviewKpis (S-031)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Scenario: Layout", () => {
    it("renders six cards fitting one row at 1440px desktop, 3x2 on tablet, 2x3 on mobile", () => {
      const html = renderToString(<OverviewKpis data={mockData} />);

      // Grid classes check: 2 cols on mobile, 3 on tablet (md), 6 on desktop (xl >= 1280/1440)
      expect(html).toContain("grid-cols-2");
      expect(html).toContain("md:grid-cols-3");
      expect(html).toContain("xl:grid-cols-6");
      expect(html).toContain("gap-3");

      // Verify all six KPI cards exist
      expect(html).toContain("Total Spend");
      expect(html).toContain("Total Orders");
      expect(html).toContain("Average Order Value");
      expect(html).toContain("Orders Per Week");
      expect(html).toContain("Top Cuisine");
      expect(html).toMatch(/Delivery (&amp;|&) Fees/);
    });

    it("renders loading skeletons when isLoading is true", () => {
      const html = renderToString(<OverviewKpis isLoading />);
      expect(html).toContain("animate-pulse");
      expect(html).toContain("grid-cols-2");
      expect(html).toContain("xl:grid-cols-6");
    });
  });

  describe("Scenario: Content", () => {
    it("renders label, large formatted value, sparkline and delta arrow", () => {
      const html = renderToString(<OverviewKpis data={mockData} />);

      // Large values and tabular-nums styling
      expect(html).toContain("tabular-nums");
      // Total Spend INR formatted
      expect(html).toContain("₹1,000.00");
      // Total Orders integer
      expect(html).toContain("10");
      // Orders Per Week float (1 decimal)
      expect(html).toContain("2.5");
      // Top Cuisine string
      expect(html).toContain("Biryani");

      // Comparison deltas with percentage and direction
      expect(html).toContain("+5%");
      expect(html).toContain("-2%");

      // Top Cuisine delta is omitted or N/A
      expect(html).toContain("N/A");
    });

    it("renders 'Unknown' for missing values and comparison deltas", () => {
      const emptyData = {
        kpis: { spend: null, orders: null, aov: null, fees: null },
        comparison: { percent_change: { spend: null, orders: null, aov: null, fees: null } },
        charts: {
          kpi_history: [],
          behavior: { orders_per_week: null },
          food: { cuisines: [] },
        },
      };

      const html = renderToString(<OverviewKpis data={emptyData} />);
      // Values and deltas should display Unknown when missing
      expect(html).toContain("Unknown");
    });

    it("handles standalone props normalization", () => {
      const normalized = normalizeOverviewKpisData({
        kpis: { spend: 500 },
        ordersPerWeek: 4.2,
        topCuisine: "Pizza",
      });
      expect(normalized.k.spend).toBe(500);
      expect(normalized.ordersPerWeek).toBe(4.2);
      expect(normalized.topCuisine).toBe("Pizza");
    });
  });

  describe("Scenario: Formula and Popover", () => {
    it("renders info icon button with accessible aria-label", () => {
      const html = renderToString(<OverviewKpis data={mockData} />);
      expect(html).toContain('aria-label="Calculation and caveats for Total Spend"');
      expect(html).toContain('aria-label="Calculation and caveats for Total Orders"');
      expect(html).toContain('aria-label="Calculation and caveats for Average Order Value"');
      expect(html).toContain('aria-label="Calculation and caveats for Orders Per Week"');
      expect(html).toContain('aria-label="Calculation and caveats for Top Cuisine"');
      expect(html).toMatch(/aria-label="Calculation and caveats for Delivery (&amp;|&) Fees"/);
    });

    it("embeds formula explanation and caveats for all KPI definitions", () => {
      const spendDef = KPI_DEFINITIONS.find((d) => d.label === "Total Spend");
      expect(spendDef?.formula).toContain("Total provider-paid amount across all matching orders");
      expect(spendDef?.caveats).toContain("Excludes non-reconciling advertised savings");

      const ordersDef = KPI_DEFINITIONS.find((d) => d.label === "Total Orders");
      expect(ordersDef?.formula).toContain("Count of successfully delivered orders");
      expect(ordersDef?.caveats).toContain("Excludes cancelled and refunded orders");

      const aovDef = KPI_DEFINITIONS.find((d) => d.label === "Average Order Value");
      expect(aovDef?.formula).toContain("Total spend divided by valid delivered orders");

      const opwDef = KPI_DEFINITIONS.find((d) => d.label === "Orders Per Week");
      expect(opwDef?.formula).toContain("Average orders per week within the selected period");

      const cuisineDef = KPI_DEFINITIONS.find((d) => d.label === "Top Cuisine");
      expect(cuisineDef?.formula).toContain("Most frequently ordered cuisine by order count");

      const feesDef = KPI_DEFINITIONS.find((d) => d.label === "Delivery & Fees");
      expect(feesDef?.formula).toContain("Total delivery, packaging, and platform fees");
    });

    it("defines clear formulas and caveats for all six KPI cards", () => {
      expect(KPI_DEFINITIONS).toHaveLength(6);
      for (const def of KPI_DEFINITIONS) {
        expect(def.formula.length).toBeGreaterThan(10);
        expect(def.caveats.length).toBeGreaterThan(10);
      }
    });
  });

  describe("Scenario: Interaction & Sparkline", () => {
    it("renders SVG sparkline for historical values", () => {
      const html = renderToString(
        <Sparkline
          values={[100, 200, 150]}
          months={["Jan", "Feb", "Mar"]}
          label="Spend sparkline"
        />
      );
      expect(html).toContain("<svg");
      expect(html).toContain('aria-label="Spend sparkline"');
      expect(html).toContain("<path");
      expect(html).toContain("<circle");
    });

    it("renders pulse placeholder when sparkline has no finite values", () => {
      const html = renderToString(
        <Sparkline values={[null, null]} label="Empty sparkline" />
      );
      expect(html).toContain("animate-pulse");
      expect(html).toContain('aria-label="Empty sparkline"');
    });

    it("handleSparklineHover emits highlight with object payload { type, value, sourceId }", () => {
      const onHover = vi.fn();
      handleSparklineHover("Jan", 900, onHover);

      expect(emitHighlight).toHaveBeenCalledWith({
        type: "month",
        value: "Jan",
        sourceId: "kpi-sparkline",
      });
      expect(onHover).toHaveBeenCalledWith("Jan", 900);
    });

    it("handleSparklineLeave calls emitClear for kpi-sparkline", () => {
      handleSparklineLeave();
      expect(emitClear).toHaveBeenCalledWith("kpi-sparkline");
    });
  });

  describe("Subcomponents: Delta & KpiValue", () => {
    it("Delta formats positive change with ArrowUp and plus sign", () => {
      const html = renderToString(<Delta value={12.5} />);
      expect(html).toContain("+12.5%");
      expect(html).toContain("text-emerald-600");
    });

    it("Delta formats negative change with ArrowDown", () => {
      const html = renderToString(<Delta value={-8} />);
      expect(html).toContain("-8%");
      expect(html).toContain("text-rose-600");
    });

    it("Delta formats zero change with Minus icon", () => {
      const html = renderToString(<Delta value={0} />);
      expect(html).toContain("0%");
    });

    it("Delta formats missing or invalid values as Unknown", () => {
      expect(renderToString(<Delta value={null} />)).toContain("Unknown");
      expect(renderToString(<Delta value={undefined} />)).toContain("Unknown");
      expect(renderToString(<Delta value={NaN} />)).toContain("Unknown");
    });

    it("KpiValue formats money, integer, and decimal with tabular-nums", () => {
      const moneyHtml = renderToString(<KpiValue value={2500} format="money" />);
      expect(moneyHtml).toContain("₹2,500.00");
      expect(moneyHtml).toContain("tabular-nums");

      const intHtml = renderToString(<KpiValue value={42} format="number" decimals={0} />);
      expect(intHtml).toContain("42");

      const decHtml = renderToString(<KpiValue value={3.75} format="number" decimals={1} />);
      expect(decHtml).toContain("3.8");
    });

    it("KpiValue renders Unknown when value is null or NaN", () => {
      expect(renderToString(<KpiValue value={null} format="money" />)).toContain("Unknown");
      expect(renderToString(<KpiValue value={NaN} format="number" />)).toContain("Unknown");
    });
  });
});
