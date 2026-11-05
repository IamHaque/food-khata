import test from "node:test";
import assert from "node:assert/strict";
import {
  filterOrders,
  totals,
  paginate,
  timeline,
  rank,
  initialTheme,
} from "./model.js";
const orders = Array.from({ length: 26 }, (_, i) => ({
  id: String(i),
  account_id: i < 20 ? "a" : "b",
  platform: "SWIGGY",
  order_status: i === 1 ? "CANCELLED" : "DELIVERED",
  order_date: "2026-01-01",
  final_amount_paid: 100,
  total_discount: 10,
  reported_savings: 15,
  financial_verified: i === 0 ? 1 : 0,
  items: [{ item_name: "Lunch", quantity: 1, total_price: 80 }],
}));
test("filters all records and calculates delivered financials", () => {
  const rows = filterOrders(orders, { account: "a" });
  assert.equal(rows.length, 20);
  const t = totals(rows);
  assert.equal(t.spend, 1900);
  assert.equal(t.verified, 10);
  assert.equal(t.unverified, 180);
  assert.equal(t.advertised, 285);
});
test("pagination searches full history and bounds pages", () => {
  const result = paginate(orders, "", "id", false, 1, 20);
  assert.equal(result.count, 26);
  assert.equal(result.rows.length, 6);
  assert.equal(paginate(orders, '"id":"25"', "id", false, 0).count, 1);
});
test("timeline fills gaps and excludes cancelled spend", () => {
  const rows = timeline(orders, "2026-01-01", "2026-01-03", "day");
  assert.equal(rows.length, 3);
  assert.equal(rows[0].orders, 26);
  assert.equal(rows[0].spend, 2500);
  assert.equal(rows[1].orders, 0);
  assert.deepEqual(timeline(orders, "2026-02-01", "2026-01-01", "day"), []);
});
test("rankings retain every dish and theme follows stored preference", () => {
  assert.equal(rank(orders, "dishes")[0].count, 26);
  assert.equal(initialTheme("light", true), "light");
  assert.equal(initialTheme(null, true), "dark");
});
