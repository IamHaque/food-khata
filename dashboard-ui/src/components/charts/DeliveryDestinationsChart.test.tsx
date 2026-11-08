import { describe, expect, it, vi, afterEach } from "vitest";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import {
  DeliveryDestinationsChart,
  buildDeliveryDestinationsOption,
  formatDestinationsTooltip,
  handleDestinationClick,
  normalizeDestinationsData,
  buildDestinationsTableRows,
  isDestinationSelected,
  hasAnySelection,
  type NormalizedDestinationItem,
  type DestinationItem,
} from "./DeliveryDestinationsChart";
import { resolveChartTheme } from "../../lib/chart-theme";
import { clearRegistry } from "../../lib/highlight-bus";

const samplePlaces: DestinationItem[] = [
  { label: "Home", city: "Bangalore", orders: 32, spend: 18400, fee: 350 },
  { label: "Office", city: "Bangalore", orders: 20, spend: 11600, fee: 200 },
  { label: "Parents House", city: "Mysore", orders: 12, spend: 8333, fee: 150 },
  { label: "Friend Apartment", city: "Bangalore", orders: 5, spend: 3200, fee: 60 },
  { label: "Weekend Villa", city: "Goa", orders: 2, spend: 1800, fee: 40 },
];

describe("DeliveryDestinationsChart - Normalization (normalizeDestinationsData)", () => {
  it("normalizes and ranks destinations by spend descending by default", () => {
    const normalized = normalizeDestinationsData(samplePlaces, "spend");
    expect(normalized).toHaveLength(5);
    expect(normalized[0].label).toBe("Home");
    expect(normalized[0].city).toBe("Bangalore");
    expect(normalized[0].spend).toBe(18400);
    expect(normalized[0].orders).toBe(32);
    expect(normalized[0].displayName).toBe("Home (Bangalore)");
    expect(normalized[0].aov).toBe(Math.round(18400 / 32));

    expect(normalized[1].label).toBe("Office");
    expect(normalized[1].spend).toBe(11600);
    expect(normalized[2].label).toBe("Parents House");
    expect(normalized[2].spend).toBe(8333);
  });

  it("ranks destinations by orders descending when metric='orders'", () => {
    const custom = [
      { label: "Locality A", city: "City A", orders: 10, spend: 1000, fee: 20 },
      { label: "Locality B", city: "City B", orders: 25, spend: 500, fee: 10 },
    ];
    const normalized = normalizeDestinationsData(custom, "orders");
    expect(normalized[0].label).toBe("Locality B");
    expect(normalized[0].orders).toBe(25);
    expect(normalized[1].label).toBe("Locality A");
    expect(normalized[1].orders).toBe(10);
  });

  it("aggregates duplicate destination entries with same label and city", () => {
    const duplicates = [
      { label: "Home", city: "Bangalore", orders: 10, spend: 6000, fee: 100 },
      { label: "Home", city: "Bangalore", orders: 22, spend: 12400, fee: 250 },
      { label: "Office", city: "Bangalore", orders: 5, spend: 2000, fee: 50 },
    ];
    const normalized = normalizeDestinationsData(duplicates, "spend");
    expect(normalized).toHaveLength(2);
    expect(normalized[0].label).toBe("Home");
    expect(normalized[0].orders).toBe(32);
    expect(normalized[0].spend).toBe(18400);
    expect(normalized[0].fee).toBe(350);
  });

  it("handles object wrapped payload ({ labels: [...] } or { places: { labels: [...] } })", () => {
    const objWithLabels = { labels: samplePlaces.slice(0, 3) };
    expect(normalizeDestinationsData(objWithLabels)).toHaveLength(3);

    const objWithPlaces = { places: { labels: samplePlaces.slice(0, 2) } };
    expect(normalizeDestinationsData(objWithPlaces)).toHaveLength(2);
  });

  it("avoids duplicating city name if already present in destination label", () => {
    const withCity = [
      { label: "Bangalore Central", city: "Bangalore", orders: 5, spend: 2000, fee: 40 },
    ];
    const normalized = normalizeDestinationsData(withCity);
    expect(normalized[0].displayName).toBe("Bangalore Central");
  });

  it("slices to maxItems if specified", () => {
    const normalized = normalizeDestinationsData(samplePlaces, "spend", 2);
    expect(normalized).toHaveLength(2);
  });
});

describe("DeliveryDestinationsChart - Active Selection (isDestinationSelected & hasAnySelection)", () => {
  it("matches when locality filter matches destination label", () => {
    const item = { label: "Home", city: "Bangalore" };
    expect(isDestinationSelected(item, { localities: ["Home"] })).toBe(true);
    expect(isDestinationSelected(item, { localities: ["Office"] })).toBe(false);
  });

  it("matches when city filter matches destination city", () => {
    const item = { label: "Home", city: "Bangalore" };
    expect(isDestinationSelected(item, { cities: ["Bangalore"] })).toBe(true);
    expect(isDestinationSelected(item, { cities: ["Mumbai"] })).toBe(false);
  });

  it("detects if any item in dataset matches active filters", () => {
    const normalized = normalizeDestinationsData(samplePlaces);
    expect(hasAnySelection(normalized, { localities: ["Home"] })).toBe(true);
    expect(hasAnySelection(normalized, { localities: ["NonExistent"] })).toBe(false);
    expect(hasAnySelection(normalized, {})).toBe(false);
  });
});

