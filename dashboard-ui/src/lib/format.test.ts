import { describe, expect, it } from "vitest";
import { inr, pluralize, signedInr } from "./format";

describe("pluralize", () => {
  it("uses the singular only for exactly one", () => {
    expect(pluralize(0, "order")).toBe("0 orders");
    expect(pluralize(1, "order")).toBe("1 order");
    expect(pluralize(2, "order")).toBe("2 orders");
    expect(pluralize(1, "second")).toBe("1 second");
    expect(pluralize(1, "day")).toBe("1 day");
    expect(pluralize(2, "dish", "dishes")).toBe("2 dishes");
    expect(pluralize(1234, "order")).toBe("1,234 orders");
  });
});

describe("inr", () => {
  it("rounds first, so a rounded zero has no sign", () => {
    expect(inr(0, 2)).toBe("₹0.00");
    expect(inr(-0, 2)).toBe("₹0.00");
    expect(inr(-0.004, 2)).toBe("₹0.00");
    expect(inr(-0.4)).toBe("₹0");
  });
  it("keeps the sign for real negatives", () => {
    expect(inr(-0.005, 2)).toBe("−₹0.01");
    expect(inr(-12.5, 2)).toBe("−₹12.50");
  });
  it("formats positives with Indian grouping", () => {
    expect(inr(1, 2)).toBe("₹1.00");
    expect(inr(2, 2)).toBe("₹2.00");
    expect(inr(123456, 0)).toBe("₹1,23,456");
  });
  it("shows a dash for missing values", () => {
    expect(inr(null)).toBe("–");
  });
});

describe("signedInr", () => {
  it("always signs real amounts and never signs a rounded zero", () => {
    expect(signedInr(0)).toBe("₹0.00");
    expect(signedInr(-0.004)).toBe("₹0.00");
    expect(signedInr(1)).toBe("+₹1.00");
    expect(signedInr(-2)).toBe("−₹2.00");
  });
});
