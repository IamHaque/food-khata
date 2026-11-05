import test from "node:test";
import assert from "node:assert/strict";
import { validateData, readExport } from "./loader.js";
const data = {
  schema_version: 1,
  accounts: [{ id: "a", phone: "Customer A" }],
  orders: [
    {
      id: "1",
      account_id: "a",
      platform: "SWIGGY",
      order_status: "DELIVERED",
      items: [],
      final_amount_paid: 2,
    },
  ],
  archive_imports: [],
};
test("accepts valid exports and rejects unsupported or malformed records", () => {
  assert.equal(validateData(data), data);
  assert.throws(() => validateData({ ...data, schema_version: 2 }));
  assert.throws(() =>
    validateData({
      ...data,
      orders: [{ ...data.orders[0], final_amount_paid: Infinity }],
    }),
  );
  assert.throws(() =>
    validateData({ ...data, orders: [{ ...data.orders[0], items: null }] }),
  );
});
test("reports invalid JSON", async () => {
  await assert.rejects(readExport({ text: async () => "{" }), /not valid JSON/);
});

test("rejects unsafe nested values, missing paid amounts and duplicate or foreign records", () => {
  const order = data.orders[0];
  for (const bad of [
    { ...order, final_amount_paid: undefined },
    { ...order, account_id: "unknown" },
    { ...order, restaurant: { name: { unexpected: "object" } } },
    { ...order, address: { full_address: [] } },
    { ...order, order_date: "2026-02-31" },
    { ...order, order_time: "25:00:00" },
    { ...order, items: [{ item_name: "Food", quantity: "two" }] },
  ])
    assert.throws(() => validateData({ ...data, orders: [bad] }));
  assert.throws(() => validateData({ ...data, orders: [order, order] }));
});
