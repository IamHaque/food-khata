import { describe, expect, it, vi } from "vitest";
import * as React from "react";
import { renderToString } from "react-dom/server";
import {
  buildCuisineTreemapOption,
  buildCuisineHierarchy,
  handleCuisineTreemapClick,
  CuisineTreemapChart,
} from "./CuisineTreemapChart";
import { color as zcolor } from "echarts/core";
import { resolveChartTheme } from "@/lib/chart-theme";
import { computeCuisineTakeaway, formatRupees } from "@/lib/captions";

describe("CuisineTreemapChart hierarchy & option builder (CC-11, Scenario: Treemap)", () => {
  const sampleCuisines = [
    { name: "North Indian", spend: 5000, orders: 10 },
    { name: "Chinese & Asian", spend: 3000, orders: 6 },
    { name: "Biryani", spend: 2000, orders: 4 },
  ];

  const sampleLoyalty = [
    { name: "Punjab Grill", spend: 3000, orders: 5, cuisine: "North Indian" },
    { name: "Dhaba by Claridges", spend: 1500, orders: 3, cuisine: "North Indian" },
    { name: "Mainland China", spend: 2500, orders: 4, cuisine: "Chinese & Asian" },
    { name: "Behrouz Biryani", spend: 2000, orders: 4, cuisine: "Biryani" },
  ];

  it("builds hierarchy with cuisines at top level and matched restaurant children", () => {
    const theme = resolveChartTheme("light", "emerald");
    const tree = buildCuisineHierarchy(sampleCuisines, sampleLoyalty, theme);

    expect(tree.length).toBe(3);
    const northIndian = tree.find((n) => n.name === "North Indian");
    expect(northIndian).toBeTruthy();
    expect(northIndian?.value).toBe(5000);
    // One accent ramp by spend: the biggest cuisine gets the full accent.
    expect(northIndian?.itemStyle?.color).toBe(zcolor.lerp(1, [theme.rampLow, theme.rampHigh]));

    // Has child restaurant nodes plus remainder
    expect(Array.isArray(northIndian?.children)).toBe(true);
    expect(northIndian?.children?.length).toBe(3); // Punjab Grill (3000) + Dhaba (1500) + Other North Indian (500)

    const punjabGrill = northIndian?.children?.find((c) => c.name === "Punjab Grill");
    expect(punjabGrill?.value).toBe(3000);
    expect(punjabGrill?.orders).toBe(5);

    const remainder = northIndian?.children?.find((c) => c.name === "Other North Indian");
    expect(remainder?.value).toBe(500);

    const biryani = tree.find((n) => n.name === "Biryani");
    expect(biryani?.children?.length).toBe(1);
    expect(biryani?.children?.[0].name).toBe("Behrouz Biryani");
    expect(biryani?.children?.[0].value).toBe(2000);
  });

  it("treats cuisine nodes as zoomable leaves when no restaurant data is available", () => {
    const tree = buildCuisineHierarchy(sampleCuisines, []);
    expect(tree.length).toBe(3);
    expect(tree[0].name).toBe("North Indian");
    expect(tree[0].value).toBe(5000);
    expect(tree[0].children).toBeUndefined();
  });

  it("normalizes child node spend proportionally if restaurant spend sum exceeds cuisine spend", () => {
    const cuisines = [{ name: "Italian", spend: 1000, orders: 2 }];
    const restaurants = [
      { name: "Pizza Hut", spend: 800, cuisine: "Italian" },
      { name: "Domino's", spend: 800, cuisine: "Italian" },
    ];
    const tree = buildCuisineHierarchy(cuisines, restaurants);
    expect(tree.length).toBe(1);
    const children = tree[0].children!;
    expect(children.length).toBe(2);
    const totalChildValue = children.reduce((sum, c) => sum + c.value, 0);
    expect(totalChildValue).toBe(1000);
  });

  it("builds an ECharts treemap option with roam: false and nodeClick: 'zoomToNode'", () => {
    const option = buildCuisineTreemapOption({
      cuisines: sampleCuisines,
      loyalty: sampleLoyalty,
    }) as any;

    expect(Array.isArray(option.series)).toBe(true);
    const series = option.series[0];
    expect(series.type).toBe("treemap");
    expect(series.roam).toBe(false);
    expect(series.nodeClick).toBe("zoomToNode");
  });

  it("configures breadcrumb navigation allowing zoom back (breadcrumb: { show: true })", () => {
    const theme = resolveChartTheme("light", "indigo");
    const option = buildCuisineTreemapOption({
      cuisines: sampleCuisines,
      loyalty: sampleLoyalty,
      theme,
    }) as any;

    const series = option.series[0];
    expect(series.breadcrumb).toBeTruthy();
    expect(series.breadcrumb.show).toBe(true);
    expect(series.breadcrumb.itemStyle?.color).toBe(theme.tooltipBg);
    expect(series.breadcrumb.itemStyle?.borderColor).toBe(theme.borderColor);
  });

  it("formats tile labels with name and formatted spend (formatRupees)", () => {
    const option = buildCuisineTreemapOption({
      cuisines: sampleCuisines,
      loyalty: sampleLoyalty,
    }) as any;

    const formatter = option.series[0].label.formatter;
    expect(typeof formatter).toBe("function");

    const label = formatter({ name: "North Indian", value: 5000 });
    expect(label).toContain("North Indian");
    expect(label).toContain("₹5,000");
  });

  it("formats rich tooltip with spend, formatted INR, order count, and share of total", () => {
    const option = buildCuisineTreemapOption({
      cuisines: sampleCuisines,
      loyalty: sampleLoyalty,
    }) as any;

    expect(typeof option.tooltip?.formatter).toBe("function");
    const tooltipText = option.tooltip.formatter({
      name: "North Indian",
      value: 5000,
      data: { orders: 10 },
      treePathInfo: [{ name: "" }, { name: "North Indian" }],
    });

    expect(tooltipText).toContain("North Indian");
    expect(tooltipText).toContain("₹5,000");
    expect(tooltipText).toContain("10 orders");
    expect(tooltipText).toContain("50.0% of food spend");
  });

  it("supports positional argument signature", () => {
    const theme = resolveChartTheme("dark", "emerald");
    const option = buildCuisineTreemapOption(sampleCuisines, sampleLoyalty, theme, true) as any;
    expect(option.series[0].type).toBe("treemap");
    expect(option.animation).toBe(false);
    expect(option.animationDuration).toBe(0);
  });

  it("respects prefers-reduced-motion flag by setting animation durations to 0", () => {
    const reducedOption = buildCuisineTreemapOption({
      cuisines: sampleCuisines,
      reducedMotion: true,
    }) as any;
    expect(reducedOption.animation).toBe(false);
    expect(reducedOption.animationDuration).toBe(0);

    const normalOption = buildCuisineTreemapOption({
      cuisines: sampleCuisines,
      reducedMotion: false,
    }) as any;
    expect(normalOption.animation).toBe(true);
    expect(normalOption.animationDuration).toBe(600);
  });
});

