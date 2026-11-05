> BRIEF_BROWNFIELD.md overrides this file. This is an existing project; do not scaffold or rebuild. Use this file for the design system, filter spec, metrics, endpoints, and Definition of Done. Ignore its greenfield sequencing (Phase 0 first, fresh Vite scaffold, Makefile, side sheet).

# Food Khata: technical brief (architecture, filters, metrics, design system)

Treat every assumption here as unverified until confirmed against the real data. Where reality contradicts this brief, follow reality and log it in `docs/DECISIONS.md`.

## 1. Product goal

A premium-feeling, single-user dashboard that answers: **"Where does my food-delivery money go, and what are my habits?"** Global filtering updates every KPI and chart. A sortable, paginated order ledger with a reconstructed bill view. A data-health view. Think BI dashboard with consumer-product polish.

## 2. Architecture: hybrid (FastAPI aggregates + small client-side slice)

```
SQLite (read-only)
   -> FastAPI: SQL aggregation, filtering, business rules, pagination
        -> JSON over localhost
             -> React (Vite + TS): TanStack Query cache, URL-synced filters, ECharts, shadcn/ui
```

**Server is the source of truth for:** all KPIs and aggregated chart datasets (filtered by the global filter object), the order ledger (server-side sort, filter, pagination), the single-order bill, filter option metadata, and data-health stats.

**Client-side for snappy interactions only:** on load, fetch one compact `GET /api/orders/slim` payload (minimal order rows; column-oriented arrays if helpful) for the calendar heatmap, hover cross-highlighting and quick previews. **Do not duplicate business logic in JS.** Any number shown in a KPI card or chart comes from the server. If the slim payload exceeds ~2 MB on real data, fall back to server-only for those charts and report it.

TanStack Query: filter object in the query key, placeholder/previous data (no layout jumping), request cancellation on rapid changes.

## 3. Data profile checklist (aggregates only, no PII)

- Row counts per table; min/max `order_date`; number of accounts and platforms.
- Exact formats of `order_date`, `order_time`, `order_timestamp` (ISO? timezone? rows failing `strftime`?).
- Distinct values and counts of `order_status`, `platform`, `payment_method` (case/spelling variants).
- NULL rates: `is_veg`, `order_items.category`, `restaurants.cuisine`, `restaurants.locality/city`, `delivery_addresses.latitude/longitude`, `user_rating`, `payment_method`, `discount_breakdown_json`, `source_bill_json`.
- Whether `reconciliation_difference` and `financial_verified` are populated; distribution of non-zero differences.
- Duplicates on `(account_id, platform, platform_order_id)`.
- Same restaurant under multiple ids (normalized name + locality; cross-platform splits).
- Structure and keys of `discount_breakdown_json` and `source_bill_json` (redacted).
- Whether `final_amount_paid ~ item_subtotal - total_discount + fees + tax + tip + other_charges - refund` holds, and which orders break it.
- Contents of `archive_imports` flags.
- Money units (rupees vs paise) and currency.
- Propose, don't apply: indexes, constraints, views.

## 4. Backend requirements

**Stack:** Python 3.11+ (must also run on 3.14), FastAPI, Pydantic v2, stdlib `sqlite3` (or SQLAlchemy Core if already used). pandas/Polars only where SQL is awkward (streaks, gaps, forecasting, rolling windows).

**Connection:** read-only URI, `PRAGMA query_only = ON`, busy timeout. Small pool or one connection per request; dict row factory.

**Single filter object** shared by every endpoint:

```
date_from, date_to            ISO dates
account_ids[]
platforms[]
statuses[]                    default: delivered/completed only (use the real value)
cities[], localities[], restaurant_ids[], cuisines[]
veg: all | veg | nonveg | unknown
payment_methods[]
amount_min, amount_max
meal_slots[]                  breakfast / lunch / snack / dinner / late_night (hour ranges in one constants file)
day_type                      all | weekday | weekend
verified_only                 bool (financial_verified = 1)
search                        free text over restaurant name and item name
compare                       none | previous_period | previous_year
```

