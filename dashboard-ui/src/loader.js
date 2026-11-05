const record = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
function scalars(value, label) {
  if (
    !record(value) ||
    Object.values(value).some(
      (v) =>
        (v !== null && !["string", "number", "boolean"].includes(typeof v)) ||
        (typeof v === "number" && !Number.isFinite(v)),
    )
  )
    throw new Error(`Invalid ${label} record.`);
}
export function validateData(value) {
  if (
    !record(value) ||
    value.schema_version !== 1 ||
    !Array.isArray(value.accounts) ||
    !Array.isArray(value.orders) ||
    !Array.isArray(value.archive_imports)
  )
    throw new Error(
      "This is not a supported Food Khata export (schema version 1 required).",
    );
  const numeric = [
    "final_amount_paid",
    "item_subtotal",
    "total_discount",
    "delivery_fee",
    "delivery_fee_discount",
    "platform_fee",
    "packaging_fee",
    "total_tax",
    "tip",
    "other_charges",
    "refund_amount",
    "reported_savings",
    "reconciliation_difference",
    "food_discount",
    "financial_verified",
    "source_complete",
    "quantity",
    "unit_price",
    "total_price",
    "is_veg",
    "latitude",
    "longitude",
  ];
  function checkNumbers(obj) {
    for (const key of numeric)
      if (
        obj[key] != null &&
        (typeof obj[key] !== "number" || !Number.isFinite(obj[key]))
      )
        throw new Error(`Invalid numeric value in ${key}.`);
  }
  const accounts = new Set(),
    ids = new Set();
  for (const a of value.accounts) {
    scalars(a, "account");
    if (typeof a.id !== "string" || !a.id || accounts.has(a.id))
      throw new Error("Invalid or duplicate account.");
    accounts.add(a.id);
  }
  if (value.selected_account != null && !accounts.has(value.selected_account))
    throw new Error("Unknown selected customer.");
  for (const o of value.orders) {
    if (
      !record(o) ||
      typeof o.id !== "string" ||
      ids.has(o.id) ||
      !accounts.has(o.account_id) ||
      typeof o.platform !== "string" ||
      typeof o.order_status !== "string" ||
      !Array.isArray(o.items) ||
      typeof o.final_amount_paid !== "number"
    )
      throw new Error("Invalid order record.");
    ids.add(o.id);
    const { restaurant, address, items, ...fields } = o;
    scalars(fields, "order");
    checkNumbers(fields);
    for (const key of [
      "order_date",
      "order_time",
      "order_timestamp",
      "payment_method",
      "platform_order_id",
    ])
      if (o[key] != null && typeof o[key] !== "string")
        throw new Error(`Invalid ${key}.`);
    if (
      o.order_date &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(o.order_date) ||
        Number.isNaN(Date.parse(o.order_date + "T00:00:00Z")) ||
        new Date(o.order_date + "T00:00:00Z").toISOString().slice(0, 10) !==
          o.order_date)
    )
      throw new Error("Invalid order date.");
    if (o.order_time && !/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(o.order_time))
      throw new Error("Invalid order time.");
    for (const [label, obj] of [
      ["restaurant", restaurant],
      ["address", address],
    ]) {
      if (obj == null) continue;
      scalars(obj, label);
      checkNumbers(obj);
      for (const key of [
        "name",
        "locality",
        "label",
        "normalized_label",
        "full_address",
        "city",
      ])
        if (obj[key] != null && typeof obj[key] !== "string")
          throw new Error(`Invalid ${label} ${key}.`);
    }
    for (const i of items) {
      scalars(i, "item");
      checkNumbers(i);
      if (
        typeof i.item_name !== "string" ||
        (i.category != null && typeof i.category !== "string")
      )
        throw new Error("Invalid order item.");
    }
  }
  for (const a of value.archive_imports) scalars(a, "archive");
  return value;
}
export async function readExport(file) {
  try {
    return validateData(JSON.parse(await file.text()));
  } catch (error) {
    if (error instanceof SyntaxError)
      throw new Error("The selected file is not valid JSON.");
    throw error;
  }
}