describe("CuisineTreemapChart cross-filtering on click (Scenario: Click, S-020)", () => {
  it("extracts cuisine from cuisineName in data and triggers filters.update and onCuisineClick", () => {
    const updateSpy = vi.fn();
    const clickSpy = vi.fn();

    const clicked = handleCuisineTreemapClick(
      {
        name: "Punjab Grill",
        data: { cuisineName: "North Indian", name: "Punjab Grill" },
      },
      { update: updateSpy },
      clickSpy,
    );

    expect(clicked).toBe("North Indian");
    expect(updateSpy).toHaveBeenCalledWith({ cuisines: ["North Indian"] });
    expect(clickSpy).toHaveBeenCalledWith(
      "North Indian",
      expect.objectContaining({ name: "Punjab Grill" }),
    );
  });

  it("extracts cuisine from treePathInfo when child restaurant tile is clicked", () => {
    const updateSpy = vi.fn();

    const clicked = handleCuisineTreemapClick(
      {
        name: "Mainland China",
        treePathInfo: [{ name: "" }, { name: "Chinese & Asian" }, { name: "Mainland China" }],
      },
      { update: updateSpy },
    );

    expect(clicked).toBe("Chinese & Asian");
    expect(updateSpy).toHaveBeenCalledWith({ cuisines: ["Chinese & Asian"] });
  });

  it("falls back to params.name when cuisineName or treePathInfo are omitted", () => {
    const updateSpy = vi.fn();
    const clicked = handleCuisineTreemapClick(
      { name: "Biryani" },
      { update: updateSpy },
    );

    expect(clicked).toBe("Biryani");
    expect(updateSpy).toHaveBeenCalledWith({ cuisines: ["Biryani"] });
  });
});