- **One** `build_where(filters) -> (sql_fragment, params)`. Always parameterized; never concatenate user input. Whitelist sort columns and directions.
- Filters touching `order_items` (item search, veg by item, category) use `EXISTS (...)` subqueries so order-level sums are **never double-counted by joins**. Comment this explicitly in code.
- Define each business rule in exactly one place (views or a metrics module), documented in `docs/METRICS.md` and unit-tested:
  - Spend = `SUM(final_amount_paid)` over valid (delivered) orders. Cancelled/failed excluded from spend by default but visible in cancellation/refund views.
  - Fees = delivery_fee - delivery_fee_discount + packaging_fee + platform_fee (confirm on real data).
  - Savings: advertised (`reported_savings`) and explicit bill discounts (`total_discount`) are distinct and never merged.
  - AOV = spend / valid order count. Savings rate = savings / (spend + savings).
  - Fee % of spend, tax, tips, refunds, unique restaurants, unique dishes, avg rating (ignore NULL).
  - Division by zero returns `null`, never NaN/Infinity.
- Round money at the SQL or response boundary; no float dust in JSON.
- Normalize restaurant identity (normalized name + locality) as `restaurant_key`; offer "per platform listing" and "merged" modes if the data shows a real split.

**Endpoints (adjust to codebase conventions):**

```
GET  /api/meta/filters         distinct platforms, statuses, cities, cuisines, payment methods, date bounds, amount bounds, accounts (account-scoped)
GET  /api/meta/data-health     archive_imports completeness, % verified, null rates, duplicates, reconciliation anomalies
POST /api/dashboard            filter object in -> { kpis, charts, filters_applied, generated_at, data_complete }
GET  /api/orders               ledger: filters + sort + page + page_size (max 200) -> { rows, total, page, page_size, filtered_total_amount }
GET  /api/orders/{id}/bill     items, subtotal, itemized discounts, fees, tax, tip, refund, final, reconciliation status
GET  /api/restaurants          leaderboard with min_orders (HAVING), sort, pagination
GET  /api/items                dish leaderboard with min_qty (HAVING), price trend
GET  /api/orders/slim          compact array for client-side use
```

**Response conventions:** Pydantic models for everything. Chart-ready shapes (e.g. `[{month:"2025-03", food:..., delivery:...}]`) so React does zero business math. Aggregate responses include `{ filters_applied, generated_at }`. Empty results return empty arrays. Error shape `{ error: { code, message } }`.

**Caching:** in-memory, keyed by hash(filter object) + DB file mtime (and `-wal` mtime). Auto-invalidate when the DB changes.

**Performance:** log queries over 150 ms in dev; run `EXPLAIN QUERY PLAN` on the heavy ones; propose composite indexes (e.g. `(account_id, order_status, order_date)`, `delivery_address_id`, restaurant `city/cuisine`) in a proposal file, not applied.

**Tests (pytest):** synthetic fixture built from the schema, never real data. Cover `build_where` combinations, no join double-counting, status default, division by zero, rounding, HAVING thresholds, pagination bounds, injection attempts in sort/search, and KPI == sum of chart series where they must reconcile.

## 5. Frontend stack

- Vite + React + TypeScript (strict), Tailwind with design tokens as CSS variables, shadcn/ui (Button, Card, Tabs, Select, Popover, Command, Sheet/Dialog, Tooltip, Dropdown Menu, Badge, Skeleton, Switch, Slider, Calendar/date-range, Table, Sonner, Separator, ScrollArea).
- TanStack Query, TanStack Table (server-side sort/pagination), React Router.
- Apache ECharts (calendar heatmap, hour x weekday heatmap, treemap, waterfall, dual-axis, morph transitions).
- Framer Motion (`motion`), lucide-react, URL-synced filter state (nuqs or custom hook), zod validation of API responses.
- TypeScript types generated from the FastAPI OpenAPI schema (`openapi-typescript`) with an npm script to regenerate.
- Font: Inter via `@fontsource` (no CDN), `tabular-nums` for all numbers.
- ESLint + Prettier, `tsc --noEmit` clean, no unjustified `any`.

