import React, { useMemo, useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  LayoutDashboard,
  ReceiptText,
  MapPin,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  Moon,
  ArrowUpRight,
  Utensils,
  ChevronLeft,
  ChevronRight,
  Search,
  Wallet,
  ShoppingBag,
  BadgePercent,
  TrendingUp,
  Info,
} from "lucide-react";
import "./style.css";
import { Button } from "./components/ui/button.tsx";
import { Card } from "./components/ui/card.tsx";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./components/ui/dialog.tsx";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "./components/ui/popover.tsx";
import {
  Tooltip as InfoTooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "./components/ui/tooltip.tsx";
import {
  money,
  restaurant,
  location,
  qualityChecks,
  filterOrders,
  totals,
  paginate,
  timeline,
  rank,
  initialTheme,
} from "./model";

const storedTheme = () => {
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
const data = JSON.parse(document.getElementById("analytics-data").textContent);
const all = data.orders || [],
  accounts = data.accounts || [];
const empty = {
  account: data.selected_account || "",
  from: "",
  to: "",
  platform: "",
  status: "",
  restaurant: "",
  location: "",
  payment: "",
  quality: "",
};
const nav = [
  ["overview", "Overview", LayoutDashboard],
  ["history", "Order history", ReceiptText],
  ["places", "Places & dishes", MapPin],
  ["quality", "Data quality", ShieldCheck],
];
const labels = {
  platform: "Platform",
  status: "Status",
  restaurant: "Restaurant",
  location: "Location",
  payment: "Payment",
  quality: "Data quality",
};
const qualityLabels = {
  unverified: "Financials unverified",
  date: "Missing date",
  address: "Missing address",
  items: "Missing items",
  incomplete: "Source incomplete",
  reconciliation: "Reconciliation unavailable or differs",
};
const colors = [
  "#10a67b",
  "#58bda0",
  "#9bd4bf",
  "#d5aa79",
  "#b8a39b",
  "#777f78",
];
const inputClass =
  "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-emerald-600";
function Field({ label, children }) {
  return (
    <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
      {label}
      {children}
    </label>
  );
}
function Select({ value, onChange, children, ...props }) {
  return (
    <select
      className={inputClass}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      {...props}
    >
      {children}
    </select>
  );
}
function Panel({ title, description, children, action }) {
  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold tracking-tight">{title}</h3>
          {description && (
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {description}
            </p>
          )}
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
          <InfoTooltip>
            <TooltipTrigger asChild>
              <button aria-label={`About ${title}`}>
                <Info size={13} />
              </button>
            </TooltipTrigger>
            <TooltipContent>{description}</TooltipContent>
          </InfoTooltip>
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
function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold">{label || payload[0]?.name}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-muted-foreground">
          {p.name}:{" "}
          <strong className="text-foreground">
            {p.name === "Orders" ? p.value : money(p.value)}
          </strong>
        </p>
      ))}
    </div>
  );
}
function OrderDetails({ order, onClose }) {
  return (
    <Dialog open={!!order} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="fixed inset-y-0 left-auto right-0 top-0 h-full w-full max-w-2xl translate-x-0 translate-y-0 overflow-y-auto rounded-none">
        <div className="pr-10">
          <p className="eyebrow">Order details</p>
          <DialogTitle className="mt-2 text-2xl font-semibold tracking-tight">
            {order?.restaurant?.name || "Order"}
          </DialogTitle>
          <DialogDescription className="mt-1 text-sm text-muted-foreground">
            {order?.platform_order_id} · {order?.order_date || "Unknown date"}
          </DialogDescription>
        </div>
        {order && (
          <div className="mt-8 space-y-7">
            {[
              [
                "Order",
                Object.fromEntries(
                  Object.entries(order).filter(
                    ([k]) => !["items", "restaurant", "address"].includes(k),
                  ),
                ),
              ],
              ["Restaurant", order.restaurant],
              ["Delivery address", order.address],
              ...(order.items || []).map((item, i) => [`Item ${i + 1}`, item]),
            ].map(([title, obj]) => (
              <section key={title}>
                <h3 className="mb-3 font-semibold">{title}</h3>
                {obj ? (
                  <dl className="grid gap-x-6 sm:grid-cols-2">
                    {Object.entries(obj).map(([key, v]) => {
                      let display = v;
                      if (key.endsWith("_json") && v) {
                        try {
                          display = JSON.stringify(JSON.parse(v), null, 2);
                        } catch {}
                      }
                      return (
                        <div
                          key={key}
                          className="min-w-0 border-b border-border py-2.5"
                        >
                          <dt className="text-xs capitalize text-muted-foreground">
                            {key.replaceAll("_", " ")}
                          </dt>
                          <dd className="mt-1 break-words text-sm">
                            {key.endsWith("_json") ? (
                              <pre className="whitespace-pre-wrap font-sans text-xs">
                                {display || "—"}
                              </pre>
                            ) : (
                              String(display ?? "—")
                            )}
                          </dd>
                        </div>
                      );
                    })}
                  </dl>
                ) : (
                  <p className="text-sm text-muted-foreground">Not recorded</p>
                )}
              </section>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
function Ranking({ title, items, search, subtitle }) {
  const shown = items.filter((x) =>
    (x.name + " " + [...x.details].join(" "))
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <Panel title={title} description={subtitle}>
      <div className="max-h-96 overflow-auto">
        {shown.length ? (
          shown.map((r, i) => (
            <div
              key={r.name}
              className="flex items-center gap-4 border-b border-border py-3 last:border-0"
            >
              <span className="w-5 text-xs font-medium text-muted-foreground">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{r.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {r.count} {title === "Dishes" ? "items" : "orders"}
                  {r.details.size ? " · " + [...r.details].join(" | ") : ""}
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
  const [tab, setTab] = useState("overview"),
    [f, setF] = useState(empty),
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
      storedTheme(),
      window.matchMedia("(prefers-color-scheme: dark)").matches,
    ),
  );
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    saveTheme(theme);
  }, [theme]);
  const orders = useMemo(() => filterOrders(all, f), [f]),
    t = useMemo(() => totals(orders), [orders]);
  const update = (key, value) => {
    setF((old) => ({ ...old, [key]: value }));
    setPage(0);
  };
  const opts = {
    platform: [...new Set(all.map((o) => o.platform).filter(Boolean))],
    status: [...new Set(all.map((o) => o.order_status).filter(Boolean))],
    restaurant: [...new Set(all.map(restaurant))],
    location: [...new Set(all.map(location))],
    payment: [...new Set(all.map((o) => o.payment_method || "Unknown"))],
  };
  const dates = all
    .filter((o) => !f.account || o.account_id === f.account)
    .map((o) => o.order_date)
    .filter((d) => /^\d{4}-\d\d-\d\d$/.test(d || ""))
    .sort();
  const now = new Date(),
    today = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
    ].join("-");
  const start = f.from || dates[0] || today,
    end = f.to || today,
    series = useMemo(
      () => timeline(orders, start, end, interval),
      [orders, start, end, interval],
    );
  const active = Object.entries(f).filter(
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
  const feeFields = [
    ["Delivery", "delivery_fee"],
    ["Platform", "platform_fee"],
    ["Packaging", "packaging_fee"],
    ["Tax", "total_tax"],
    ["Tip", "tip"],
    ["Other", "other_charges"],
  ];
  const fees = feeFields
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
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
    (name) => ({ name, orders: 0 }),
  );
  orders.forEach((o) => {
    if (
      o.order_date &&
      !Number.isNaN(new Date(o.order_date + "T00:00:00").getTime())
    )
      weekdays[new Date(o.order_date + "T00:00:00").getDay()].orders++;
  });
  const heat = Array.from({ length: 7 }, () => Array(24).fill(0));
  orders.forEach((o) => {
    const d = new Date((o.order_date || "") + "T00:00:00"),
      h = Number((o.order_time || "").slice(0, 2));
    if (!Number.isNaN(d.getTime()) && o.order_time && h >= 0 && h < 24)
      heat[d.getDay()][h]++;
  });
  const heatMax = Math.max(1, ...heat.flat());
  const dietMap = new Map(),
    cuisineMap = new Map();
  orders.forEach((o) =>
    (o.items || []).forEach((i) => {
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
  const coverage = (data.archive_imports || []).filter(
    (a) =>
      (!f.account || a.account_id === f.account) &&
      (!f.platform || a.platform === f.platform),
  );
  const qualitySource = filterOrders(all, { ...f, quality: "" });
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
      <div className="min-h-screen bg-background text-foreground lg:flex">
        <aside className="border-b border-border bg-card px-5 py-4 lg:fixed lg:inset-y-0 lg:left-0 lg:w-60 lg:border-b-0 lg:border-r lg:px-5 lg:py-7">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-700 text-white">
              <Utensils size={19} />
            </div>
            <div>
              <div className="font-semibold tracking-tight">
                food khata<span className="text-emerald-600">.</span>
              </div>
              <div className="text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground">
                Your food story
              </div>
            </div>
          </div>
          <nav
            aria-label="Dashboard sections"
            className="mt-5 flex gap-1 overflow-x-auto lg:mt-12 lg:flex-col"
          >
            {nav.map(([id, label, Icon]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                aria-current={tab === id ? "page" : undefined}
                className={
                  "flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition " +
                  (tab === id
                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground")
                }
              >
                <Icon size={17} />
                {label}
              </button>
            ))}
          </nav>
          <div className="absolute bottom-7 hidden text-xs leading-5 text-muted-foreground lg:block">
            Your history, thoughtfully
            <br />
            brought together.
          </div>
        </aside>
        <div className="min-w-0 flex-1 lg:ml-60">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card/70 px-5 py-4 backdrop-blur sm:px-8">
            <div>
              <p className="eyebrow">
                Food khata / {nav.find((n) => n[0] === tab)?.[1]}
              </p>
              <h1 className="mt-1 text-lg font-semibold tracking-tight">
                {nav.find((n) => n[0] === tab)?.[1]}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <label className="sr-only" htmlFor="account">
                Customer
              </label>
              <select
                id="account"
                className={inputClass + " max-w-44"}
                value={f.account}
                onChange={(e) => update("account", e.target.value)}
              >
                <option value="">All customers</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.phone || a.local_id || a.id}
                  </option>
                ))}
              </select>
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
                {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
              </Button>
            </div>
          </header>
          <main className="mx-auto max-w-[1500px] px-5 py-7 sm:px-8 sm:py-9">
            <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="eyebrow">
                  {tab === "overview"
                    ? "A little perspective"
                    : tab === "history"
                      ? "Every order, in one place"
                      : tab === "places"
                        ? "Your favourites"
                        : "Know your data"}
                </p>
                <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
                  {tab === "overview"
                    ? "The big picture"
                    : tab === "history"
                      ? "Your order history"
                      : tab === "places"
                        ? "Places & dishes"
                        : "Data quality"}
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {tab === "overview"
                    ? "A closer look at your food journey."
                    : tab === "history"
                      ? "Explore every order in your selected history."
                      : tab === "places"
                        ? "The places and dishes you return to."
                        : "Understand the completeness of your records."}
                </p>
              </div>
              <div className="flex gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline">
                      <SlidersHorizontal size={16} /> Filters{" "}
                      {active > 0 && (
                        <span className="rounded-full bg-emerald-700 px-1.5 text-xs text-white">
                          {active}
                        </span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="max-h-[75vh] w-80 overflow-y-auto">
                    <div className="mb-4 flex items-center justify-between">
                      <h3 className="font-semibold">Filter your history</h3>
                      <button
                        className="text-xs text-emerald-600"
                        onClick={() => setF({ ...empty, account: f.account })}
                      >
                        Clear all
                      </button>
                    </div>
                    <div className="grid gap-3">
                      <div className="grid grid-cols-2 gap-2">
                        <Field label="From">
                          <input
                            className={inputClass}
                            type="date"
                            value={f.from}
                            onChange={(e) => update("from", e.target.value)}
                          />
                        </Field>
                        <Field label="To">
                          <input
                            className={inputClass}
                            type="date"
                            value={f.to}
                            onChange={(e) => update("to", e.target.value)}
                          />
                        </Field>
                      </div>
                      {Object.entries(labels).map(([key, label]) => (
                        <Field key={key} label={label}>
                          <Select
                            value={f[key]}
                            onChange={(v) => update(key, v)}
                          >
                            <option value="">All {label.toLowerCase()}</option>
                            {key === "quality"
                              ? Object.entries(qualityLabels).map(([k, v]) => (
                                  <option key={k} value={k}>
                                    {v}
                                  </option>
                                ))
                              : opts[key].sort().map((v) => (
                                  <option key={v} value={v}>
                                    {v}
                                  </option>
                                ))}
                          </Select>
                        </Field>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            {f.from && f.to && f.from > f.to && (
              <p
                role="alert"
                className="mb-5 rounded-lg bg-amber-500/10 p-3 text-sm text-amber-700"
              >
                The start date must be on or before the end date.
              </p>
            )}
            {tab === "overview" && (
              <div className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <Stat
                    title="Delivered spend"
                    value={money(t.spend)}
                    description="Delivered orders only"
                    Icon={Wallet}
                  />
                  <Stat
                    title="Orders"
                    value={t.count.toLocaleString()}
                    description="All matching statuses"
                    Icon={ShoppingBag}
                  />
                  <Stat
                    title="Verified savings"
                    value={money(t.verified)}
                    description="On financially verified orders"
                    Icon={BadgePercent}
                  />
                  <Stat
                    title="Average order"
                    value={money(t.average)}
                    description="Delivered orders only"
                    Icon={TrendingUp}
                  />
                </div>
                <div className="grid gap-5 xl:grid-cols-3">
                  <div className="xl:col-span-2">
                    <Panel
                      title="Your ordering rhythm"
                      description="Orders include all statuses. Spend and discounts include delivered orders only."
                      action={
                        <div className="flex gap-2">
                          <Select
                            aria-label="Timeline measure"
                            value={measure}
                            onChange={setMeasure}
                          >
                            <option value="spend">Spend</option>
                            <option value="orders">Orders</option>
                            <option value="savings">Discounts</option>
                          </Select>
                          <Select
                            aria-label="Timeline interval"
                            value={interval}
                            onChange={setInterval}
                          >
                            <option value="day">Day</option>
                            <option value="week">Week</option>
                            <option value="month">Month</option>
                            <option value="year">Year</option>
                          </Select>
                        </div>
                      }
                    >
                      <div className="h-72">
                        {series.length ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={series}>
                              <defs>
                                <linearGradient
                                  id="area"
                                  x1="0"
                                  y1="0"
                                  x2="0"
                                  y2="1"
                                >
                                  <stop
                                    offset="0%"
                                    stopColor="#10a67b"
                                    stopOpacity={0.25}
                                  />
                                  <stop
                                    offset="100%"
                                    stopColor="#10a67b"
                                    stopOpacity={0}
                                  />
                                </linearGradient>
                              </defs>
                              <CartesianGrid
                                vertical={false}
                                stroke="hsl(var(--border))"
                              />
                              <XAxis
                                dataKey="date"
                                tickLine={false}
                                axisLine={false}
                                minTickGap={30}
                                tick={{ fontSize: 11, fill: "var(--muted)" }}
                              />
                              <YAxis
                                tickLine={false}
                                axisLine={false}
                                width={55}
                                tick={{ fontSize: 11, fill: "var(--muted)" }}
                              />
                              <Tooltip content={<ChartTip />} />
                              <Area
                                type="monotone"
                                dataKey={measure}
                                name={
                                  measure === "orders"
                                    ? "Orders"
                                    : measure === "savings"
                                      ? "Discounts"
                                      : "Spend"
                                }
                                stroke="#10a67b"
                                strokeWidth={2.5}
                                fill="url(#area)"
                                isAnimationActive={!reduced}
                              />
                            </AreaChart>
                          </ResponsiveContainer>
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
                    description="Selected measure across platforms"
                  >
                    <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={platforms}
                          layout="vertical"
                          margin={{ left: 5, right: 20 }}
                        >
                          <CartesianGrid
                            horizontal={false}
                            stroke="hsl(var(--border))"
                          />
                          <XAxis type="number" hide />
                          <YAxis
                            dataKey="name"
                            type="category"
                            width={80}
                            tickLine={false}
                            axisLine={false}
                            tick={{ fontSize: 11, fill: "var(--muted)" }}
                          />
                          <Tooltip
                            content={<ChartTip />}
                            cursor={{ fill: "var(--muted-bg)" }}
                          />
                          <Bar
                            dataKey={measure}
                            name={
                              measure === "orders"
                                ? "Orders"
                                : measure === "savings"
                                  ? "Discounts"
                                  : "Spend"
                            }
                            fill="#10a67b"
                            radius={[0, 5, 5, 0]}
                            isAnimationActive={!reduced}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </Panel>
                </div>
                <div className="grid gap-5 lg:grid-cols-2">
                  <Panel
                    title="Fees & tax"
                    description="Composition of delivered orders"
                  >
                    <div className="flex h-60 items-center">
                      <div className="h-full w-1/2">
                        <ResponsiveContainer>
                          <PieChart>
                            <Pie
                              data={fees}
                              dataKey="value"
                              nameKey="name"
                              innerRadius="60%"
                              outerRadius="85%"
                              paddingAngle={2}
                              isAnimationActive={!reduced}
                            >
                              {fees.map((_, i) => (
                                <Cell
                                  key={i}
                                  fill={colors[i % colors.length]}
                                />
                              ))}
                            </Pie>
                            <Tooltip content={<ChartTip />} />
                          </PieChart>
                        </ResponsiveContainer>
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
                                  background: colors[i % colors.length],
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
                    description="Distribution of delivered order totals"
                  >
                    <div className="h-60">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={distribution}>
                          <CartesianGrid
                            vertical={false}
                            stroke="hsl(var(--border))"
                          />
                          <XAxis
                            dataKey="name"
                            tickLine={false}
                            axisLine={false}
                            tick={{ fontSize: 10, fill: "var(--muted)" }}
                          />
                          <YAxis
                            allowDecimals={false}
                            width={25}
                            tickLine={false}
                            axisLine={false}
                            tick={{ fontSize: 11, fill: "var(--muted)" }}
                          />
                          <Tooltip content={<ChartTip />} />
                          <Bar
                            dataKey="value"
                            name="Orders"
                            fill="#10a67b"
                            radius={[5, 5, 0, 0]}
                            isAnimationActive={!reduced}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </Panel>
                </div>
                <Panel
                  title="Orders by weekday"
                  description="All matching orders by local order date"
                >
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={weekdays}>
                        <CartesianGrid
                          vertical={false}
                          stroke="hsl(var(--border))"
                        />
                        <XAxis
                          dataKey="name"
                          tickLine={false}
                          axisLine={false}
                          tick={{ fontSize: 11, fill: "var(--muted)" }}
                        />
                        <YAxis
                          allowDecimals={false}
                          width={25}
                          tickLine={false}
                          axisLine={false}
                          tick={{ fontSize: 11, fill: "var(--muted)" }}
                        />
                        <Tooltip content={<ChartTip />} />
                        <Bar
                          dataKey="orders"
                          name="Orders"
                          fill="#10a67b"
                          radius={[5, 5, 0, 0]}
                          isAnimationActive={!reduced}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Panel>
                <Panel
                  title="When you order"
                  description="Weekday and hour · darker cells mean more orders"
                >
                  <div className="overflow-x-auto">
                    <div className="min-w-[600px]">
                      <div className="mb-1 grid grid-cols-[42px_repeat(24,minmax(0,1fr))] gap-1">
                        <span />
                        {Array.from({ length: 24 }, (_, h) => (
                          <span
                            key={h}
                            className="text-center text-[9px] text-muted-foreground"
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
                            {
                              ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][
                                d
                              ]
                            }
                          </span>
                          {row.map((n, h) => (
                            <div
                              key={h}
                              title={`${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d]} ${h}:00 · ${n} orders`}
                              aria-label={`${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d]} ${h}:00: ${n} orders`}
                              className="aspect-square rounded-sm"
                              style={{
                                backgroundColor: n
                                  ? `rgba(16,166,123,${0.18 + (0.82 * n) / heatMax})`
                                  : "var(--muted-bg)",
                              }}
                            />
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                </Panel>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Stat
                    title="Unverified discounts"
                    value={money(t.unverified)}
                    description="Delivered · financials unverified"
                    Icon={BadgePercent}
                  />
                  <Stat
                    title="Advertised savings"
                    value={money(t.advertised)}
                    description="Reported by platform · may overlap"
                    Icon={ArrowUpRight}
                  />
                  <Stat
                    title="Refunds"
                    value={money(t.refunds)}
                    description="All matching orders"
                    Icon={Wallet}
                  />
                </div>
              </div>
            )}
            {tab === "history" && (
              <Panel
                title="All orders"
                description={`${history.count.toLocaleString()} matching orders`}
                action={
                  <div className="relative">
                    <Search
                      size={16}
                      className="absolute left-3 top-3 text-muted-foreground"
                    />
                    <input
                      aria-label="Search orders"
                      className={inputClass + " pl-9"}
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
                  <table className="w-full min-w-[740px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-border text-xs text-muted-foreground">
                        {[
                          ["order_date", "Date"],
                          ["platform", "Platform"],
                          ["restaurant", "Restaurant"],
                          ["items", "Items"],
                          ["order_status", "Status"],
                          ["final_amount_paid", "Amount"],
                        ].map(([key, label]) => (
                          <th key={key} className="pb-3 font-medium">
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
                          </th>
                        ))}
                        <th>
                          <span className="sr-only">Details</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.rows.map((o) => (
                        <tr
                          key={o.id}
                          className="border-b border-border last:border-0"
                        >
                          <td className="py-4 text-muted-foreground">
                            {o.order_date || "—"}
                          </td>
                          <td>{o.platform}</td>
                          <td className="font-medium">{restaurant(o)}</td>
                          <td className="max-w-52 truncate text-muted-foreground">
                            {(o.items || [])
                              .map((i) => `${i.quantity} × ${i.item_name}`)
                              .join(", ") || "—"}
                          </td>
                          <td>
                            <span className="rounded-full bg-muted px-2 py-1 text-xs">
                              {o.order_status}
                            </span>
                          </td>
                          <td className="font-medium">
                            {money(o.final_amount_paid)}
                          </td>
                          <td>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setOrder(o)}
                            >
                              View <ArrowUpRight size={14} />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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
                      <ChevronLeft size={14} /> Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(history.current + 1)}
                      disabled={history.current >= history.pages - 1}
                    >
                      Next <ChevronRight size={14} />
                    </Button>
                  </div>
                </div>
              </Panel>
            )}
            {tab === "places" && (
              <div className="space-y-5">
                <div className="grid gap-5 lg:grid-cols-2">
                  <Panel
                    title="Dietary mix"
                    description="Item quantities across matching orders"
                  >
                    <div className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={diet}
                            dataKey="value"
                            nameKey="name"
                            innerRadius="55%"
                            outerRadius="80%"
                            isAnimationActive={!reduced}
                            label
                          >
                            {diet.map((_, i) => (
                              <Cell key={i} fill={colors[i % colors.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value) => [value, "Items"]} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </Panel>
                  <Panel
                    title="Cuisine mix"
                    description="Item quantities by category"
                  >
                    <div className="max-h-56 overflow-auto">
                      {cuisines.map((c, i) => (
                        <div
                          key={c.name}
                          className="flex items-center justify-between border-b border-border py-2.5 text-sm"
                        >
                          <span className="flex items-center gap-2">
                            <i
                              className="h-2 w-2 rounded-full"
                              style={{ background: colors[i % colors.length] }}
                            />
                            {c.name}
                          </span>
                          <span className="text-muted-foreground">
                            {c.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </Panel>
                </div>
                <div className="relative max-w-sm">
                  <Search
                    size={16}
                    className="absolute left-3 top-3 text-muted-foreground"
                  />
                  <input
                    className={inputClass + " pl-9"}
                    aria-label="Search places and dishes"
                    placeholder="Search places and dishes..."
                    value={rankSearch}
                    onChange={(e) => setRankSearch(e.target.value)}
                  />
                </div>
                <div className="grid gap-5 lg:grid-cols-2">
                  <Ranking
                    title="Restaurants"
                    subtitle="Ranked by orders · spend from delivered orders"
                    search={rankSearch}
                    items={rank(orders, "restaurants")}
                  />
                  <Ranking
                    title="Dishes"
                    subtitle="Ranked by item quantity"
                    search={rankSearch}
                    items={rank(orders, "dishes")}
                  />
                  <Ranking
                    title="Delivery locations"
                    subtitle="Grouped labels and original address variants"
                    search={rankSearch}
                    items={rank(orders, "locations")}
                  />
                </div>
              </div>
            )}
            {tab === "quality" && (
              <div className="grid gap-5 lg:grid-cols-2">
                <Panel
                  title="Archive coverage"
                  description="What the source archives tell us"
                >
                  {coverage.length ? (
                    <div className="space-y-4">
                      <p className="text-sm">
                        {
                          coverage.filter((a) => a.history_complete === 1)
                            .length
                        }{" "}
                        of {coverage.length} archives have complete imported
                        history.
                      </p>
                      <p className="text-sm">
                        {
                          coverage.filter((a) => a.details_complete === 1)
                            .length
                        }{" "}
                        of {coverage.length} archives have complete details.
                      </p>
                      <div className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
                        {coverage.every((a) => a.lifetime_complete === 1)
                          ? "Lifetime coverage confirmed."
                          : "Lifetime coverage unconfirmed."}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Archive coverage unavailable. Lifetime coverage
                      unconfirmed.
                    </p>
                  )}
                </Panel>
                <Panel
                  title="Review records"
                  description="Select a quality issue to filter all views"
                >
                  <div>
                    {Object.entries(qualityLabels).map(([key, label]) => (
                      <button
                        key={key}
                        onClick={() =>
                          update("quality", f.quality === key ? "" : key)
                        }
                        className="flex w-full items-center justify-between border-b border-border py-3 text-left text-sm last:border-0 hover:text-emerald-600"
                      >
                        <span>{label}</span>
                        <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold">
                          {qualitySource.filter(qualityChecks[key]).length}
                        </span>
                      </button>
                    ))}
                  </div>
                </Panel>
              </div>
            )}
            <footer className="mt-10 border-t border-border pt-5 text-xs text-muted-foreground">
              Food Khata · Generated from your local database
            </footer>
          </main>
        </div>
        <OrderDetails order={order} onClose={() => setOrder(null)} />
      </div>
    </TooltipProvider>
  );
}
createRoot(document.getElementById("root")).render(<App />);
