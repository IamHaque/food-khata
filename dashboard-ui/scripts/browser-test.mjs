import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const root = resolve(import.meta.dirname, ".."),
  output = resolve(root, "test-results");
mkdirSync(output, { recursive: true });
const accounts = [
  { id: "a", phone: "Customer A" },
  { id: "b", phone: "Customer B" },
];
const orders = Array.from({ length: 65 }, (_, i) => ({
  id: String(i),
  account_id: i < 60 ? "a" : "b",
  platform: i % 2 ? "SWIGGY" : "ZOMATO",
  platform_order_id: "order-" + i,
  order_timestamp: "2026-01-01T12:00:00+05:30",
  order_date: "2026-01-01",
  order_time: "12:00:00",
  order_status: i === 1 ? "CANCELLED" : "DELIVERED",
  payment_method: "UPI",
  final_amount_paid: 100 + i,
  item_subtotal: 150,
  total_discount: 50,
  food_discount: 50,
  delivery_fee: 0,
  packaging_fee: 0,
  platform_fee: 0,
  total_tax: 0,
  financial_verified: i % 2,
  source_complete: 1,
  reconciliation_difference: 0,
  restaurant: {
    id: "r" + i,
    name: i === 64 ? "Last Restaurant" : "Restaurant " + i,
    locality: "Local area",
  },
  address: {
    normalized_label: "Central",
    label: "Other",
    full_address: "Example address",
  },
  items: [
    {
      item_name:
        i === 0
          ? "</script><script>window.injected=true</script>"
          : "Lunch " + i,
      quantity: 1,
      total_price: 100,
      is_veg: 1,
      category: "Meals",
    },
  ],
}));
const data = {
  accounts,
  orders,
  archive_imports: [
    {
      account_id: "a",
      platform: "SWIGGY",
      history_complete: 1,
      details_complete: 1,
      lifetime_complete: 0,
    },
  ],
};
const css = readFileSync(
    resolve(root, "../food_khata/dashboard_assets/app.css"),
    "utf8",
  ),
  js = readFileSync(
    resolve(root, "../food_khata/dashboard_assets/app.js"),
    "utf8",
  );
const file = resolve(output, "fixture.html");
writeFileSync(
  file,
  '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>' +
    css +
    '</style></head><body><div id="root"></div><script id="analytics-data" type="application/json">' +
    JSON.stringify(data).replaceAll("<", "\\u003c") +
    "</script><script>" +
    js.replaceAll("</script", "<\\/script") +
    "</script></body></html>",
);
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
    : {}),
});
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    reducedMotion: "reduce",
    colorScheme: "light",
    offline: true,
  });
  const page = await context.newPage(),
    errors = [],
    external = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (/^https?:/.test(r.url())) external.push(r.url());
  });
  await page.goto(pathToFileURL(file).href);
  await page
    .getByRole("heading", { name: "The big picture", exact: true })
    .waitFor();
  assert.equal((await page.locator(".recharts-surface").count()) > 0, true);
  assert.equal(await page.evaluate(() => window.injected), undefined);
  assert.match(await page.locator("main").innerText(), /₹/);
  await page
    .getByRole("button", { name: "About Delivered spend", exact: true })
    .hover();
  await page.getByRole("tooltip").waitFor();
  await page.mouse.move(0, 0);
  await page.screenshot({
    path: resolve(output, "overview-light.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  assert.equal(
    await page.locator("html").evaluate((e) => e.classList.contains("dark")),
    true,
  );
  await page.reload();
  await page.getByRole("button", { name: "Switch to light theme" }).waitFor();
  await page.screenshot({
    path: resolve(output, "overview-dark.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Order history", exact: true })
    .click();
  assert.match(await page.locator("main").innerText(), /65 orders/);
  assert.equal(await page.locator("tbody tr").count(), 20);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  assert.match(await page.locator("main").innerText(), /Page 2 of 4/);
  await page
    .getByRole("textbox", { name: "Search orders", exact: true })
    .fill("Last Restaurant");
  assert.equal(await page.locator("tbody tr").count(), 1);
  await page.getByRole("button", { name: "View", exact: true }).click();
  await page.getByRole("dialog").waitFor();
  assert.match(await page.getByRole("dialog").innerText(), /order-64/);
  await page.keyboard.press("Escape");
  await page
    .getByRole("textbox", { name: "Search orders", exact: true })
    .fill("");
  await page.getByLabel("Customer", { exact: true }).selectOption("b");
  assert.equal(await page.locator("tbody tr").count(), 5);
  await page.getByRole("button", { name: /Filters/ }).click();
  await page.getByLabel("From", { exact: true }).fill("2027-01-01");
  await page.keyboard.press("Escape");
  assert.match(await page.locator("main").innerText(), /No matching orders/);
  await page.getByRole("button", { name: /Filters/ }).click();
  await page.getByRole("button", { name: "Clear all", exact: true }).click();
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("tbody tr").count(), 5);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page.screenshot({
    path: resolve(output, "overview-mobile.png"),
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
    "mobile page overflow",
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  console.log(
    "Browser checks passed: offline rendering, charts, injection safety, theme persistence, customer filters, full history search, pagination, detail dialog, date filters and mobile layout.",
  );
} finally {
  await browser.close();
}