describe("DeliveryDestinationsChart - Option Builder (buildDeliveryDestinationsOption)", () => {
  const theme = resolveChartTheme("light", "emerald");

  it("configures category yAxis with inverse: true so #1 ranked destination is at top", () => {
    const option = buildDeliveryDestinationsOption(samplePlaces, {
      theme,
      metric: "spend",
    });

    const yAxis = option.yAxis as any;
    expect(yAxis.type).toBe("category");
    expect(yAxis.inverse).toBe(true);
    expect(yAxis.data[0]).toBe("Home (Bangalore)");
    expect(yAxis.data[1]).toBe("Office (Bangalore)");
  });

  it("configures value xAxis with formatted rupees for spend metric", () => {
    const option = buildDeliveryDestinationsOption(samplePlaces, {
      theme,
      metric: "spend",
    });

    const xAxis = option.xAxis as any;
    expect(xAxis.type).toBe("value");
    expect(xAxis.name).toBe("Spend (₹)");
    expect(xAxis.axisLabel.formatter(18400)).toBe("₹18,400");
  });

  it("configures value xAxis with integer labels for orders metric", () => {
    const option = buildDeliveryDestinationsOption(samplePlaces, {
      theme,
      metric: "orders",
    });

    const xAxis = option.xAxis as any;
    expect(xAxis.type).toBe("value");
    expect(xAxis.name).toBe("Orders");
    expect(xAxis.axisLabel.formatter(32)).toBe("32");
  });

  it("uses theme.colors[0] for series bars without hardcoded colors", () => {
    const option = buildDeliveryDestinationsOption(samplePlaces, { theme });
    const series = (option.series as any[])[0];

    expect(series.type).toBe("bar");
    expect(series.data[0].itemStyle.color).toBe(theme.colors[0]);
    expect(series.data[0].itemStyle.borderRadius).toEqual([0, 4, 4, 0]);
  });

  it("shows order count in bar secondary label when viewing spend", () => {
    const option = buildDeliveryDestinationsOption(samplePlaces, {
      theme,
      metric: "spend",
    });
    const series = (option.series as any[])[0];
    const labelFormatter = series.label.formatter;

    expect(labelFormatter({ data: series.data[0] })).toBe("32 orders");
  });

  it("shows formatted rupees in bar secondary label when viewing orders", () => {
    const option = buildDeliveryDestinationsOption(samplePlaces, {
      theme,
      metric: "orders",
    });
    const series = (option.series as any[])[0];
    const labelFormatter = series.label.formatter;

    expect(labelFormatter({ data: series.data[0] })).toBe("₹18,400");
  });

  it("dims unselected bars to opacity 0.35 when active filter is set", () => {
    const option = buildDeliveryDestinationsOption(samplePlaces, {
      theme,
      activeFilters: { localities: ["Home"] },
    });

    const series = (option.series as any[])[0];
    // First bar is "Home" -> opacity 1
    expect(series.data[0].itemStyle.opacity).toBe(1);
    // Second bar is "Office" -> opacity 0.35
    expect(series.data[1].itemStyle.opacity).toBe(0.35);
    // Third bar is "Parents House" -> opacity 0.35
    expect(series.data[2].itemStyle.opacity).toBe(0.35);
  });

  it("dims non-matching bars to opacity 0.35 when city filter is set", () => {
    const option = buildDeliveryDestinationsOption(samplePlaces, {
      theme,
      activeFilters: { cities: ["Bangalore"] },
    });

    const series = (option.series as any[])[0];
    // "Home" (Bangalore) -> 1
    expect(series.data[0].itemStyle.opacity).toBe(1);
    // "Office" (Bangalore) -> 1
    expect(series.data[1].itemStyle.opacity).toBe(1);
    // "Parents House" (Mysore) -> 0.35
    expect(series.data[2].itemStyle.opacity).toBe(0.35);
  });

  it("keeps all bars at opacity 1 when no filter is active", () => {
    const option = buildDeliveryDestinationsOption(samplePlaces, {
      theme,
      activeFilters: { localities: [], cities: [] },
    });

    const series = (option.series as any[])[0];
    expect(series.data[0].itemStyle.opacity).toBe(1);
    expect(series.data[1].itemStyle.opacity).toBe(1);
    expect(series.data[2].itemStyle.opacity).toBe(1);
  });

  it("handles animation and respects prefersReducedMotion", () => {
    const normalOption = buildDeliveryDestinationsOption(samplePlaces, {
      theme,
      prefersReducedMotion: false,
    });
    expect(normalOption.animation).toBe(true);
    expect(normalOption.animationDuration).toBe(600);
    expect(normalOption.animationEasing).toBe("cubicOut");

    const reducedOption = buildDeliveryDestinationsOption(samplePlaces, {
      theme,
      prefersReducedMotion: true,
    });
    expect(reducedOption.animation).toBe(false);
    expect(reducedOption.animationDuration).toBe(0);
  });

  it("returns clean fallback option when data is empty", () => {
    const emptyOption = buildDeliveryDestinationsOption([], { theme });
    expect((emptyOption.series as any[])).toHaveLength(0);
  });
});