## 6. Pages

Persistent shell: collapsible left sidebar (icon-only on tablet, bottom nav or drawer on mobile); top bar with account selector, global filter bar, theme toggle, data freshness indicator.

1. **Overview:** KPI cards, monthly spend (bars) + order count (line, secondary axis), cost waterfall, top 5 restaurants, top 5 dishes, insights strip.
2. **Spending:** cumulative spend, rolling 30-day, year-over-year overlay, calendar heatmap, stacked fee components per month, fee-% vs order-size scatter, discount breakdown by type, platform comparison.
3. **Food and restaurants:** restaurant leaderboard (min-orders HAVING control), dish leaderboard (min-qty control), cuisine treemap/donut, veg/non-veg/unknown trend, new vs repeat restaurants, loyalty scatter, price-creep line per dish.
4. **Behavior:** hour x weekday heatmap, meal-slot distribution, weekday vs weekend, AOV histogram, days-between-orders distribution, streak and longest-gap.
5. **Places:** privacy-safe view of delivery addresses (scatter or bars by label; use a map only with a privacy-acceptable tile source, otherwise ask), spend by address label, restaurant distance vs delivery fee.
6. **Ledger:** see the orchestrator prompt stories.
7. **Data health:** completeness, % verified, null rates, duplicates, reconciliation anomalies, unverified orders.

Only build charts the real data supports. If a field is >80% NULL, drop or replace that chart and report it.

## 7. Filters and KPIs

**Filter bar:** sticky under the top bar. Date range presets (7d, 30d, 90d, this month, last month, this FY, YTD, all time, custom); multi-select comboboxes (platform, restaurant, city, cuisine, payment method, status); veg segmented control; amount range slider (debounced 250 ms); meal-slot chips; weekday/weekend toggle; verified-only switch; search; compare toggle. Active filters render as removable chips with Clear all and a count badge. Filters live in the URL. Saved presets in `localStorage`.

**KPI cards** (label, large tabular value, delta vs comparison period with semantic color, sparkline, formula tooltip): Total spent, Orders, AOV, Total saved (labeled advertised vs discounts), Savings rate, Fees paid, Fees % of spend, Tax, Tips, Refunds, Unique restaurants, Unique dishes, Avg rating, Orders/week, Streak/longest gap.

**Insights strip:** 3 to 5 rule-based insights computed on the backend, each with a number and a link that applies the relevant filter. Suppress when sample size is too small.

## 8. Design system and visual quality bar

Target: elegant and premium (Linear / Vercel / Stripe polish): calm, dense-but-airy, restrained color.

**Theming:** light, dark, system; persisted; theme class applied before first paint. 150-200 ms color transition (off under reduced motion). All colors are semantic CSS-variable tokens (`--background`, `--surface`, `--surface-elevated`, `--border`, `--muted-foreground`, `--primary`, `--success`, `--warning`, `--danger`, `--chart-1..8`). No hard-coded hex in components. Per-theme, colorblind-safe chart palettes distinguishable by more than hue.

**Contrast (hard):** WCAG AA in both themes: 4.5:1 body, 3:1 large text/UI/borders/focus rings. Muted text must pass on its actual background. Verify with an automated token-pair check or axe/Lighthouse. Chart axes, grid, legends and tooltips legible in both themes. Never use opacity for text color. Minimum 12 px text, 14 px body.

**Surfaces and layering (hard):**

