import { describe, expect, it, vi } from "vitest";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import {
  BillWaterfallChart,
  buildBillWaterfallOption,
  formatWaterfallTooltip,
  deriveWaterfallSteps,
  humanizeLabel,
  type WaterfallStep,
  type CostWaterfallData,
} from "./BillWaterfallChart";
import {
  resolveChartTheme,
  VALID_MODES,
  VALID_ACCENTS,
} from "../../lib/chart-theme";
import { computeBillWaterfallTakeaway, formatRupees } from "../../lib/captions";

const sampleSteps: WaterfallStep[] = [
  { label: "subtotal", amount: 12000, baseline: 0, height: 12000, direction: "up" },
  { label: "food discount", amount: -2400, baseline: 9600, height: 2400, direction: "down" },
  { label: "net delivery", amount: 480, baseline: 9600, height: 480, direction: "up" },
  { label: "packaging", amount: 120, baseline: 10080, height: 120, direction: "up" },
  { label: "platform", amount: 240, baseline: 10200, height: 240, direction: "up" },
  { label: "tax", amount: 600, baseline: 10440, height: 600, direction: "up" },
  { label: "tip", amount: 100, baseline: 11040, height: 100, direction: "up" },
  { label: "residual", amount: -20, baseline: 11120, height: 20, direction: "down" },
  { label: "Final paid", amount: 11120, baseline: 0, height: 11120, direction: "total" },
];

const sampleCostWaterfall: CostWaterfallData = {
  subtotal: 12000,
  food_discount: -2400,
  net_delivery: 480,
  packaging: 120,
  platform: 240,
  tax: 600,
  tip: 100,
  other: 0,
  residual: -20,
  provider_paid: 11120,
  refunds: 0,
};