describe("CuisineTreemapChart React component (Scenario: Unavailable, ChartCard CC-1 to CC-12)", () => {
  const sampleCuisines = [
    { name: "North Indian", spend: 5000, orders: 10 },
    { name: "Chinese & Asian", spend: 3000, orders: 6 },
    { name: "Biryani", spend: 2000, orders: 4 },
  ];

  it("renders ChartCard with title, subtitle, info popover, and role='img'", () => {
    const html = renderToString(
      <CuisineTreemapChart cuisines={sampleCuisines} />,
    );

    expect(html).toContain("Cuisine breakdown");
    expect(html).toContain("Spend by cuisine. Click a cuisine to see its restaurants.");
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Cuisine breakdown information"');
  });

  it("renders computed takeaway caption in ChartCard (CC-8)", () => {
    const expectedCaption = computeCuisineTakeaway(sampleCuisines);
    expect(expectedCaption).toBe("North Indian accounts for 50% of food spend");

    const html = renderToString(
      <CuisineTreemapChart cuisines={sampleCuisines} />,
    );
    expect(html).toContain("North Indian accounts for 50% of food spend");
  });

  it("supports custom caption override", () => {
    const html = renderToString(
      <CuisineTreemapChart
        cuisines={sampleCuisines}
        caption="Custom cuisine spend insight"
      />,
    );
    expect(html).toContain("Custom cuisine spend insight");
  });

  it("renders cuisine_unavailable_reason in empty state (Scenario: Unavailable, CC-9)", () => {
    const reason = "More than 80% of orders lack cuisine data.";
    const html = renderToString(
      <CuisineTreemapChart
        cuisines={[]}
        cuisine_unavailable_reason={reason}
      />,
    );

    expect(html).toContain(reason);
  });

  it("renders empty state when cuisines is empty and no specific reason is given", () => {
    const html = renderToString(
      <CuisineTreemapChart cuisines={[]} emptyReason="No cuisines found" />,
    );
    expect(html).toContain("No cuisines found");
  });

  it("renders loading skeleton when isLoading is true", () => {
    const html = renderToString(
      <CuisineTreemapChart cuisines={sampleCuisines} isLoading />,
    );
    expect(html).toContain("animate-pulse");
  });

  it("renders error state when error prop is provided", () => {
    const onRetry = vi.fn();
    const html = renderToString(
      <CuisineTreemapChart
        cuisines={sampleCuisines}
        error="Failed to load cuisine breakdown"
        onRetry={onRetry}
      />,
    );
    expect(html).toContain("Failed to load cuisine breakdown");
    expect(html).toContain("Retry");
  });

  it("exposes tableData and toolbar actions for Table view and CSV export (CC-7)", () => {
    const html = renderToString(
      <CuisineTreemapChart cuisines={sampleCuisines} />,
    );
    expect(html).toContain('aria-label="Toggle table view"');
    expect(html).toContain('aria-label="Download CSV"');
  });
});
