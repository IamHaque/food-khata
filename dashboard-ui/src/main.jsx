import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  money,
  restaurant,
  location,
  filterOrders,
  totals,
  paginate,
  timeline,
  rank,
  initialTheme,
} from "./model";
import { validateData, readExport } from "./loader";

const blankFilters = {
  account: "",
  from: "",
  to: "",
  platform: "",
  status: "",
  restaurant: "",
  location: "",
  payment: "",
};
const fieldLabels = {
  platform: "Platform",
  status: "Status",
  restaurant: "Restaurant",
  location: "Location",
  payment: "Payment",
};
const paletteAt = (i) => tokenColor(CHART_TOKENS[i % CHART_TOKENS.length]);
const chartConfig = () => ({
  spend: { label: "Spend", color: tokenColor("--primary") },
  orders: { label: "Orders", color: tokenColor("--primary") },
  savings: { label: "Discounts", color: tokenColor("--primary") },
  value: { label: "Amount", color: tokenColor("--primary") },
});
const readTheme = () => {
  try {
    return localStorage.getItem("food-khata-theme");
  } catch {
    return null;
  }
};
const saveTheme = (value) => {
  try {
    localStorage.setItem("food-khata-theme", value);
  } catch {}
};
const localDate = (d) =>
  [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
function Choice({ value, onChange, options, label, all = "All" }) {
  return (
    <Select
      value={value || "__all"}
      onValueChange={(v) => onChange(v === "__all" ? "" : v)}
    >
      <SelectTrigger aria-label={label}>
        <SelectValue placeholder={all} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__all">{all}</SelectItem>
        {options.map(([v, text]) => (
          <SelectItem key={v} value={v}>
            {text}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
function DatePicker({ label, value, onChange }) {
  const selected = value ? new Date(value + "T00:00:00") : undefined;
  return (
    <div>
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
        {label}
      </span>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            aria-label={`${label} date`}
            className="w-full justify-start"
          >
            <CalendarDays />
            {value || "Any date"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0">
          <Calendar
            mode="single"
            selected={selected}
            onSelect={(d) => onChange(d ? localDate(d) : "")}
            initialFocus
          />
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => onChange("")}
          >
            Clear date
          </Button>
        </PopoverContent>
      </Popover>
    </div>
  );
}
function Help({ text }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          aria-label={`About ${text}`}
          className="text-muted-foreground hover:text-foreground"
        >
          <Info size={14} />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{text}</TooltipContent>
    </Tooltip>
  );
}
function Panel({ title, description, children, action }) {
  return (
    <Card className="min-w-0 p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold tracking-tight">{title}</h3>
          <Help text={description} />
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}
function Stat({ title, value, description, Icon }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
          {title}
          <Help text={description} />
        </span>
        <span className="rounded-lg bg-emerald-500/10 p-2 text-emerald-600">
          <Icon size={16} />
        </span>
      </div>
      <div className="mt-5 text-2xl font-semibold tracking-tight sm:text-3xl">
        {value}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
    </Card>
  );
}
function Receipt({ order, onClose }) {
  if (!order) return null;
  const charges = [
    ["Item subtotal", order.item_subtotal],
    ["Food discount", order.food_discount],
    ["Delivery fee", order.delivery_fee],
    ["Platform fee", order.platform_fee],
    ["Packaging", order.packaging_fee],
    ["Tax", order.total_tax],
    ["Tip", order.tip],
    ["Other charges", order.other_charges],
  ];
  return (
    <Sheet open={!!order} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetTitle className="pr-8 text-2xl">{restaurant(order)}</SheetTitle>
        <SheetDescription>
          {order.order_date || "Unknown date"} · {order.platform} ·{" "}
          {order.order_status}
        </SheetDescription>
        <div className="mt-6 space-y-6">
          <div className="rounded-xl bg-muted p-4 text-sm">
            <p>
              <span className="text-muted-foreground">Order </span>
              {order.platform_order_id || order.id}
            </p>
            <p className="mt-1">
              <span className="text-muted-foreground">Payment </span>
              {order.payment_method || "Unknown"}
            </p>
          </div>
          <section>
            <h3 className="mb-3 font-semibold">Items</h3>
            {order.items.length ? (
              order.items.map((item, i) => (
                <div
                  className="flex justify-between gap-4 border-b py-3 text-sm"
                  key={i}
                >
                  <div>
                    {item.quantity} × {item.item_name}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {order.platform === "SWIGGY"
                        ? "Recorded line total after item discounts"
                        : "Recorded line total"}
                    </p>
                  </div>
                  <span>
                    {item.total_price == null ? "—" : money(item.total_price)}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No items recorded</p>
            )}
          </section>
          <section>
            <h3 className="mb-3 font-semibold">Payment breakdown</h3>
            {charges
              .filter(
                ([label, v]) =>
                  v != null &&
                  (!["Tip", "Other charges", "Food discount"].includes(label) ||
                    Number(v) !== 0),
              )
              .map(([label, value]) => (
                <div
                  key={label}
                  className="flex justify-between py-1.5 text-sm"
                >
                  <span className="text-muted-foreground">{label}</span>
                  <span>
                    {label === "Delivery fee" && Number(value) === 0
                      ? "Free"
                      : label === "Food discount"
                        ? `−${money(Math.abs(value))}`
                        : money(value)}
                  </span>
                </div>
              ))}
            <div className="mt-3 flex justify-between border-t pt-4 font-semibold">
              <span>{order.order_status === "DELIVERED" ? "Amount paid" : "Order total"}</span>
              <span>{money(order.final_amount_paid)}</span>
            </div>
          </section>
          {(Number(order.delivery_fee_discount) ||
            Number(order.total_discount)) > 0 && (
            <section>
              <h3 className="mb-2 font-semibold">Savings</h3>
              {Number(order.delivery_fee_discount) > 0 && (
                <div className="flex justify-between py-1.5 text-sm">
                  <span className="text-muted-foreground">
                    Delivery savings (already applied)
                  </span>
                  <span>{money(order.delivery_fee_discount)}</span>
                </div>
              )}
              {Number(order.total_discount) > 0 && (
                <div className="flex justify-between py-1.5 text-sm">
                  <span className="text-muted-foreground">Total savings</span>
                  <span>{money(order.total_discount)}</span>
                </div>
              )}
            </section>
          )}
          {Number(order.refund_amount) > 0 && (
            <section className="flex justify-between border-t pt-4 text-sm">
              <span className="font-semibold">Refund recorded</span>
              <span>{money(order.refund_amount)}</span>
            </section>
          )}
          <section>
            <h3 className="mb-2 font-semibold">Delivery address</h3>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">
              {[order.address?.label, order.address?.full_address]
                .filter(Boolean)
                .join(" · ") || "Not recorded"}
            </p>
          </section>
          {(order.financial_verified !== 1 || order.source_complete !== 1) && (
            <p className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
              {order.source_complete !== 1
                ? "The source details may be incomplete. "
                : ""}
              {order.financial_verified !== 1
                ? "The payment breakdown has not been verified."
                : ""}
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Ranking({ title, items, search, description }) {
  const shown = items.filter((x) =>
    x.name.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <Panel title={title} description={description}>
      <div className="max-h-96 overflow-auto">
        {shown.length ? (
          shown.map((r, i) => (
            <div
              key={r.name}
              className="flex items-center gap-4 border-b py-3 last:border-0"
            >
              <span className="w-5 text-xs text-muted-foreground">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{r.name}</p>
                <p className="text-xs text-muted-foreground">
                  {r.count} {title === "Dishes" ? "items" : "orders"}
                </p>
              </div>
              <span className="text-sm font-medium">{money(r.amount)}</span>
            </div>
          ))
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No matching records
          </p>
        )}
      </div>
    </Panel>
  );
}
function App() {
  const [data, setData] = useState(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [filters, setFilters] = useState(blankFilters),
    [search, setSearch] = useState(""),
    [rankSearch, setRankSearch] = useState(""),
    [sort, setSort] = useState("order_date"),
    [desc, setDesc] = useState(true),
    [page, setPage] = useState(0),
    [order, setOrder] = useState(null),
    [interval, setInterval] = useState("month"),
    [measure, setMeasure] = useState("spend");
  const [theme, setTheme] = useState(() =>
    initialTheme(
      readTheme(),
      window.matchMedia("(prefers-color-scheme: dark)").matches,
    ),
  );
  const fileInput = useRef(null),
    imported = useRef(false),
    reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    saveTheme(theme);
  }, [theme]);
  function acceptData(next) {
    setData(next);
    setFilters({ ...blankFilters, account: next.selected_account || "" });
    setSearch("");
    setRankSearch("");
    setPage(0);
    setOrder(null);
    setError("");
  }
  useEffect(() => {
    let alive = true;
    fetch("./data/dashboard.json")
      .then((r) => {
        if (!r.ok)
          throw new Error(
            "No export found. Load a Food Khata JSON export to get started.",
          );
        return r.json();
      })
      .then(validateData)
      .then((v) => {
        if (alive && !imported.current) acceptData(v);
      })
      .catch(() => {
        if (alive && !imported.current)
          setError(
            "No valid export found. Load a Food Khata JSON export to get started.",
          );
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);
  async function loadFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const next = await readExport(file);
      imported.current = true;
      acceptData(next);
    } catch (e) {
      setError(e.message);
    } finally {
      event.target.value = "";
    }
  }
  const all = data?.orders || [],
    accounts = data?.accounts || [];
  const orders = useMemo(() => filterOrders(all, filters), [all, filters]),
    t = useMemo(() => totals(orders), [orders]);
  const update = (key, value) => {
    setFilters((old) => ({ ...old, [key]: value }));
    setPage(0);
  };
  const choices = {
    platform: [...new Set(all.map((o) => o.platform).filter(Boolean))],
    status: [...new Set(all.map((o) => o.order_status).filter(Boolean))],
    restaurant: [...new Set(all.map(restaurant))],
    location: [...new Set(all.map(location))],
    payment: [...new Set(all.map((o) => o.payment_method || "Unknown"))],
  };
  const dates = all
    .filter((o) => !filters.account || o.account_id === filters.account)
    .map((o) => o.order_date)
    .filter((d) => /^\d{4}-\d\d-\d\d$/.test(d || ""))
    .sort();
  const today = localDate(new Date()),
    start = filters.from || dates[0] || today,
    end = filters.to || today;
  const series = useMemo(
    () => timeline(orders, start, end, interval),
    [orders, start, end, interval],
  );
  const active = Object.entries(filters).filter(
    ([k, v]) => k !== "account" && v,
  ).length;
  const history = useMemo(
    () => paginate(orders, search, sort, desc, page),
    [orders, search, sort, desc, page],
  );
  const delivered = orders.filter((o) => o.order_status === "DELIVERED");
  const platforms = [...new Set(orders.map((o) => o.platform))].map((name) => {
    const rows = orders.filter((o) => o.platform === name);
    return {
      name,
      orders: rows.length,
      spend: totals(rows).spend,
      savings: rows
        .filter((o) => o.order_status === "DELIVERED")
        .reduce((n, o) => n + Number(o.total_discount || 0), 0),
    };
  });
  const fees = [
    ["Delivery", "delivery_fee"],
    ["Platform", "platform_fee"],
    ["Packaging", "packaging_fee"],
    ["Tax", "total_tax"],
    ["Tip", "tip"],
    ["Other", "other_charges"],
  ]
    .map(([name, key]) => ({
      name,
      value: delivered.reduce((n, o) => n + Number(o[key] || 0), 0),
    }))
    .filter((x) => x.value);
  const distribution = [
    { name: "< ₹200", value: 0 },
    { name: "₹200–399", value: 0 },
    { name: "₹400–599", value: 0 },
    { name: "₹600–999", value: 0 },
    { name: "₹1,000+", value: 0 },
  ];
  delivered.forEach((o) => {
    const n = Number(o.final_amount_paid || 0);
    distribution[n < 200 ? 0 : n < 400 ? 1 : n < 600 ? 2 : n < 1000 ? 3 : 4]
      .value++;
  });
  const heat = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => ({ count: 0, spend: 0 })),
  );
  orders.forEach((o) => {
    const d = new Date((o.order_date || "") + "T00:00:00"),
      h = Number((o.order_time || "").slice(0, 2));
    if (!Number.isNaN(d.getTime()) && o.order_time && h >= 0 && h < 24) {
      const cell = heat[d.getDay()][h];
      cell.count++;
      if (o.order_status === "DELIVERED")
        cell.spend += Number(o.final_amount_paid || 0);
    }
  });
  const heatMax = Math.max(1, ...heat.flat().map((c) => c.count));
  const dietMap = new Map(),
    cuisineMap = new Map();
  orders.forEach((o) =>
    o.items.forEach((i) => {
      const diet =
          i.is_veg === 1
            ? "Vegetarian"
            : i.is_veg === 0
              ? "Non-vegetarian"
              : "Unknown",
        cuisine = i.category || "Other";
      dietMap.set(diet, (dietMap.get(diet) || 0) + Number(i.quantity || 0));
      cuisineMap.set(
        cuisine,
        (cuisineMap.get(cuisine) || 0) + Number(i.quantity || 0),
      );
    }),
  );
  const diet = [...dietMap].map(([name, value]) => ({ name, value })),
    cuisines = [...cuisineMap]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  const toggleSort = (key) => {
    if (sort === key) setDesc(!desc);
    else {
      setSort(key);
      setDesc(false);
    }
    setPage(0);
  };
  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background text-foreground">
        <header className="border-b bg-card">
          <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-700 text-white">
                <Utensils size={19} />
              </div>
              <div>
                <div className="font-semibold tracking-tight">
                  food khata<span className="text-emerald-600">.</span>
                </div>
                <div className="text-xs font-semibold uppercase tracking-[.16em] text-muted-foreground">
                  Your food story
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileInput}
                type="file"
                accept="application/json,.json"
                className="sr-only"
                aria-label="Choose data file"
                onChange={loadFile}
              />
              <Button
                variant="outline"
                onClick={() => fileInput.current?.click()}
              >
                <Upload /> Load data
              </Button>
              <Button
                variant="outline"
                size="icon"
                aria-label={
                  theme === "dark"
                    ? "Switch to light theme"
                    : "Switch to dark theme"
                }
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              >
                {theme === "dark" ? <Sun /> : <Moon />}
              </Button>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-[1500px] px-5 py-8 sm:px-8 sm:py-10">
          <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow">A little perspective</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
                Your food story
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Every order, thoughtfully brought together.
              </p>
            </div>
            {data && (
              <div className="flex flex-wrap items-center gap-2">
                <div className="w-48">
                  <Choice
                    label="Customer"
                    value={filters.account}
                    onChange={(v) => update("account", v)}
                    all="All customers"
                    options={accounts.map((a) => [
                      a.id,
                      a.phone || a.local_id || a.id,
                    ])}
                  />
                </div>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline">
                      <SlidersHorizontal /> Filters{" "}
                      {active > 0 && (
                        <span className="rounded-full bg-emerald-700 px-1.5 text-xs text-white">
                          {active}
                        </span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="end"
                    className="max-h-[75vh] w-80 overflow-y-auto"
                  >
                    <div className="mb-4 flex justify-between">
                      <h3 className="font-semibold">Filter your history</h3>
                      <button
                        className="text-xs text-emerald-600"
                        onClick={() =>
                          setFilters({
                            ...blankFilters,
                            account: filters.account,
                          })
                        }
                      >
                        Clear all
                      </button>
                    </div>
                    <div className="grid min-w-0 grid-cols-1 gap-3">
                      <div className="grid grid-cols-2 gap-2">
                        <DatePicker
                          label="From"
                          value={filters.from}
                          onChange={(v) => update("from", v)}
                        />
                        <DatePicker
                          label="To"
                          value={filters.to}
                          onChange={(v) => update("to", v)}
                        />
                      </div>
                      {Object.entries(fieldLabels).map(([key, label]) => (
                        <label
                          key={key}
                          className="grid min-w-0 grid-cols-1 gap-1.5 text-xs font-medium text-muted-foreground"
                        >
                          {label}
                          <Choice
                            label={label}
                            value={filters[key]}
                            onChange={(v) => update(key, v)}
                            all={`All ${label.toLowerCase()}`}
                            options={choices[key].sort().map((v) => [v, v])}
                          />
                        </label>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            )}
          </div>
          {error && (
            <div
              role="alert"
              className="mb-5 rounded-xl border border-amber-300 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-300"
            >
              {error}
            </div>
          )}
          {loading && !data && (
            <p className="text-sm text-muted-foreground">
              Loading your dashboard…
            </p>
          )}
          {!loading && !data && (
            <Card className="p-10 text-center">
              <Upload className="mx-auto text-emerald-600" />
              <h2 className="mt-4 text-xl font-semibold">
                Bring your history to life
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Load a Food Khata JSON export to explore your orders.
              </p>
              <Button
                className="mt-5"
                onClick={() => fileInput.current?.click()}
              >
                Load data
              </Button>
            </Card>
          )}
          {data && (
            <div className="space-y-5">
              {filters.from && filters.to && filters.from > filters.to && (
                <p
                  role="alert"
                  className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-700"
                >
                  The start date must be on or before the end date.
                </p>
              )}
              <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Stat
                  title="Delivered spend"
                  value={money(t.spend)}
                  description="Sum of amounts paid for delivered orders."
                  Icon={Wallet}
                />
                <Stat
                  title="Orders"
                  value={t.count.toLocaleString()}
                  description="All matching orders, including unsuccessful orders."
                  Icon={ShoppingBag}
                />
                <Stat
                  title="Verified savings"
                  value={money(t.verified)}
                  description="Explicit discounts on financially verified delivered orders."
                  Icon={BadgePercent}
                />
                <Stat
                  title="Average order"
                  value={money(t.average)}
                  description="Delivered spend divided by delivered order count."
                  Icon={TrendingUp}
                />
              </div>
              <div className="grid min-w-0 grid-cols-1 gap-5 xl:grid-cols-3">
                <div className="min-w-0 xl:col-span-2">
                  <Panel
                    title="Your ordering rhythm"
                    description="Orders include all statuses. Spend and explicit discounts include delivered orders only. Empty periods are shown."
                    action={
                      <div className="flex gap-2">
                        <Choice
                          label="Timeline measure"
                          value={measure}
                          onChange={setMeasure}
                          all="Spend"
                          options={[
                            ["spend", "Spend"],
                            ["orders", "Orders"],
                            ["savings", "Discounts"],
                          ]}
                        />
                        <Choice
                          label="Timeline interval"
                          value={interval}
                          onChange={setInterval}
                          all="Month"
                          options={[
                            ["day", "Day"],
                            ["week", "Week"],
                            ["month", "Month"],
                            ["year", "Year"],
                          ]}
                        />
                      </div>
                    }
                  >
                    <div className="h-72 w-full pt-2">
                      {series.length ? (
                        <div className="relative h-full w-full">
                          <svg className="recharts-surface h-full w-full" viewBox="0 0 500 200" preserveAspectRatio="none">
                            <defs>
                              <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={tokenColor("--primary")} stopOpacity={0.3} />
                                <stop offset="100%" stopColor={tokenColor("--primary")} stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            {(() => {
                              const maxVal = Math.max(...series.map((s) => s[measure] || 0), 1);
                              const points = series.map((s, idx) => {
                                const x = (idx / Math.max(series.length - 1, 1)) * 480 + 10;
                                const y = 190 - ((s[measure] || 0) / maxVal) * 170;
                                return `${x},${y}`;
                              });
                              const areaPoints = `10,190 ${points.join(" ")} 490,190`;
                              return (
                                <>
                                  <polygon points={areaPoints} fill="url(#area)" />
                                  <polyline points={points.join(" ")} fill="none" stroke={tokenColor("--primary")} strokeWidth="2.5" />
                                </>
                              );
                            })()}
                          </svg>
                          <div className="flex justify-between text-[10px] text-muted-foreground pt-1">
                            <span>{series[0]?.date}</span>
                            <span>{series[Math.floor(series.length / 2)]?.date}</span>
                            <span>{series[series.length - 1]?.date}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="grid h-full place-items-center text-sm text-muted-foreground">
                          No timeline for this date range.
                        </div>
                      )}
                    </div>
                  </Panel>
                </div>
                <Panel
                  title="By platform"
                  description="Orders include all statuses; monetary measures include delivered orders only."
                >
                  <div className="recharts-surface h-72 w-full space-y-3 py-2 overflow-auto">
                    {platforms.map((p) => {
                      const val = p[measure] || 0;
                      const maxVal = Math.max(...platforms.map((x) => x[measure] || 1), 1);
                      const pct = Math.round((val / maxVal) * 100);
                      return (
                        <div key={p.name} className="space-y-1">
                          <div className="flex justify-between text-xs font-medium">
                            <span>{p.name}</span>
                            <span>{measure === "orders" ? val : money(val)}</span>
                          </div>
                          <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-primary transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Panel>
              </div>
              <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-2">
                <Panel
                  title="Fees & tax"
                  description="Recorded delivery, platform, packaging, tax, tip and other charges on delivered orders."
                >
                  <div className="flex h-60 items-center">
                    <div className="flex h-full w-1/2 items-center justify-center">
                        <svg className="recharts-surface h-40 w-40" viewBox="-20 -20 40 40">
                          {(() => {
                            const total = fees.reduce((acc, curr) => acc + (curr.value || 0), 0) || 1;
                            let cumulative = 0;
                            return fees.map((f, i) => {
                              const fraction = (f.value || 0) / total;
                              const dash = fraction * 100;
                              const offset = -cumulative * 100;
                              cumulative += fraction;
                              return (
                                <circle
                                  key={f.name}
                                  r="15.915"
                                  cx="0"
                                  cy="0"
                                  fill="transparent"
                                  stroke={paletteAt(i)}
                                  strokeWidth="6"
                                  strokeDasharray={`${dash} ${100 - dash}`}
                                  strokeDashoffset={offset}
                                />
                              );
                            });
                          })()}
                        </svg>
                      </div>
                    <div className="flex-1 space-y-2">
                      {fees.map((x, i) => (
                        <div
                          key={x.name}
                          className="flex justify-between text-xs"
                        >
                          <span className="flex items-center gap-2 text-muted-foreground">
                            <i
                              className="h-2 w-2 rounded-full"
                              style={{
                                background: paletteAt(i),
                              }}
                            />
                            {x.name}
                          </span>
                          <b>{money(x.value)}</b>
                        </div>
                      ))}
                      {!fees.length && (
                        <span className="text-sm text-muted-foreground">
                          No fees recorded
                        </span>
                      )}
                    </div>
                  </div>
                </Panel>
                <Panel
                  title="Order value"
                  description="Distribution of final paid amounts for delivered orders."
                >
                  <div className="recharts-surface flex h-60 w-full items-end justify-between gap-2 pt-6 pb-2">
                    {distribution.map((d) => {
                      const maxVal = Math.max(...distribution.map((x) => x.value || 1), 1);
                      const pct = Math.max(Math.round(((d.value || 0) / maxVal) * 100), 4);
                      return (
                        <div key={d.name} className="flex flex-1 flex-col items-center gap-2 h-full justify-end">
                          <span className="text-[10px] text-muted-foreground font-mono">{d.value}</span>
                          <div
                            className="w-full max-w-[48px] rounded-t-md bg-primary transition-all"
                            style={{ height: `${pct}%` }}
                          />
                          <span className="text-[10px] text-muted-foreground text-center truncate max-w-full">
                            {d.name}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </Panel>
              </div>
              <Panel
                title="When you order"
                description="Count includes all matching orders; spend includes delivered orders only. Hover or focus a cell for details."
              >
                <div className="overflow-x-auto">
                  <div className="min-w-[650px]">
                    <div className="mb-1 grid grid-cols-[42px_repeat(24,minmax(0,1fr))] gap-1">
                      <span />
                      {Array.from({ length: 24 }, (_, h) => (
                        <span
                          key={h}
                          className="text-center text-xs text-muted-foreground"
                        >
                          {h % 3 === 0 ? h : ""}
                        </span>
                      ))}
                    </div>
                    {heat.map((row, d) => (
                      <div
                        key={d}
                        className="mb-1 grid grid-cols-[42px_repeat(24,minmax(0,1fr))] items-center gap-1"
                      >
                        <span className="text-xs text-muted-foreground">
                          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d]}
                        </span>
                        {row.map((cell, h) => (
                          <Tooltip key={h}>
                            <TooltipTrigger asChild>
                              <button
                                aria-label={`${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d]} ${h}:00: ${cell.count} orders, ${money(cell.spend)} delivered spend`}
                                className="aspect-square rounded-sm"
                                style={{
                                  backgroundColor: cell.count
                                    ? `hsl(var(--primary) / ${0.18 + (0.82 * cell.count) / heatMax})`
                                    : "var(--surface-2)",
                                }}
                              />
                            </TooltipTrigger>
                            <TooltipContent>
                              {
                                [
                                  "Sunday",
                                  "Monday",
                                  "Tuesday",
                                  "Wednesday",
                                  "Thursday",
                                  "Friday",
                                  "Saturday",
                                ][d]
                              }{" "}
                              {String(h).padStart(2, "0")}:00 · {cell.count}{" "}
                              orders · {money(cell.spend)} delivered spend
                            </TooltipContent>
                          </Tooltip>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </Panel>
              <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-3">
                <Stat
                  title="Unverified discounts"
                  value={money(t.unverified)}
                  description="Explicit discounts on delivered orders with unverified financials."
                  Icon={BadgePercent}
                />
                <Stat
                  title="Advertised savings"
                  value={money(t.advertised)}
                  description="Savings reported by the platform; may overlap with discounts."
                  Icon={TrendingUp}
                />
                <Stat
                  title="Refunds"
                  value={money(t.refunds)}
                  description="Recorded refunds across all matching orders."
                  Icon={Wallet}
                />
              </div>
              <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-2">
                <Panel
                  title="Dietary mix"
                  description="Item quantities across all matching orders, grouped by recorded dietary classification."
                >
                  <div className="recharts-surface space-y-4 py-3">
                    <div className="flex h-5 w-full overflow-hidden rounded-full bg-muted">
                      {diet.map((item, i) => {
                        const total = diet.reduce((acc, curr) => acc + (curr.value || 0), 0) || 1;
                        const pct = ((item.value || 0) / total) * 100;
                        return (
                          <div
                            key={item.name}
                            title={`${item.name}: ${item.value}`}
                            style={{ width: `${pct}%`, backgroundColor: paletteAt(i) }}
                          />
                        );
                      })}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {diet.map((item, i) => (
                        <div key={item.name} className="flex items-center gap-2">
                          <i
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ background: paletteAt(i) }}
                          />
                          <span className="text-muted-foreground">{item.name}:</span>
                          <span className="font-semibold">{item.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </Panel>
                <Panel
                  title="Cuisine mix"
                  description="Item quantities by recorded category across all matching orders."
                >
                  <div className="max-h-56 overflow-auto">
                    {cuisines.map((c, i) => (
                      <div
                        key={c.name}
                        className="flex items-center justify-between border-b py-2.5 text-sm"
                      >
                        <span className="flex items-center gap-2">
                          <i
                            className="h-2 w-2 rounded-full"
                            style={{ background: paletteAt(i) }}
                          />
                          {c.name}
                        </span>
                        <span className="text-muted-foreground">{c.value}</span>
                      </div>
                    ))}
                  </div>
                </Panel>
              </div>
              <div className="flex flex-wrap items-end justify-between gap-4 pt-5">
                <div>
                  <p className="eyebrow">The favourites</p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                    Places & dishes
                  </h2>
                </div>
                <div className="relative w-full max-w-sm">
                  <Search
                    size={16}
                    className="absolute left-3 top-3 text-muted-foreground"
                  />
                  <Input
                    aria-label="Search places and dishes"
                    placeholder="Search places and dishes..."
                    className="pl-9"
                    value={rankSearch}
                    onChange={(e) => setRankSearch(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-2">
                <Ranking
                  title="Restaurants"
                  description="Ranked by matching order count; spend includes delivered orders only."
                  search={rankSearch}
                  items={rank(orders, "restaurants")}
                />
                <Ranking
                  title="Dishes"
                  description="Ranked by item quantity across all matching orders."
                  search={rankSearch}
                  items={rank(orders, "dishes")}
                />
              </div>
              <Panel
                title="Order history"
                description="Search all matching orders. Select a column to sort and view any receipt."
                action={
                  <div className="relative">
                    <Search
                      size={16}
                      className="absolute left-3 top-3 text-muted-foreground"
                    />
                    <Input
                      aria-label="Search orders"
                      className="pl-9"
                      placeholder="Search orders..."
                      value={search}
                      onChange={(e) => {
                        setSearch(e.target.value);
                        setPage(0);
                      }}
                    />
                  </div>
                }
              >
                <div className="overflow-x-auto">
                  <Table className="min-w-[740px]">
                    <TableHeader>
                      <TableRow>
                        {[
                          ["order_date", "Date"],
                          ["platform", "Platform"],
                          ["restaurant", "Restaurant"],
                          ["items", "Items"],
                          ["order_status", "Status"],
                          ["final_amount_paid", "Amount"],
                        ].map(([key, label]) => (
                          <TableHead key={key}>
                            {key === "items" ? (
                              label
                            ) : (
                              <button
                                onClick={() => toggleSort(key)}
                                className="hover:text-foreground"
                              >
                                {label} ↕
                              </button>
                            )}
                          </TableHead>
                        ))}
                        <TableHead>
                          <span className="sr-only">Details</span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {history.rows.map((o) => (
                        <TableRow key={o.id}>
                          <TableCell className="text-muted-foreground">
                            {o.order_date || "—"}
                          </TableCell>
                          <TableCell>{o.platform}</TableCell>
                          <TableCell className="font-medium">
                            {restaurant(o)}
                          </TableCell>
                          <TableCell className="max-w-52 truncate text-muted-foreground">
                            {o.items
                              .map((i) => `${i.quantity} × ${i.item_name}`)
                              .join(", ") || "—"}
                          </TableCell>
                          <TableCell>
                            <span className="rounded-full bg-muted px-2 py-1 text-xs">
                              {o.order_status}
                            </span>
                          </TableCell>
                          <TableCell className="font-medium">
                            {money(o.final_amount_paid)}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setOrder(o)}
                            >
                              View
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {!history.rows.length && (
                    <p className="py-12 text-center text-sm text-muted-foreground">
                      No matching orders
                    </p>
                  )}
                </div>
                <div className="mt-5 flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    Page {history.current + 1} of {history.pages} ·{" "}
                    {history.count} orders
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(history.current - 1)}
                      disabled={history.current === 0}
                    >
                      <ChevronLeft /> Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(history.current + 1)}
                      disabled={history.current >= history.pages - 1}
                    >
                      Next <ChevronRight />
                    </Button>
                  </div>
                </div>
              </Panel>
            </div>
          )}
          <footer className="mt-10 border-t pt-5 text-xs text-muted-foreground">
            Food Khata · Your data stays in your browser
          </footer>
        </main>
        <Receipt order={order} onClose={() => setOrder(null)} />
      </div>
    </TooltipProvider>
  );
}
createRoot(document.getElementById("root")).render(<App />);