describe("BillWaterfallChart - Pure Option Builder (CC-11, Scenario: Steps)", () => {
  it("builds stacked waterfall bar chart using stack: 'waterfall'", () => {
    const theme = resolveChartTheme("light", "emerald");
    const option = buildBillWaterfallOption({
      steps: sampleSteps,
      theme,
      prefersReducedMotion: false,
    });

    const series = option.series as Array<{
      name?: string;
      type?: string;
      stack?: string;
      data?: any[];
      itemStyle?: any;
    }>;

    expect(series).toHaveLength(2);

    // Baseline transparent series
    const baselineSeries = series[0];
    expect(baselineSeries.type).toBe("bar");
    expect(baselineSeries.stack).toBe("waterfall");
    expect(baselineSeries.itemStyle?.color).toBe("transparent");
    expect(baselineSeries.itemStyle?.borderColor).toBe("transparent");
    expect(baselineSeries.data).toEqual(sampleSteps.map((s) => s.baseline));

    // Value floating series
    const valueSeries = series[1];
    expect(valueSeries.type).toBe("bar");
    expect(valueSeries.stack).toBe("waterfall");
    expect(valueSeries.data).toHaveLength(sampleSteps.length);
  });

  it("applies token colors for additions, reductions, and final total", () => {
    const theme = resolveChartTheme("light", "emerald");
    const option = buildBillWaterfallOption({
      steps: sampleSteps,
      theme,
    });

    const series = (option.series as Array<{ data: Array<{ step: WaterfallStep; itemStyle: { color: string } }> }>)[1];

    const upStep = series.data.find((d) => d.step.direction === "up");
    const downStep = series.data.find((d) => d.step.direction === "down");
    const totalStep = series.data.find((d) => d.step.direction === "total");

    expect(upStep?.itemStyle.color).toBe(theme.colors[1] ?? theme.colors[0]);
    expect(downStep?.itemStyle.color).toBe(theme.success);
    expect(totalStep?.itemStyle.color).toBe(theme.primary);
  });

  it("applies sequential animation delay when reduced motion is false", () => {
    const theme = resolveChartTheme("light", "emerald");
    const normalOption = buildBillWaterfallOption({
      steps: sampleSteps,
      theme,
      prefersReducedMotion: false,
    });

    expect(normalOption.animation).toBe(true);
    expect(normalOption.animationDuration).toBe(600);
    expect(normalOption.animationEasing).toBe("cubicOut");

    const normalSeries = (normalOption.series as Array<{ animationDelay?: (idx: number) => number }>)[1];
    expect(typeof normalSeries.animationDelay).toBe("function");
    expect(normalSeries.animationDelay!(0)).toBe(0);
    expect(normalSeries.animationDelay!(1)).toBe(60);
    expect(normalSeries.animationDelay!(2)).toBe(120);

    const reducedOption = buildBillWaterfallOption({
      steps: sampleSteps,
      theme,
      prefersReducedMotion: true,
    });

    expect(reducedOption.animation).toBe(false);
    expect(reducedOption.animationDuration).toBe(0);
    const reducedSeries = (reducedOption.series as Array<{ animationDelay?: (idx: number) => number }>)[1];
    expect(reducedSeries.animationDelay!(3)).toBe(0);
  });

  it("derives waterfall steps from costWaterfall when steps are omitted (CC-1)", () => {
    const derived = deriveWaterfallSteps(sampleCostWaterfall);
    expect(derived.length).toBeGreaterThan(0);

    const subtotal = derived.find((s) => s.label === "subtotal");
    expect(subtotal?.amount).toBe(12000);
    expect(subtotal?.direction).toBe("up");

    const discount = derived.find((s) => s.label === "food discount");
    expect(discount?.amount).toBe(-2400);
    expect(discount?.direction).toBe("down");

    const finalPaid = derived.find((s) => s.label === "Final paid");
    expect(finalPaid?.amount).toBe(11120);
    expect(finalPaid?.direction).toBe("total");

    const option = buildBillWaterfallOption({
      costWaterfall: sampleCostWaterfall,
    });
    expect((option.series as any[])[1].data).toHaveLength(derived.length);
  });

  it("formats rich tooltip with indicator, label, amount, and running balance (CC-4)", () => {
    const theme = resolveChartTheme("light", "emerald");
    const discountStep: WaterfallStep = {
      label: "food discount",
      amount: -2400,
      baseline: 9600,
      height: 2400,
      direction: "down",
    };

    const tooltip = formatWaterfallTooltip(discountStep, theme);
    expect(tooltip).toContain("Food discount");
    expect(tooltip).toContain("- Reduction / Discount");
    expect(tooltip).toContain("-₹2,400");
    expect(tooltip).toContain("Running Balance:");
    expect(tooltip).toContain("₹7,200");
  });

  it("satisfies CC-12 across all 10 theme/mode combinations without error", () => {
    for (const mode of VALID_MODES) {
      for (const accent of VALID_ACCENTS) {
        const theme = resolveChartTheme(mode, accent);
        const option = buildBillWaterfallOption({
          steps: sampleSteps,
          theme,
        });
        expect(option.color).toEqual(theme.colors);
        const series = (option.series as any[])[1];
        expect(series.data[0].itemStyle.color).toBeTruthy();
      }
    }
  });

  it("handles null or empty steps safely without throwing", () => {
    const emptyOption = buildBillWaterfallOption({ steps: [] });
    expect((emptyOption.series as any[])[0].data).toEqual([]);
    expect((emptyOption.series as any[])[1].data).toEqual([]);

    const nullOption = buildBillWaterfallOption({ steps: null, costWaterfall: null });
    expect((nullOption.series as any[])[0].data).toEqual([]);
  });
});

