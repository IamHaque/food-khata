export const money = (n) =>
  "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
export const restaurant = (o) => o.restaurant?.name || "Unknown";
export const location = (o) => o.address?.normalized_label || "Unknown";
export const qualityChecks = {
  unverified: (o) => o.financial_verified !== 1,
  date: (o) => !o.order_date,
  address: (o) => !o.address?.full_address,
  items: (o) => !o.items?.length,
  incomplete: (o) => o.source_complete !== 1,
  reconciliation: (o) =>
    o.reconciliation_difference == null ||
    Math.abs(Number(o.reconciliation_difference)) > 1,
};
export function filterOrders(orders, f) {
  return orders.filter(
    (o) =>
      (!f.account || o.account_id === f.account) &&
      (!f.from || o.order_date >= f.from) &&
      (!f.to || o.order_date <= f.to) &&
      (!f.platform || o.platform === f.platform) &&
      (!f.status || o.order_status === f.status) &&
      (!f.restaurant || restaurant(o) === f.restaurant) &&
      (!f.location || location(o) === f.location) &&
      (!f.payment || (o.payment_method || "Unknown") === f.payment) &&
      (!f.quality || qualityChecks[f.quality](o)),
  );
}
export function totals(orders) {
  const delivered = orders.filter((o) => o.order_status === "DELIVERED");
  const sum = (rows, key) => rows.reduce((n, o) => n + Number(o[key] || 0), 0);
  const spend = sum(delivered, "final_amount_paid");
  return {
    count: orders.length,
    spend,
    average: delivered.length ? spend / delivered.length : 0,
    verified: sum(
      delivered.filter((o) => o.financial_verified === 1),
      "total_discount",
    ),
    unverified: sum(
      delivered.filter((o) => o.financial_verified !== 1),
      "total_discount",
    ),
    advertised: sum(delivered, "reported_savings"),
    refunds: sum(orders, "refund_amount"),
    fees: [
      "delivery_fee",
      "platform_fee",
      "packaging_fee",
      "total_tax",
      "tip",
      "other_charges",
    ].reduce((n, k) => n + sum(delivered, k), 0),
  };
}
export function paginate(orders, search, sort, descending, page, size = 20) {
  const filtered = orders.filter((o) =>
    JSON.stringify(o).toLowerCase().includes(search.toLowerCase()),
  );
  filtered.sort((a, b) => {
    const x = sort === "restaurant" ? restaurant(a) : a[sort],
      y = sort === "restaurant" ? restaurant(b) : b[sort];
    return (
      (typeof x === "number" && typeof y === "number"
        ? x - y
        : String(x || "").localeCompare(String(y || ""))) *
      (descending ? -1 : 1)
    );
  });
  const pages = Math.max(1, Math.ceil(filtered.length / size)),
    current = Math.max(0, Math.min(page, pages - 1));
  return {
    rows: filtered.slice(current * size, (current + 1) * size),
    count: filtered.length,
    pages,
    current,
  };
}
const dateString = (d) =>
  [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
function bucketDate(date, interval) {
  const d = new Date(date + "T00:00:00");
  if (interval === "week") d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  if (interval === "month") d.setDate(1);
  if (interval === "year") d.setMonth(0, 1);
  return d;
}
export function timeline(orders, inception, end, interval) {
  if (
    !inception ||
    !end ||
    inception > end ||
    (new Date(end) - new Date(inception)) / 86400000 > 36525
  )
    return [];
  const buckets = new Map(),
    d = bucketDate(inception, interval),
    last = dateString(bucketDate(end, interval));
  while (dateString(d) <= last) {
    buckets.set(dateString(d), {
      date: dateString(d),
      orders: 0,
      spend: 0,
      savings: 0,
    });
    if (interval === "day") d.setDate(d.getDate() + 1);
    else if (interval === "week") d.setDate(d.getDate() + 7);
    else if (interval === "month") d.setMonth(d.getMonth() + 1);
    else d.setFullYear(d.getFullYear() + 1);
  }
  orders.forEach((o) => {
    if (!/^\d{4}-\d\d-\d\d$/.test(o.order_date || "")) return;
    const day = bucketDate(o.order_date, interval);
    if (Number.isNaN(day.getTime())) return;
    const b = buckets.get(dateString(day));
    if (b) {
      b.orders++;
      if (o.order_status === "DELIVERED") {
        b.spend += Number(o.final_amount_paid || 0);
        b.savings += Number(o.total_discount || 0);
      }
    }
  });
  return [...buckets.values()];
}
export function rank(orders, kind) {
  const grouped = new Map();
  const add = (name, amount, qty = 1, detail = "") => {
    if (!name) return;
    const key = name.trim().toLowerCase(),
      row = grouped.get(key) || {
        name,
        count: 0,
        amount: 0,
        details: new Set(),
      };
    row.count += Number(qty || 0);
    row.amount += Number(amount || 0);
    if (detail) row.details.add(detail);
    grouped.set(key, row);
  };
  for (const o of orders) {
    if (kind === "restaurants")
      add(
        restaurant(o),
        o.order_status === "DELIVERED" ? o.final_amount_paid : 0,
        1,
        o.restaurant?.locality,
      );
    else if (kind === "dishes")
      (o.items || []).forEach((i) =>
        add(i.item_name, i.total_price, i.quantity),
      );
    else
      add(
        location(o),
        o.order_status === "DELIVERED" ? o.final_amount_paid : 0,
        1,
        [o.address?.label, o.address?.full_address].filter(Boolean).join(" · "),
      );
  }
  return [...grouped.values()].sort((a, b) => b.count - a.count);
}
export function initialTheme(stored, prefersDark) {
  return stored === "dark" || stored === "light"
    ? stored
    : prefersDark
      ? "dark"
      : "light";
}
