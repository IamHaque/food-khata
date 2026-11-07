import { chromium } from "@playwright/test";
import { preview } from "vite";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
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
  delivery_fee_discount: 0,
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
  schema_version: 1,
  generated_at: "2026-11-06T00:00:00+05:30",
  accounts,
  orders,
  archive_imports: [],
};
const server = await preview({
  root,
  preview: { host: "127.0.0.1", port: 0, open: false },
});
const url = server.resolvedUrls.local[0];
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
  });
  await context.route("**/*", (route) => {
    const target = new URL(route.request().url());
    if (
      target.origin === new URL(url).origin &&
      (target.pathname === "/" || target.pathname === "/legacy" || target.pathname.startsWith("/assets/"))
    )
      return route.continue();
    return route.abort();
  });
  const page = await context.newPage(),
    errors = [],
    external = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (/^https?:/.test(r.url()) && !r.url().startsWith(url))
      external.push(r.url());
  });
  await page.route("**/data/dashboard.json", (route) =>
    route.fulfill({ json: data }),
  );
  await page.goto(new URL("legacy", url).href);
  await page.getByRole("combobox", { name: "Customer", exact: true }).waitFor();
  assert.equal(await page.locator('[role="tab"]').count(), 0);
  assert.equal((await page.locator(".recharts-surface").count()) > 0, true);
  assert.equal(await page.evaluate(() => window.injected), undefined);
  assert.match(await page.locator("main").innerText(), /₹/);
  assert.equal(await page.locator("tbody tr").count(), 20);
  await page
    .getByRole("button", { name: /About Sum of amounts paid/ })
    .first()
    .hover();
  await page.getByRole("tooltip").waitFor();
  await page.mouse.move(0, 0);
  const heatCell=page.getByRole("button", { name: /Thursday 12:00:/ });
  await heatCell.scrollIntoViewIfNeeded();
  await heatCell.focus();
  await heatCell.hover();
  await page.getByRole("tooltip").waitFor();
  assert.match(await page.getByRole("tooltip").innerText(), /65 orders/);
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
  await page.getByRole("combobox", { name: "Customer", exact: true }).waitFor();
  await page.screenshot({
    path: resolve(output, "overview-dark.png"),
    fullPage: true,
  });
  assert.match(await page.locator("main").innerText(), /65 orders/);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  assert.match(await page.locator("main").innerText(), /Page 2 of 4/);
  await page
    .getByRole("textbox", { name: "Search orders", exact: true })
    .fill("Last Restaurant");
  assert.equal(await page.locator("tbody tr").count(), 1);
  await page.getByRole("button", { name: "View", exact: true }).click();
  await page.getByRole("dialog").waitFor();
  const receipt = await page.getByRole("dialog").innerText();
  for (const text of [
    "order-64",
    "Lunch 64",
    "Amount paid",
    "Payment breakdown",
    "Example address",
  ])
    assert.ok(receipt.includes(text), text);
  for (const field of [
    "source_bill_json",
    "final_amount_paid",
    "reconciliation_difference",
    "normalized_label",
  ])
    assert.ok(!receipt.includes(field), field);
  await page.keyboard.press("Escape");
  await page
    .getByRole("textbox", { name: "Search orders", exact: true })
    .fill("");
  await page.getByRole("combobox", { name: "Customer", exact: true }).click();
  await page.getByRole("option", { name: "Customer B", exact: true }).click();
  assert.equal(await page.locator("tbody tr").count(), 5);
  await page.getByRole("button", { name: /Filters/ }).click();
  await page.getByRole("button", { name: "From date", exact: true }).click();
  await page.locator("[data-day]").first().click();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  assert.match(await page.locator("main").innerText(), /No matching orders/);
  if (!(await page.getByRole("button", { name: "Clear all", exact: true }).isVisible()))
    await page.getByRole("button", { name: /Filters/ }).click();
  await page.getByRole("button", { name: "Clear all", exact: true }).click();
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("tbody tr").count(), 5);
  await page
    .getByLabel("Choose data file")
    .setInputFiles({
      name: "bad.json",
      mimeType: "application/json",
      buffer: Buffer.from('{"schema_version":99}'),
    });
  await page.getByRole("alert").waitFor();
  assert.equal(await page.locator("tbody tr").count(), 5);
  await page
    .getByLabel("Choose data file")
    .setInputFiles({
      name: "new.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({ ...data, orders: orders.slice(0, 2) }),
      ),
    });
  await page.getByText("Page 1 of 1 · 2 orders",{exact:true}).waitFor();
  assert.equal(await page.locator("tbody tr").count(), 2);
  await page.setViewportSize({ width: 390, height: 844 });
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
    "Browser checks passed: separate JSON fetch/import, single page, shadcn dropdown/calendar/table/charts, heatmap tooltip, themes, complete history, receipt summary, invalid-file recovery and mobile layout.",
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}