- Every card, panel, popover, dropdown, tooltip, modal, sticky header and sticky table header has a fully opaque background from a surface token. No see-through panels. Default to no glass.
- One z-index scale (base < sticky < dropdown < modal < tooltip < toast). Dropdowns, tooltips and popovers render in portals so `overflow: hidden` never clips them.
- `min-w-0` / `overflow-hidden` where needed; long names truncate with ellipsis plus a full-text tooltip.
- Charts live in fixed-height or fixed-aspect containers, resize via `ResizeObserver`, never overflow; legends wrap or scroll.
- Test long strings, very large numbers (Rs 12,34,567.89), tiny viewports, and zero/one-row datasets.

**Layout:** 12-column responsive grid, 4/8 px spacing, 12 px card radius, 8 px control radius, 1 px borders with soft elevation. Mobile (<640): filters in a bottom sheet, KPI cards in a horizontal scroller or 2-col grid, tables scroll inside their own container, never the page. `en-IN` number formatting with the Rs symbol (configurable in one settings file); compact notation on cards with exact value in a tooltip.

**Motion and micro-interactions:** durations 120-250 ms, ease-out entrances, spring for modals; one shared motion config. KPI count-up on load and change. Staggered card fade-up (max ~300 ms total). Quick cross-fade page transitions. Charts animate once and morph between datasets. Skeletons match final layout (zero layout shift). Hover lift on cards, row highlight in tables, series emphasis in charts. Button press scale 0.98. Focus-visible rings everywhere; full keyboard navigation; Esc closes overlays; `Cmd/Ctrl+K` command palette (jump to page, apply preset, toggle theme). Sonner toasts for copy/export/preset actions. Tooltips for KPI formulas, truncated text, icon-only buttons (with `aria-label`) and charts (title, swatch + label + value, % of total), always inside the viewport. Respect `prefers-reduced-motion`.

**States on every data component:** loading (skeleton), empty ("No orders match these filters" + Clear filters + hint about the most restrictive filter), error (friendly message, retry, collapsed detail), partial-data banner (only for `history_complete` or `details_complete` false).

**Accessibility:** semantic landmarks, ordered headings, chart `aria-label`s with a text summary or a "view as table" toggle, color never the only signal, accessible table markup, touch targets >= 40 px.

## 9. Project structure (adapt to what exists)

```
backend  (inside the existing Python package)
  serve layer: main, db, filters, metrics, schemas, routers, services, cache
  sql/{views.sql, proposed_indexes.sql}
  tests/{fixtures/, test_filters.py, test_metrics.py, test_api.py}
dashboard-ui/src/{app, pages, components/{ui,charts,kpi,filters,ledger}, hooks, lib/{api,format,motion,theme}, styles, types/api.d.ts}
docs/{DATA_PROFILE.md, METRICS.md, DECISIONS.md, MIGRATION_PLAN.md, REMOVALS.md}
```

## 10. Definition of done

- [ ] Data profile delivered; wrong assumptions corrected
- [ ] DB opened read-only; no writes; DB and exports git-ignored
- [ ] Every KPI and chart responds to every global filter; KPI totals == chart series sums (tested)
- [ ] No join double-counting with item-level filters (tested)
- [ ] Default status rule applied consistently; cancelled orders handled explicitly
- [ ] Ledger sorts and paginates server-side; order modal reconciles and flags mismatches
- [ ] Light and dark pass the automated contrast check; no flash of wrong theme
- [ ] No transparent panels, overlaps, clipped dropdowns/tooltips, or horizontal page scroll at 360, 768, 1280, 1920 px (screenshots from synthetic data)
- [ ] Skeleton, empty, error and partial states everywhere; zero layout shift
- [ ] Reduced motion respected; keyboard-only walkthrough works; axe reports no serious violations
- [ ] `tsc`, ESLint, pytest, ruff all pass; typed API client generated from OpenAPI
- [ ] README, `docs/architecture.md` and METRICS.md updated