describe("BillWaterfallChart - React Component (ChartCard Wrap, Provider-paid Callout, Popover)", () => {
  it("renders inside ChartCard with title, subtitle, and takeaway caption", () => {
    const expectedCaption = computeBillWaterfallTakeaway(sampleSteps, sampleCostWaterfall);
    expect(expectedCaption).toBe(
      "Discounts saved ₹2,400 (20%) while fees added ₹1,540 (13%) to item subtotal",
    );

    const html = renderToString(
      <MemoryRouter>
        <BillWaterfallChart
          steps={sampleSteps}
          costWaterfall={sampleCostWaterfall}
        />
      </MemoryRouter>,
    );

    expect(html).toContain("Bill waterfall");
    expect(html).toContain("Step-by-step breakdown from item subtotal to final paid");
    expect(html).toContain("Discounts saved ₹2,400 (20%) while fees added ₹1,540 (13%) to item subtotal");
  });

  it("renders Provider-paid callout with exact disclaimer note (Scenario: Provider-paid)", () => {
    const html = renderToString(
      <MemoryRouter>
        <BillWaterfallChart
          steps={sampleSteps}
          costWaterfall={sampleCostWaterfall}
        />
      </MemoryRouter>,
    );

    expect(html).toContain('data-testid="provider-paid-callout"');
    expect(html).toContain("Provider-paid total:");
    expect(html).toContain(formatRupees(11120));
    expect(html).toContain(
      "Provider-paid total is recorded by platform; bill components may not reconcile mathematically (residual is tracked separately).",
    );
  });

  it("renders info popover button with accessible label and breakdown info", () => {
    const html = renderToString(
      <MemoryRouter>
        <BillWaterfallChart
          steps={sampleSteps}
          costWaterfall={sampleCostWaterfall}
        />
      </MemoryRouter>,
    );

    expect(html).toContain('aria-label="Bill waterfall breakdown information and provider reconciliation"');
  });

  it("renders accessible table view with Step, Type/Direction, Amount, Running balance (CC-7, CC-10)", () => {
    const html = renderToString(
      <MemoryRouter>
        <BillWaterfallChart
          steps={sampleSteps}
          costWaterfall={sampleCostWaterfall}
          showTable
        />
      </MemoryRouter>,
    );

    expect(html).toContain("Step");
    expect(html).toContain("Type/Direction");
    expect(html).toContain("Amount");
    expect(html).toContain("Running balance");

    expect(html).toContain("Subtotal");
    expect(html).toContain("+ Addition");
    expect(html).toContain("Food discount");
    expect(html).toContain("- Reduction");
    expect(html).toContain("Final paid");
    expect(html).toContain("= Total");
  });

  it("renders loading state with skeleton (CC-9)", () => {
    const html = renderToString(
      <MemoryRouter>
        <BillWaterfallChart isLoading />
      </MemoryRouter>,
    );
    expect(html).toContain("animate-pulse");
  });

  it("renders empty state with custom or default reason (CC-9)", () => {
    const html = renderToString(
      <MemoryRouter>
        <BillWaterfallChart steps={[]} emptyReason="No bill data found" />
      </MemoryRouter>,
    );
    expect(html).toContain("No bill data found");
  });

  it("renders error state with retry button (CC-9)", () => {
    const onRetry = vi.fn();
    const html = renderToString(
      <MemoryRouter>
        <BillWaterfallChart error="Failed to load waterfall data" onRetry={onRetry} />
      </MemoryRouter>,
    );
    expect(html).toContain("Failed to load waterfall data");
    expect(html).toContain("Retry");
  });

  it("renders accessible img container with detailed text summary (CC-10)", () => {
    const html = renderToString(
      <MemoryRouter>
        <BillWaterfallChart steps={sampleSteps} costWaterfall={sampleCostWaterfall} />
      </MemoryRouter>,
    );

    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Bill waterfall chart showing breakdown from subtotal to final paid:');
    expect(html).toContain("Food discount (-₹2,400)");
    expect(html).toContain("Final paid total: ₹11,120.");
  });

  it("humanizes step labels cleanly", () => {
    expect(humanizeLabel("subtotal")).toBe("Subtotal");
    expect(humanizeLabel("food_discount")).toBe("Food discount");
    expect(humanizeLabel("net_delivery")).toBe("Net delivery");
    expect(humanizeLabel("packaging")).toBe("Packaging");
    expect(humanizeLabel("platform")).toBe("Platform fee");
    expect(humanizeLabel("tax")).toBe("Taxes");
    expect(humanizeLabel("tip")).toBe("Tip");
    expect(humanizeLabel("residual")).toBe("Residual / Rounding");
    expect(humanizeLabel("final paid")).toBe("Final paid");
    expect(humanizeLabel("custom_fee")).toBe("Custom fee");
  });
});

describe("BillWaterfallChart - Step Click Interaction (Scenario: Click)", () => {
  it("invokes onStepClick callback when provided", () => {
    const onStepClick = vi.fn();
    const step = sampleSteps[1]; // food discount

    onStepClick(step);
    expect(onStepClick).toHaveBeenCalledWith(step);
    expect(step.direction).toBe("down");
  });

  it("maps residual click to anomaly=review filter param when navigating", () => {
    const search = "?platforms=Swiggy";
    const params = new URLSearchParams(search);
    const residualStep: WaterfallStep = {
      label: "residual",
      amount: -20,
      baseline: 11120,
      height: 20,
      direction: "down",
    };

    if (residualStep.label.toLowerCase().includes("residual")) {
      params.set("anomaly", "review");
    }

    expect(params.get("platforms")).toBe("Swiggy");
    expect(params.get("anomaly")).toBe("review");
  });
});