describe("DeliveryDestinationsChart - Click Cross-Filtering (handleDestinationClick)", () => {
  it("toggles locality filter when clicking destination", () => {
    const update = vi.fn();
    const filters = {
      filters: { localities: [] as string[], cities: [] as string[] },
      update,
    };

    const item = { label: "Home", city: "Bangalore", orders: 32, spend: 18400, fee: 350 };
    handleDestinationClick(item, filters, "locality");

    expect(update).toHaveBeenCalledWith({ localities: ["Home"] });
  });

  it("toggles off locality filter when destination is already active", () => {
    const update = vi.fn();
    const filters = {
      filters: { localities: ["Home"], cities: [] as string[] },
      update,
    };

    const item = { label: "Home", city: "Bangalore", orders: 32, spend: 18400, fee: 350 };
    handleDestinationClick(item, filters, "locality");

    expect(update).toHaveBeenCalledWith({ localities: [] });
  });

  it("toggles city filter when target='city'", () => {
    const update = vi.fn();
    const filters = {
      filters: { localities: [], cities: [] },
      update,
    };

    const item = { label: "Home", city: "Bangalore", orders: 32, spend: 18400, fee: 350 };
    handleDestinationClick(item, filters, "city");

    expect(update).toHaveBeenCalledWith({ cities: ["Bangalore"] });
  });

  it("invokes onDestinationClick callback if provided", () => {
    const onDestinationClick = vi.fn();
    const item = {
      key: "Home:::Bangalore",
      label: "Home",
      city: "Bangalore",
      displayName: "Home (Bangalore)",
      orders: 32,
      spend: 18400,
      fee: 350,
      aov: 575,
    };

    handleDestinationClick(item, null, "locality", onDestinationClick);
    expect(onDestinationClick).toHaveBeenCalledWith(item);
  });
});

describe("DeliveryDestinationsChart - Screen Reader Table (buildDestinationsTableRows)", () => {
  it("generates correct tableHeaders and formatted tableRows", () => {
    const normalized = normalizeDestinationsData(samplePlaces);
    const { tableHeaders, tableRows, tableData } = buildDestinationsTableRows(normalized);

    expect(tableHeaders).toEqual([
      "Destination",
      "City",
      "Orders",
      "Spend",
      "Delivery Fees",
    ]);

    expect(tableRows[0]).toEqual([
      "Home",
      "Bangalore",
      32,
      "₹18,400",
      "₹350",
    ]);

    expect(tableData[0]).toEqual({
      Destination: "Home",
      City: "Bangalore",
      Orders: 32,
      Spend: "₹18,400",
      "Delivery Fees": "₹350",
    });
  });
});

describe("DeliveryDestinationsChart - Tooltip Formatter (formatDestinationsTooltip)", () => {
  const theme = resolveChartTheme("light", "emerald");

  it("formats rich HTML tooltip with rank, label, city, spend, orders and net fees", () => {
    const normalized = normalizeDestinationsData(samplePlaces);
    const html = formatDestinationsTooltip({ dataIndex: 0 }, normalized, theme);

    expect(html).toContain("Home");
    expect(html).toContain("#1");
    expect(html).toContain("Bangalore");
    expect(html).toContain("₹18,400");
    expect(html).toContain("32 orders");
    expect(html).toContain("₹350");
  });

  it("returns empty string when params is missing or invalid", () => {
    expect(formatDestinationsTooltip(null, [], theme)).toBe("");
  });
});

describe("DeliveryDestinationsChart - Component Rendering", () => {
  afterEach(() => {
    clearRegistry();
  });

  it("renders ChartCard container with title, subtitle, and takeaway caption", () => {
    const html = renderToString(
      <MemoryRouter>
        <DeliveryDestinationsChart data={samplePlaces} />
      </MemoryRouter>,
    );

    expect(html).toContain("Delivery destinations");
    expect(html).toContain("Spend and order volume ranked across delivery localities");
    expect(html).toContain("Top destination is Home (Bangalore)");
    expect(html).toContain("Spend");
    expect(html).toContain("Orders");
  });

  it("renders friendly empty state when data is empty", () => {
    const html = renderToString(
      <MemoryRouter>
        <DeliveryDestinationsChart data={[]} />
      </MemoryRouter>,
    );

    expect(html).toContain("No delivery destination data recorded");
  });

  it("renders unsupported reason when provided", () => {
    const html = renderToString(
      <MemoryRouter>
        <DeliveryDestinationsChart
          data={[]}
          unsupported_reason="Delivery places not supported for this account"
        />
      </MemoryRouter>,
    );

    expect(html).toContain("Delivery places not supported for this account");
  });
});
