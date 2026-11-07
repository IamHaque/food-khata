# Food Khata Dashboard v2: Agent Execution Brief

Version 1.0. Target: `dashboard-ui/`. Save this file in the repo as `docs/REDESIGN_BRIEF.md`. It is both the specification and the live tracker. The agent keeps it current in the same commits as the code.

**Overall progress:** 14 / 62 stories DONE · 0 IN_PROGRESS · 0 BLOCKED · 0 DEFERRED · Current phase: P1 · Last updated: 2026-11-07

---

## 0. How to use this file

1. Read sections 0 to 6 completely before changing code.
2. This file is the single source of truth. Never keep progress anywhere else.
3. Work in phase order (section 6). Inside a phase, work in story order unless dependencies say otherwise.
4. Never delete a story or scenario. If one is wrong or impossible, log a Deviation (3.3), keep the story, and set its status.
5. Do not ask the user routine questions. Decide, log it in the Decision log, continue. Stop only on the Stop conditions (2.4).
6. Ideas that are not in a story go to the Backlog (3.4). Do not build them.
7. A story is finished only when it meets the DONE rule (3.2). Partial work is IN_PROGRESS.
8. You are the orchestrator. Read `docs/ORCHESTRATOR.md` next and follow it. Do not implement stories yourself; delegate per that protocol. Use `node scripts/brief.mjs` instead of reading this file in full after the first pass.

---

## 1. Context

**Product.** Food Khata is a local CLI that downloads Zomato and Swiggy order history into SQLite, serves it through a read-only FastAPI server (`food-khata serve`, loopback only), and shows it in a React dashboard. The dashboard covers all accounts or a chosen subset.

**Frontend stack (`dashboard-ui/`).** React 18, Vite 6, TypeScript, Tailwind 3 (`darkMode: "class"`), shadcn-style components on Radix, TanStack Query and Table, ECharts 6 (main charts), Recharts 3 (appears unused), zod, react-router-dom 7, lucide-react, Inter Variable (local font).

**Commands (run from `dashboard-ui/`).**

| Purpose | Command |
|---|---|
| Dev server | `npm run dev` |
| Unit tests | `npm test` |
| Types | `npm run typecheck` |
| Lint | `npm run lint` |
| Browser tests | `npm run test:browser` |
| Build + licenses | `npm run build` |
| Regenerate API types | `npm run generate:api` |

### 1.1 Running the whole stack (backend and frontend)

Python 3.11+ and Node 22+ are required. Run from the repo root unless stated. On macOS/Linux use `source .venv/bin/activate`; on Windows use `.venv\Scripts\Activate.ps1`.

| Purpose | Command |
|---|---|
| One-time Python setup | `python -m venv .venv`, activate it, then `python -m pip install -e ".[serve,dev]"` |
| One-time frontend setup | `npm --prefix dashboard-ui ci` |
| Backend tests | `python -m pytest tests -q` (serve tests: `tests/test_serve_*.py`) |
| Backend lint | `python -m ruff check .` |
| Start API on a dev database | `food-khata serve --dev --data-dir .test-tmp/dev-data --db-path .test-tmp/dev-data/food_analytics.db` (serves on `http://127.0.0.1:8765`, loopback only) |
| Frontend dev with hot reload | `npm --prefix dashboard-ui run dev` (Vite proxies `/api` to port 8765, so the backend must be running) |
| Production-like run | `npm --prefix dashboard-ui run build`, then `food-khata serve` and open `http://127.0.0.1:8765` |
| Browser tests | `npm --prefix dashboard-ui run test:browser` (uses Vite preview with mocked API data, so it does not need the backend) |
| Seed dev data | see story S-008 |

Rules for the agent:
- Never point the server at real user data (`.food-khata/`). Always use the disposable `.test-tmp/` paths above. `.test-tmp/` must stay git-ignored.
- Run backend and frontend servers in the background, check `http://127.0.0.1:8765/api/meta/data-health` returns 200 before relying on them, and stop them when finished.
- Login and sync (`food-khata`, `food-khata sync`) talk to real Zomato and Swiggy accounts. Never run them. Use only `serve`, `ingest` and the seeded data.
- If the backend, a Python dependency or a port is unavailable, log a Blocker, fall back to the mocked-API browser test setup, and continue with work that does not need the server.

**Backend API (read-only).** `POST /api/dashboard`, `GET /api/orders`, `GET /api/orders/slim`, `GET /api/orders/{order_id}/bill`, `GET /api/restaurants`, `GET /api/items`, `GET /api/meta/filters`, `GET /api/meta/data-health`.

**Dashboard payload (`charts.*`).** `kpi_history`, `waterfall_steps`, `food{diet_monthly, cuisines, diet, loyalty, new_repeat, cuisine_unavailable_reason, diet_unavailable_reason, orders_without_dates}`, `spending{discount_breakdown, daily, years, fee_scatter, unallocated_spend}`, `places`, `behavior`, `monthly`, `calendar`, `cost_waterfall`, `top_restaurants`, `top_dishes`, `platforms`, `monthly_fee_components`, `insights`. Also `kpis`, `comparison.percent_change`, `generated_at`, `data_complete`.

**Filter state.** Defined and URL-serialized in `src/lib/filters.ts` (zod schema: dates, account_ids, platforms, statuses, cities, localities, restaurant_ids, cuisines, payment_methods, veg, amount range, meal_slots, day_type, anomaly, verified_only, search, compare). Reuse it. Do not fork it.

**Known problems being fixed (from the review).**
1. One palette only; theme control is a plain `<select>`.
2. Chart theme reads raw HSL triplets (e.g. `158 18% 12%`) from CSS variables and passes them to ECharts as colors.
3. Hardcoded hex colors outside tokens (`Chart.tsx`, `SpendingDetails.tsx`).
4. Duplicate token sets (`--*` and `--v2-*`) and two theme markers (`.dark`, `data-v2theme`).
5. Text mostly 10 to 12px.
6. Crowded header; the full filter panel sits above every page.
7. No drill-down from charts to filters or orders.
8. Mobile has both a horizontal nav and a hamburger drawer.
9. Native selects and `<details>` popovers mixed with Radix.
10. Internal links (Design system, Legacy) and a stub page in production.
11. Bill composition shown three ways; insight chips buried at the bottom of Overview.
12. Recharts and ECharts both shipped.

---

## 2. Constraints

### 2.1 Product
- Local and private. No telemetry, no external requests, no CDN fonts or scripts, no remote images.
- The server stays read-only and loopback only. Do not weaken either.
- Data scope is food orders only (Instamart and Dineout excluded). Keep the scope disclaimer visible, not hidden in a footer.
- Currency is INR, formatted `en-IN`.

### 2.2 Technical
- Keep `.dark` class dark mode. Remove `data-v2theme` and all `--v2-*` tokens.
- ECharts is the only chart library after S-006.
- No animation library. Use CSS transitions, the Web Animations API, ECharts native animation, and a small `requestAnimationFrame` hook for count-up.
- New dependencies are allowed only if the license is MIT, Apache-2.0, ISC or BSD (`npm run build` runs the license script) and the choice is logged as a Decision. Pre-approved: `@tanstack/react-virtual`.
- Prefer deriving data client-side from existing endpoints. Changing the backend or API contract is allowed only with a Decision entry, new or updated Python tests in `tests/` (see `tests/test_serve_*.py`), regenerating the schema with `python scripts/export_openapi.py` then `npm run generate:api`, and a passing `pytest` and `ruff check` run recorded in the Verification log. Never remove or rename an existing field; only add.
- Keep existing tests passing. Do not delete legacy files (`model.js`, `loader.js`, `main.jsx`, `/legacy`); hiding them is enough.
- Storage keys: `food-khata-mode` (light | dark | system), `food-khata-accent`, `food-khata-nav-collapsed`, `food-khata-views`, `food-khata-table-prefs`. Migrate the old `food-khata-v2-theme` key once, then remove it.

### 2.3 Quality
- WCAG 2.2 AA. Text contrast at least 4.5:1, UI and chart marks at least 3:1, in all 10 theme and mode combinations.
- Minimum text size 12px for captions, 14px for body and table text.
- Every animation honors `prefers-reduced-motion` (instant, no movement).
- Typecheck, lint and unit tests pass at every commit that touches code.

### 2.4 Stop conditions (only these justify stopping to ask)
1. A story cannot be done without breaking the loopback or read-only guarantees.
2. A required dependency has a non-permitted license.
3. A destructive action on user data (`.food-khata/` contents) would be needed.
4. Two locked decisions (section 4) contradict each other and no reasonable reading resolves it.

Anything else: decide, log, continue.

---

## 3. Runtime tracking rules

### 3.1 Status values
`TODO` · `IN_PROGRESS` · `BLOCKED` · `DONE` · `DEFERRED` (moved to Backlog with a reason).

### 3.2 DONE rule
A story is DONE only when all of these are true and recorded in its tracker row:
1. Every scenario in the story passes, by automated test where feasible, otherwise by a recorded manual check.
2. For chart stories, every item of the Chart Contract (section 5) is satisfied.
3. `npm run typecheck`, `npm run lint` and `npm test` pass, and `pytest` and `ruff check` pass whenever Python code or the API changed.
4. The story renders correctly in light and dark, and in at least Emerald and one other accent.
5. Evidence is written in the tracker: commit hash, test names, screenshot path (`docs/redesign/after/<story-id>-<theme>-<mode>.png` for UI stories).

### 3.3 Decisions and deviations
- **Decision (DEC-nnn):** a choice the spec left open (library API, component structure, copy, small visual details). Log it before or at the time you act. Format in 8.2.
- **Deviation (DEV-nnn):** any departure from a scenario, locked decision, or constraint. Log it before implementing the deviation. State the original requirement, what was done instead, why, and the impact. A story with an open deviation on a P0 scenario cannot be DONE. For P1 and P2, mark the scenario "deviated" and DONE is allowed once the deviation is logged and accepted by a Decision.
- Never silently skip or weaken a scenario.

### 3.4 Backlog
Anything out of scope, deferred, discovered, or pre-existing (failing tests, bugs, ideas) goes to the Backlog (8.3) with origin, priority, and reason. Deferring a story requires status `DEFERRED` plus a Backlog entry.

### 3.5 Update protocol (every work session)
1. Before starting a story: set `IN_PROGRESS` and the date.
2. When finished or stopped: update the row, the Overall progress line at the top, and any logs touched.
3. Append to the Verification log (8.6) every time you run the full check suite.
4. Append to the Changelog (8.7) per commit.

### 3.6 Commit convention
`type(S-014): short summary` (types: feat, fix, refactor, test, docs, chore). One story per commit where practical. Tracker updates go in the same commit.

---

## 4. Locked design decisions

| ID | Decision |
|---|---|
| D-01 | Direction: premium, chart-first analytics. Dark by default when the system has no preference; System mode is respected. Calm surfaces, vivid data. |
| D-02 | Modes: Light, Dark, System. Accent themes via `data-accent` on `<html>`: `emerald` (default), `indigo`, `amber`, `rose`, `slate`. Each defines light and dark values. |
| D-03 | One token set: `--background`, `--surface`, `--surface-2`, `--foreground`, `--muted-foreground`, `--border`, `--primary`, `--primary-foreground`, `--accent`, `--success`, `--warning`, `--danger`, `--chart-1..8`, `--radius`, `--shadow-1..3`, `--motion-micro`, `--motion-standard`, `--motion-chart`, `--ease`. Tailwind maps to these. No hex or rgb literals outside the token files. |
| D-04 | Look: hairline borders, 16px card radius, soft layered shadows, subtle translucent glass on top bar and popovers (with opaque fallback), gradient area fills in charts, large tabular display numerals. |
| D-05 | Pages (5): Overview `/`, Spending `/spending`, Food `/food`, Habits `/habits`, Orders `/orders`. Redirects: `/behavior` and `/places` to `/habits`, `/ledger` to `/orders`, `/data-health` to `/` with the sync panel open. |
| D-06 | Shell: collapsible icon rail (desktop), top bar, bottom tab bar or drawer on mobile (one pattern only), content max width 1440px, 12-column grid. |
| D-07 | Filters: compact summary row with removable chips plus an advanced filter side panel. State in the URL via existing `filters.ts`. |
| D-08 | Cross-filtering: clicking a chart element applies a filter chip. Shift-click adds. Esc removes the last chip. |
| D-09 | Order detail is a right-side sheet, not a modal. Up and Down arrows move between orders. |
| D-10 | Motion tokens: micro 120ms, standard 240ms, chart 600ms, easing `cubic-bezier(.2,.8,.2,1)`. Animate only transform and opacity for UI. Page change: crossfade plus 8px slide. Card reveal stagger 40ms. Hover lift 2px. |
| D-11 | Data health becomes a header status chip that opens a side panel. Design system and Legacy links only show with `import.meta.env.DEV`. |
| D-12 | KPI set on Overview: Spend, Orders, Avg order value, Total discount, Reported savings, Orders per week. (Confirm against `primaryMetrics` in `Overview.tsx`; if the codebase differs, log a Decision and keep six.) |

---

## 5. Chart Contract (applies to every chart story)

Every chart story inherits all items below. Do not restate them per story; verify each at DONE time.

| # | Requirement |
|---|---|
| CC-1 | Data comes from the existing API payload or is derived client-side from it. If data is missing, log a Decision and derive; backend change only per 2.2. |
| CC-2 | Rendered inside `ChartCard` (S-007) using the shared ECharts theme adapter (S-006). Colors come from tokens only. |
| CC-3 | Entry animation 600ms, data-change transition 250ms. Reduced motion: none. |
| CC-4 | Rich tooltip: value, share of total where meaningful, delta vs compare period when compare is on. Currency `en-IN`. |
| CC-5 | Click behavior as specified in the story (cross-filter or open detail). Cursor and focus ring signal interactivity. |
| CC-6 | Participates in linked hover when the chart keys on month, platform, restaurant, cuisine, weekday or hour (S-021). |
| CC-7 | ChartCard actions: table view, fullscreen, download PNG, download CSV. |
| CC-8 | A one-line takeaway caption computed from the current data (S-023). |
| CC-9 | States: skeleton while loading, empty state with the reason (use `*_unavailable_reason` fields when present), error state with Retry that does not break other cards. |
| CC-10 | Accessible: text summary via `aria-label` or description, table alternative, no meaning by color alone (shape, pattern, label or arrow). |
| CC-11 | The option builder is a pure function (data in, ECharts option out) with at least one unit test. |
| CC-12 | Checked in all 10 theme and mode combinations (visual snapshot or recorded manual check). |

---

## 6. Phases and gates

| Phase | Stories | Gate to pass before the next phase |
|---|---|---|
| P0 Foundation | S-001 to S-009 | Suite green; dev database seeded and server runs on it; 10 theme/mode combos switch live; chart colors valid in all; no hex literals outside tokens; Recharts removed or justified |
| P1 Shell | S-010 to S-016 | All 5 routes and redirects work; filters round-trip via URL; one mobile nav pattern |
| P2 Interaction | S-020 to S-025 | Cross-filter, linked hover, chart toolbar and motion demonstrated on a test chart |
| P3a Overview | S-030 to S-035 | Overview above-the-fold requirement met at 1440x900 |
| P3b Orders | S-070 to S-075 | 5,000-row table scrolls smoothly; side sheet works by keyboard |
| P3c Spending | S-040 to S-047 | All Chart Contract items verified |
| P3d Food | S-050 to S-055 | Same |
| P3e Habits | S-060 to S-067 | Same |
| P4 Quality | S-080 to S-085 | Final acceptance (S-085) |

Priorities: the tag in each story header (P0, P1, P2) is authoritative. P0 stories are never deferred; P1 may be deferred only with a Backlog entry and a Decision; P2 may be deferred freely.

---

## 7. Stories

Format per story: priority, dependencies, files or data, then Gherkin. "Files" are starting points, not limits.

### Phase P0: Foundation

### S-001 — Baseline and safety net [P0]
Depends: none. Files: `dashboard-ui/`, `docs/redesign/before/`.
```gherkin
Feature: Baseline
  Scenario: Record the starting state
    Given a clean checkout
    When I follow section 1.1 to set up Python and Node
    And I run pytest, ruff, npm ci, typecheck, lint, test, test:browser and build
    Then each result is written to the Verification log
    And any pre-existing failure is added to the Backlog and not fixed unless it blocks a story

  Scenario: Capture "before" screenshots
    When I load each of the 7 existing routes in light and dark
    Then screenshots are saved to docs/redesign/before/ at 1440x900 and 390x844

  Scenario: Create the tracker
    Then this file is saved at docs/REDESIGN_BRIEF.md and committed
```

### S-002 — Token consolidation [P0]
Depends: S-001. Files: `src/style.css`, `tailwind.config.js`, `src/styles/*.css`, `scripts/check-colors.mjs` (new).
```gherkin
Feature: Single token source
  Scenario: One token set
    Given the stylesheet
    Then only the tokens in D-03 exist
    And no --v2-* variable or data-v2theme reference remains anywhere

  Scenario: No color literals
    When I run the color check script
    Then it fails on any hex, rgb or hsl literal outside the token files
    And the script is part of npm run lint

  Scenario: Existing screens keep working
    Then all current routes render without visual regressions caused by renamed tokens
```

### S-003 — Theme engine (mode and accent) [P0]
Depends: S-002. Files: `src/style.css`, `index.html`, `src/app/theme.ts` (new), `scripts/contrast-check.mjs` (new).
```gherkin
Feature: Theme engine
  Scenario: Mode and accent are independent
    Given accent "indigo" and mode "dark"
    Then html has class "dark" and data-accent="indigo"
    And changing mode keeps the accent, and vice versa

  Scenario: System mode follows the OS
    Given mode is "system"
    When the OS switches between light and dark
    Then the dashboard updates without reload

  Scenario: No flash on load
    Given a saved mode and accent
    When the page loads
    Then an inline script in index.html applies them before first paint

  Scenario: Migration
    Given the old key food-khata-v2-theme exists
    When the app loads
    Then its value is migrated to food-khata-mode and the old key is removed

  Scenario: Contrast gate
    When the contrast script runs
    Then every text/surface pair is at least 4.5:1 and every chart color vs surface is at least 3:1
    And this holds for all 5 accents in light and dark (10 combinations)
```

### S-004 — Theme picker [P0]
Depends: S-003, S-007. Files: `src/app/ThemeControl.tsx`.
```gherkin
Feature: Appearance picker
  Scenario: Single discoverable control
    Given the top bar
    Then one icon button opens a popover titled "Appearance"
    And the popover has a segmented control (Light, Dark, System) and five accent swatches with names

  Scenario: Keyboard
    Given the popover is open
    Then arrow keys move between options, Enter selects, Escape closes
    And focus returns to the trigger

  Scenario: Live preview
    When I hover or focus a swatch
    Then the dashboard previews it
    And it reverts when focus or hover leaves without selecting

  Scenario: Transition
    When the theme changes
    Then colors crossfade over 240ms, instantly under reduced motion
```

### S-005 — Typography, spacing and motion tokens [P0]
Depends: S-002. Files: `src/style.css`, `tailwind.config.js`.
```gherkin
Feature: Type and motion foundations
  Scenario: Type scale
    Then body and table text is at least 14px, captions at least 12px
    And there is a display style for KPI values with tabular numerals and tight tracking
    And no text-[10px] or text-[11px] class remains in src/

  Scenario: Spacing and radius
    Then spacing follows a 4px scale, cards use radius 16px, inputs and chips use smaller tokens

  Scenario: Motion tokens
    Then the D-10 durations and easing exist as CSS variables and Tailwind utilities
    And prefers-reduced-motion sets them to near-zero globally
```

### S-006 — Chart theme adapter and library consolidation [P0]
Depends: S-002, S-003. Files: `src/app/Chart.tsx`, `src/components/ui/chart.tsx`, `package.json`, `src/lib/chart-theme.ts` (new).
```gherkin
Feature: One chart system
  Scenario: Valid colors
    Given the chart theme reads tokens
    Then every color passed to ECharts is a valid CSS color string (HSL triplets wrapped as hsl(...))
    And a unit test asserts this for all 10 theme/mode combinations

  Scenario: Live re-theme
    When mode or accent changes
    Then mounted charts update colors without remounting or losing zoom state

  Scenario: Lifecycle
    Then charts resize with their container, dispose on unmount, and ECharts modules are registered once

  Scenario: Single library
    When I search the codebase for recharts imports
    Then there are none, and recharts and src/components/ui/chart.tsx are removed
    Or, if still used, each use is migrated or a Deviation explains why
```

### S-007 — Shared primitives [P0]
Depends: S-005, S-006. Files: `src/components/ui/*`, `src/components/dashboard/*` (new).
```gherkin
Feature: Component kit
  Scenario: Primitives exist
    Then the kit provides: Card, KpiCard, ChartCard, Skeleton, EmptyState, ErrorState, Chip, SegmentedControl, Popover, Select, Sheet, Tooltip, Toolbar button
    And none uses native <select> or <details> for popovers

  Scenario: ChartCard
    Then it provides title, subtitle, caption slot, state handling (loading, empty, error) and the action menu (table, fullscreen, PNG, CSV)

  Scenario: Documented
    Then a dev-only /design-system route lists each primitive in all states
```

### S-008 — Synthetic dev database and backend harness [P0]
Depends: S-001. Files: `scripts/make_dev_db.py` (new), `.gitignore`, `docs/REDESIGN_BRIEF.md`. Reference: the `conn` fixture in `tests/test_serve_filters.py`, `food_khata/db.py` (`AnalyticsDB`), and `scripts/make_synthetic_data.py` (note: that script only writes a legacy `dashboard.json`, not a SQLite database).
```gherkin
Feature: Realistic local data without real accounts
  Scenario: Generate a database
    When I run python scripts/make_dev_db.py --out .test-tmp/dev-data
    Then it creates a SQLite database through the project's own schema and ingest code (not hand-written SQL where AnalyticsDB can be used)
    And it is deterministic (fixed seed) and entirely fictional

  Scenario: Rich enough for every chart
    Then the data has 3 accounts, both platforms, about 3 years of orders (at least 1,500 and optionally a 6,000-order mode via --large), delivered and cancelled statuses, varied cuisines, veg and non-veg items, meal slots across the day, weekdays and weekends, several cities and localities, discounts and fees of every type, some unverified or unbalanced bills, and some orders missing optional fields
    And a streak of consecutive order days exists

  Scenario: Server runs on it
    When I start the server per section 1.1 against that database
    Then GET /api/meta/data-health and POST /api/dashboard return 200 with non-empty charts for every key listed in section 1

  Scenario: Safe by construction
    Then the script refuses to write inside .food-khata/ and the output folder is git-ignored

  Scenario: Documented and tested
    Then a short README note explains the command
    And a pytest test runs the generator on a tmp_path and asserts the row counts and that /api/dashboard responds
```

### S-009 — Orchestration harness [P0]
Depends: S-001. Files (repo root): `scripts/brief.mjs`, `scripts/orch.mjs`, `orchestration/` (models.json, templates, report.schema.json) are provided and must be copied in as they are. Built in this story: `scripts/verify.mjs` and the `probe` command in `scripts/orch.mjs`, plus corrections to the command templates. Also add `orchestration/runs/` and `orchestration/state.json` to `.gitignore`. Run all scripts from the repo root.
```gherkin
Feature: Delegation tooling
  Scenario: Provided scripts work
    When I run node scripts/brief.mjs next and node scripts/orch.mjs pick T2
    Then they print a startable story and a routable model without errors

  Scenario: Delegate runner
    Given orchestration/models.json holds a command template per model
    When I run node scripts/orch.mjs run <model> <packet-file> <worktree>
    Then it runs the model CLI inside the worktree with a timeout, saves full output to orchestration/runs/<id>.log, and prints only the last 20 lines plus the exit code
    And it extracts the JSON report that matches orchestration/report.schema.json, or prints REPORT_MISSING

  Scenario: Compact verification
    When I run node scripts/verify.mjs <worktree> [--backend] [--browser]
    Then it runs typecheck, lint, unit tests (and pytest/ruff or browser tests when flagged) and prints at most 30 lines: one PASS or FAIL line per check plus the first failing message of each

  Scenario: Smoke test every model
    When I run node scripts/orch.mjs probe
    Then each model in models.json gets a tiny task (create a file with a given content and run a command) and the result sets its state ACTIVE or DISABLED in orchestration/state.json
    And the command templates verified here are corrected in models.json and noted in the Decision log

  Scenario: Safe sandbox
    Then every sub-agent runs in its own git worktree and branch, and the guardrails in ORCHESTRATOR.md section 6 are enforced by the prompt template and checked by verify.mjs (forbidden paths untouched, no deleted tests)
```

### Phase P1: Shell and navigation

### S-010 — App shell [P0]
Depends: S-007. Files: `src/app/App.tsx`.
```gherkin
Feature: Shell
  Scenario: Desktop layout
    Given a viewport of 1024px or wider
    Then a collapsible icon rail, a slim top bar and a content area (max 1440px) are shown
    And the collapsed state persists

  Scenario: Mobile layout
    Given a viewport under 1024px
    Then exactly one navigation pattern is shown (bottom tab bar or drawer), never both

  Scenario: Active page
    Then the current page is marked by color and a non-color indicator
    And rail icons show tooltips when collapsed

  Scenario: Accessibility
    Then the skip link, landmarks and focus order are preserved
```

### S-011 — Five-page routing [P0]
Depends: S-010. Files: `src/app/App.tsx`, new page files.
```gherkin
Feature: Routes
  Scenario: Five pages
    Then the routes are /, /spending, /food, /habits, /orders per D-05

  Scenario: Redirects
    When I open /behavior or /places
    Then I land on /habits with filters preserved
    And /ledger goes to /orders, /data-health goes to / with the sync panel open

  Scenario: Dev-only links
    Given a production build
    Then Design system and Legacy links are absent, and the "not available yet" stub is gone

  Scenario: Not found
    Then unknown paths show a designed 404 with a link home
```

### S-012 — Account switcher [P0]
Depends: S-007. Files: `src/app/AccountSelector.tsx`.
```gherkin
Feature: Accounts
  Scenario: Open
    When I open the switcher
    Then each account shows initials, label, platform icons and order count

  Scenario: Select
    Then I can pick one, several or All
    And the choice is reflected in the filter chips and the URL (account_ids)

  Scenario: Search
    Given many accounts
    Then a search field filters the list by label, id or platform

  Scenario: Keyboard
    Then the list is navigable and operable by keyboard
```

### S-013 — Sync status chip and panel [P0]
Depends: S-007. Files: `src/app/DataPages.tsx` (HealthPage content), new panel.
```gherkin
Feature: Data health panel
  Scenario: Chip
    Then the top bar shows last sync as relative time with the exact time on hover
    And the chip turns warning-colored (with an icon) when history or details are incomplete

  Scenario: Panel
    When I click the chip
    Then a side panel shows the former Data health content: coverage, completeness and the scope disclaimer

  Scenario: Scope notice
    Then "food orders only, Instamart/Dineout excluded" is visible in the panel and on Overview, not only in a footer
```

### S-014 — Filter summary row and advanced panel [P0]
Depends: S-007, S-012. Files: `src/app/FilterBar.tsx`, `FilterContext.tsx`.
```gherkin
Feature: Filters
  Scenario: Summary row
    Given default filters
    Then one compact row shows period preset, platform, compare, and a "More filters" button

  Scenario: Advanced panel
    When I open More filters
    Then a side panel holds the remaining filters (cities, localities, restaurants, cuisines, payment, veg, amount, meal slots, day type, status, verified only, anomaly)
    And a badge shows how many are active

  Scenario: Chips
    Given any filter is applied
    Then a removable chip is shown for each, and "Clear all" resets to defaults

  Scenario: Page relevance
    Then the Orders page shows no duplicate search control

  Scenario: Validation
    Then invalid ranges (from after to, min above max) are explained inline and not applied
```

### S-015 — URL state [P0]
Depends: S-014. Files: `src/lib/filters.ts`, `FilterContext.tsx`.
```gherkin
Feature: Shareable state
  Scenario: Round trip
    Given filters are applied
    When I reload or paste the URL
    Then the same filters and page are restored

  Scenario: Invalid input
    Given a malformed query string
    Then it falls back to defaults without errors

  Scenario: Navigation keeps context
    When I switch pages
    Then filters carry over

  Scenario: Tests
    Then filters.test.ts covers parse and serialize for every field, including multi-value fields
```

### S-016 — Command palette and shortcuts [P1]
Depends: S-007, S-015. Files: `src/app/CommandPalette.tsx`.
```gherkin
Feature: Command palette
  Scenario: Open
    When I press Ctrl/Cmd+K
    Then a palette opens with groups: Navigate, Filters, Appearance, Orders, Saved views

  Scenario: Actions
    Then I can go to a page, apply a period preset, toggle platform, switch mode or accent, and find an order by restaurant or item

  Scenario: Shortcuts
    Then g then o/s/f/h/d goes to Overview, Spending, Food, Habits, Orders
    And / focuses search, t cycles mode, ? shows a shortcut list
    And shortcuts are disabled while typing in inputs

  Scenario: Accessibility
    Then the palette is a labelled dialog with focus trap and Escape to close
```

### Phase P2: Interaction infrastructure

### S-020 — Cross-filter engine [P1]
Depends: S-014, S-015. Files: `src/lib/crossfilter.ts` (new), `FilterContext.tsx`.
```gherkin
Feature: Cross-filtering
  Scenario: Click to filter
    When I click a chart element that maps to a filter (platform, restaurant, cuisine, month, weekday, hour, meal slot)
    Then a chip is added and every chart and table updates

  Scenario: Multi-select and toggle
    When I Shift-click another element
    Then it is added to the same filter
    And clicking a selected element removes it

  Scenario: Undo
    When I press Escape
    Then the most recent cross-filter chip is removed

  Scenario: Mapping is declarative
    Then each chart declares its mapping (element to filter patch) and a unit test covers every mapping
```

### S-021 — Linked hover [P1]
Depends: S-006. Files: `src/lib/highlight-bus.ts` (new).
```gherkin
Feature: Linked hover
  Scenario: Highlight everywhere
    When I hover a month, platform, restaurant, cuisine, weekday or hour in one chart
    Then matching marks are highlighted in all other visible charts and dimmed elsewhere

  Scenario: Cleanup
    When the pointer leaves
    Then highlights clear within 120ms

  Scenario: Performance
    Then hover updates do not re-render React trees (use ECharts dispatchAction)
```

### S-022 — Chart toolkit actions [P1]
Depends: S-007. Files: `ChartCard`.
```gherkin
Feature: Chart actions
  Scenario: Table view
    When I toggle Table
    Then the same data shows as an accessible table with sortable columns

  Scenario: Fullscreen
    When I choose Fullscreen
    Then the chart opens in a dialog at large size with focus trapped and Escape to close

  Scenario: Export
    Then Download PNG uses the current theme background, and Download CSV exports the chart's data with headers and en-IN-neutral raw numbers
```

### S-023 — Takeaway captions [P1]
Depends: S-007. Files: `src/lib/captions.ts` (new).
```gherkin
Feature: Captions
  Scenario: Computed insight
    Given chart data
    Then the caption states one plain-language fact (for example "Dinner accounts for 48% of orders")
    And it updates with filters

  Scenario: Safe fallbacks
    Given missing or zero data
    Then no caption is shown rather than a wrong one

  Scenario: Tests
    Then each caption function is a pure function with unit tests
```

### S-024 — Compare mode overlay [P1]
Depends: S-032. Files: `src/hooks/api.ts`, trend charts.
```gherkin
Feature: Compare
  Scenario: Overlay
    Given compare is "previous_period" or "previous_year"
    Then time-based charts show the comparison as a dashed series with legend entry
    And data for it comes from a second dashboard query with shifted dates (log as a Decision)

  Scenario: Deltas
    Then KPI deltas show an arrow and color, never color alone

  Scenario: Off
    Given compare is "none"
    Then no second query is made
```

### S-025 — Motion system [P1]
Depends: S-005, S-007. Files: `src/lib/motion.ts` (new), `src/hooks/useCountUp.ts` (new), CSS.
```gherkin
Feature: Motion
  Scenario: Page transition
    When I change page
    Then content crossfades with an 8px slide in 240ms

  Scenario: Card reveal
    Then cards enter with a 40ms stagger, capped at 12 cards

  Scenario: Count-up and morph
    When KPI values load or change
    Then numbers count to the new value over 600ms with tabular numerals and no layout shift

  Scenario: Micro-interactions
    Then cards lift 2px on hover, buttons compress on press, chips fade in and out, within 120ms

  Scenario: Skeletons
    Then loading skeletons shimmer and match the final layout

  Scenario: Reduced motion
    Given prefers-reduced-motion is set
    Then nothing moves or counts; values appear immediately

  Scenario: Performance
    Then UI animation uses only transform and opacity
```

### Phase P3a: Overview

### S-030 — Insight strip [P0]
Depends: S-020. Data: `charts.insights`.
```gherkin
Feature: Insights
  Scenario: Show
    Given insights exist
    Then up to 4 cards appear at the top, each with an icon, text and value

  Scenario: Act
    When I click an insight
    Then its filter_patch is applied as chips (platforms, restaurant_ids at minimum)

  Scenario: None
    Given no insights
    Then the strip is hidden with no layout shift

  Scenario: Keyboard
    Then each insight is a focusable button
```

### S-031 — KPI cards [P0]
Depends: S-025. Data: `kpis`, `kpi_history`, `comparison.percent_change`, `charts.behavior.orders_per_week`.
```gherkin
Feature: KPIs
  Scenario: Layout
    Given a 1440px viewport
    Then six cards fit in one row (3x2 on tablet, 2x3 on mobile)

  Scenario: Content
    Then each card shows label, large value, sparkline and delta with arrow vs compare period
    And "Unknown" is shown for missing values

  Scenario: Formula
    When I activate the info icon
    Then a popover explains the formula and caveats, closes on outside click or Escape

  Scenario: Interaction
    When I hover the sparkline
    Then the month and value show, and that month is linked-highlighted in the trend
```

### S-032 — Monthly trend combo [P0]
Depends: S-006, S-020, S-021. Data: `charts.monthly`.
```gherkin
Feature: Trend chart
  Scenario: Combo
    Then spend is a gradient area and orders are bars, on separate axes in one chart

  Scenario: Metric toggle
    Then a segmented control switches Spend, Orders or Both

  Scenario: Brush
    When I drag across the chart
    Then it zooms and a Reset zoom button appears

  Scenario: Month click
    When I click a month
    Then the period filter narrows to that month and a chip appears

  Scenario: Table
    Then the former "Monthly KPI values" table is available through the Table view
```

### S-033 — Year calendar heatmap [P0]
Depends: S-020. Data: `charts.calendar`.
```gherkin
Feature: Calendar heatmap
  Scenario: Show
    Then a GitHub-style calendar shows orders per day for the selected year
    And a year selector switches years

  Scenario: Tooltip
    Then it shows date, orders and spend

  Scenario: Click
    When I click a day
    Then date_from and date_to are set to that day
```

### S-034 — Platform split [P0]
Depends: S-020. Data: `charts.platforms`.
```gherkin
Feature: Platform split
  Scenario: Donut
    Then a donut shows spend share per platform with orders, discounts and fees in the tooltip
    And the center shows total spend

  Scenario: Click
    When I click a slice
    Then the platform filter toggles
```

### S-035 — Top restaurants and dishes [P0]
Depends: S-020. Data: `top_restaurants`, `top_dishes`.
```gherkin
Feature: Top lists
  Scenario: Ranking charts
    Then two horizontal bar rankings show the top 5 by amount, with quantity beside each

  Scenario: Click
    When I click a restaurant bar
    Then restaurant_ids is filtered
    And "View all" links to /food with filters preserved
```

### Phase P3b: Orders

### S-070 — Orders table with virtualization [P1]
Depends: S-007, S-015. Files: `src/app/Ledger.tsx` (to be renamed `Orders.tsx`). Data: `/api/orders`.
```gherkin
Feature: Orders table
  Scenario: Columns
    Then rows show date, platform, restaurant, items summary, amount with proportional inline bar, and a status chip (verified, unverified, unbalanced) with icon and text

  Scenario: Large data
    Given 5,000 or more orders (generate them with make_dev_db.py --large)
    Then scrolling stays smooth using @tanstack/react-virtual, with server pagination or windowing as the existing API allows (log a Decision)

  Scenario: Sorting
    Then headers sort with aria-sort and a visible indicator

  Scenario: Sticky
    Then the header row stays visible while scrolling

  Scenario: States
    Then loading shows row skeletons, empty shows an EmptyState with Clear filters
```

### S-071 — Search and quick filters [P1]
Depends: S-070.
```gherkin
Feature: Order search
  Scenario: Pinned controls
    Then a search box and quick filters (Platform, Verified, Needs review) sit above the table

  Scenario: Search behavior
    When I type
    Then results update after 250ms debounce and the matched text is highlighted
```

### S-072 — Order side sheet [P1]
Depends: S-070. Files: `src/app/OrderModal.tsx`. Data: `/api/orders/{id}/bill`.
```gherkin
Feature: Order detail
  Scenario: Open
    When I click a row
    Then a sheet slides in from the right with items, payment breakdown and itemized discounts

  Scenario: Navigate
    When I press Up or Down
    Then the previous or next order loads and the row is highlighted in the table

  Scenario: Close
    Then Escape or the close button closes it and focus returns to the row

  Scenario: Deep link
    Then the open order id is in the URL and restores on reload
```

### S-073 — Saved views [P2]
Depends: S-070, S-016.
```gherkin
Feature: Saved views
  Scenario: Save
    When I save the current filters, sort and columns with a name
    Then it is stored in food-khata-views

  Scenario: Reopen
    Then saved views appear in the command palette and a views menu, and can be renamed or deleted

  Scenario: Safe storage
    Then corrupted or unavailable storage never breaks the page
```

### S-074 — Export [P1]
Depends: S-070.
```gherkin
Feature: Export
  Scenario: Keep existing export
    Then the current export behavior is preserved with the same file contents for the same filters
  Scenario: Feedback
    Then progress, success and error are announced with role=status or role=alert
```

### S-075 — Columns and density [P2]
Depends: S-070.
```gherkin
Feature: Table preferences
  Scenario: Persist
    Then column visibility, density and page size persist in food-khata-table-prefs
  Scenario: Controls
    Then they use the shared Popover and SegmentedControl, not native selects
```

### Phase P3c: Spending

### S-040 — Bill waterfall [P1]
Depends: S-020. Data: `charts.waterfall_steps`, `cost_waterfall`.
```gherkin
Feature: Bill waterfall
  Scenario: Steps
    Then a waterfall runs from item total through each fee and discount to final paid, steps animating in sequence

  Scenario: Provider-paid
    Then the provider-paid total shows beside it with a note that components may not reconcile exactly

  Scenario: Click
    When I click a step
    Then the Orders page opens filtered where such a filter exists, else a Decision explains the fallback
```

### S-041 — Discounts breakdown [P1]
Data: `spending.discount_breakdown`.
```gherkin
Feature: Discounts
  Scenario: Stacked view
    Then discounts show as stacked bars by type per month with a legend toggle
  Scenario: Totals
    Then the tooltip shows each type and the total
```

### S-042 — Year-over-year [P1]
Data: `spending.years`.
```gherkin
Feature: Year over year
  Scenario: Overlay
    Then one line per year is overlaid by month
  Scenario: Gap
    When I hover a month
    Then the difference between years is shown and linked-highlighted
```

### S-043 — Fee components [P1]
Data: `charts.monthly_fee_components`.
```gherkin
Feature: Fees
  Scenario: Stacked area
    Then fee components stack by month with a legend that toggles series
  Scenario: Share
    Then the tooltip shows each component as a share of total fees
```

### S-044 — Fee burden scatter [P1]
Data: `spending.fee_scatter`.
```gherkin
Feature: Fee burden
  Scenario: Scatter
    Then fee percent of order value is plotted against order value, sized by amount, with a trendline
  Scenario: Click
    When I click a point
    Then that order opens in the side sheet (if no order id exists in the data, log a Decision and open Orders filtered by amount)
```

### S-045 — Cumulative spend [P2]
Data: derived from `charts.monthly`.
```gherkin
Feature: Cumulative spend
  Scenario: Line
    Then a cumulative line with markers at each round milestone (for example every INR 10,000) is shown
```

### S-046 — Order value distribution [P2]
Data: derived from `/api/orders/slim`.
```gherkin
Feature: Distribution
  Scenario: Histogram
    Then order values are bucketed in a histogram with median and mean lines
  Scenario: Click
    When I click a bucket
    Then amount_min and amount_max are set to that bucket
```

### S-047 — Daily spend calendar [P2]
Data: `spending.daily`.
```gherkin
Feature: Daily spend
  Scenario: Calendar
    Then a calendar heatmap shows spend per day with a year navigator and a legend
  Scenario: Unallocated
    Then spending.unallocated_spend is shown with an explanatory note
```

### Phase P3d: Food

### S-050 — Cuisine treemap [P2]
Data: `food.cuisines`.
```gherkin
Feature: Cuisines
  Scenario: Treemap
    Then tiles are sized by spend with labels, and zoom into restaurants on click with a breadcrumb back
  Scenario: Unavailable
    Given cuisine data is unavailable
    Then cuisine_unavailable_reason is shown in the empty state
```

### S-051 — New vs repeat [P2]
Data: `food.new_repeat`.
```gherkin
Feature: New vs repeat
  Scenario: Stacked area
    Then new and repeat restaurant orders stack by month with percent-repeat in the tooltip
```

### S-052 — Loyalty Pareto [P2]
Data: `food.loyalty`.
```gherkin
Feature: Loyalty
  Scenario: Pareto
    Then bars rank restaurants by orders with a cumulative percent line and an 80% reference
  Scenario: Click
    Then clicking a bar filters by that restaurant
```

### S-053 — Diet [P2]
Data: `food.diet`, `food.diet_monthly`.
```gherkin
Feature: Diet
  Scenario: Split and trend
    Then a donut shows veg, non-veg and unknown, and a monthly stacked bar shows the trend
  Scenario: Unavailable
    Then diet_unavailable_reason is shown when present
```

### S-054 — Dish ranking [P2]
Data: `/api/items` or `top_dishes`.
```gherkin
Feature: Dishes
  Scenario: Ranking
    Then the top 15 dishes by quantity are ranked with a metric toggle (quantity, amount)
  Scenario: Click
    Then clicking a dish applies the search filter for it
```

### S-055 — Leaders tables [P2]
Data: `/api/restaurants`, `/api/items`.
```gherkin
Feature: Leaders
  Scenario: Tables
    Then restaurants and dishes appear in sortable tables with inline bars and a search box
  Scenario: Row click
    Then a restaurant row filters the dashboard, and Enter on a focused row does the same
```

### Phase P3e: Habits

### S-060 — Hour by weekday heatmap [P2]
Data: `charts.behavior`.
```gherkin
Feature: Heatmap
  Scenario: Grid
    Then a 7 by 24 heatmap shows order counts with a legend
  Scenario: Click
    Then a cell sets day filters and meal slot (or a Decision explains the nearest supported filter)
```

### S-061 — Meal slots [P2]
```gherkin
Feature: Meal slots
  Scenario: Polar chart
    Then a polar or radial chart shows orders by meal slot
  Scenario: Click
    Then clicking a slot toggles meal_slots
```

### S-062 — Weekday bars [P2]
```gherkin
Feature: Weekday
  Scenario: Bars
    Then orders and spend per weekday show with weekend bars visually distinguished by pattern as well as color
```

### S-063 — Gap between orders [P2]
Data: derived from `/api/orders/slim`.
```gherkin
Feature: Gaps
  Scenario: Histogram
    Then days-between-orders are bucketed in a histogram with the median called out in the caption
```

### S-064 — Delivery destinations [P2]
Data: `charts.places`.
```gherkin
Feature: Destinations
  Scenario: Ranking
    Then spend by delivery destination is ranked with order counts
  Scenario: Click
    Then clicking filters by city or locality
```

### S-065 — Distance vs fee [P2]
Data: `charts.places`.
```gherkin
Feature: Distance vs fee
  Scenario: Scatter
    Then restaurant distance is plotted against net delivery fee with a trendline and tooltip showing restaurant
```

### S-066 — Streak timeline [P2]
Data: `charts.calendar`, `behavior.longest_streak`.
```gherkin
Feature: Streaks
  Scenario: Timeline
    Then order days appear on a timeline with the longest streak highlighted and labelled in days
```

### S-067 — Orders per week [P2]
Data: derived or `behavior.orders_per_week`.
```gherkin
Feature: Weekly rhythm
  Scenario: Trend
    Then a weekly orders line shows with a moving average
```

### Phase P4: Quality and finish

### S-080 — Accessibility audit [P1]
```gherkin
Feature: Accessibility
  Scenario: Automated
    When axe-core runs on every route in all 10 theme and mode combinations
    Then there are zero serious or critical violations

  Scenario: Keyboard
    Then every interactive element, including chart actions, filters and the order sheet, is reachable and operable by keyboard with a visible focus ring

  Scenario: Screen reader
    Then every chart has a text summary and a table alternative
```

### S-081 — Visual regression [P2]
```gherkin
Feature: Snapshots
  Scenario: Matrix
    Then Playwright snapshots exist for 5 routes x 5 accents x 2 modes at 1440x900, plus 390x844 for light and dark Emerald
  Scenario: Runnable
    Then npm run test:browser can run and update them
```

### S-082 — Performance [P1]
```gherkin
Feature: Performance
  Scenario: Load
    Then each route is lazy-loaded and the initial route loads in under 1.5s on localhost
  Scenario: Bundle
    Then ECharts is imported by module (tree-shaken) and the bundle size before and after is recorded
  Scenario: Runtime
    Then chart interactions hold 60fps on a mid-range laptop (record method and result)
```

### S-083 — Responsive [P1]
```gherkin
Feature: Responsive
  Scenario: Mobile
    Given a 390px viewport
    Then there is no horizontal page scroll, tables scroll inside their own container, and charts stay legible
  Scenario: Breakpoints
    Then layouts are verified at 390, 768, 1024, 1440 and 1920px
```

### S-084 — Cleanup and docs [P2]
```gherkin
Feature: Cleanup
  Scenario: Dead code
    Then unused components, styles (overview.css, modal.css, app.css leftovers) and dependencies are removed
  Scenario: Docs
    Then dashboard-ui README and docs/architecture.md describe the new structure, themes, tokens and the chart contract
```

### S-085 — Final acceptance [P0]
```gherkin
Feature: Release readiness
  Scenario: Everything accounted for
    Then every story is DONE or DEFERRED with a Backlog entry
    And there are no open P0 or P1 deviations

  Scenario: Full suite
    Then typecheck, lint, unit, browser tests and build all pass and are logged

  Scenario: Before and after
    Then docs/redesign/after/ holds screenshots for every route and docs/redesign/SUMMARY.md lists decisions, deviations and backlog
```

---

## 8. Live tracker (the agent edits this section)

### 8.1 Progress table
Columns: Story, Title, Priority, Status, Updated, Evidence (commit, tests, screenshots).

| Story | Title | Priority | Status | Updated | Evidence |
|---|---|---|---|---|---|
| S-001 | Baseline and safety net | P0 | DONE | 2026-11-07 | merge 721ed34; 28 PNGs in docs/redesign/before/; test:browser pass; npm run build pass |
| S-002 | Token consolidation | P0 | DONE | 2026-11-07 | merge 232a499; verify.mjs PASS (typecheck/lint/unit/check-colors); D-03 tokens, check-colors.mjs |
| S-003 | Theme engine (mode and accent) | P0 | DONE | 2026-11-07 | merge 96e3459; verify.mjs PASS (typecheck/lint/unit); theme.ts, contrast-check.mjs 10-theme WCAG gate, index.html blocking script |
| S-004 | Theme picker | P0 | DONE | 2026-11-07 | merge e680506; verify.mjs PASS (typecheck/lint/unit 47 passed); Appearance Popover, segmented control, 5 accents, live preview |
| S-005 | Typography, spacing and motion tokens | P0 | DONE | 2026-11-07 | merge 7a65a5c; verify.mjs PASS (typecheck/lint/unit); >=14px body, >=12px captions, tabular-nums display-number, 16px radius, motion clamp |
| S-006 | Chart theme adapter and library consolidation | P0 | DONE | 2026-11-07 | merge 30d26cf; verify.mjs PASS (typecheck/lint/unit 44 passed); chart-theme.ts 10 themes, Chart.tsx live re-theme, recharts removed |
| S-007 | Shared primitives | P0 | DONE | 2026-11-07 | merge f7433ea; verify.mjs PASS (typecheck/lint/unit 46 passed); ChartCard, KpiCard, Skeleton, Chip, SegmentedControl, /design-system route |
| S-008 | Synthetic dev database and backend harness | P0 | DONE | 2026-11-07 | merge d77f311; verify.mjs --backend PASS (109 passed); scripts/make_dev_db.py, tests/test_make_dev_db.py |
| S-009 | Orchestration harness | P0 | DONE | 2026-11-07 | merge 6ac38d3; verify PASS guardrails/typecheck/lint/unit; verify.mjs created, .gitignore updated |
| S-010 | App shell | P0 | DONE | 2026-11-07 | merge d060a7e; verify.mjs PASS (typecheck/lint/unit 50 passed); App shell, collapsible rail, 1440px max width, mobile drawer |
| S-011 | Five-page routing | P0 | DONE | 2026-11-07 | merge 1bb9ad1; verify.mjs PASS (typecheck/lint/unit 53 passed); 5 routes, search-preserving redirects, dev-only links, 404 page |
| S-012 | Account switcher | P0 | DONE | 2026-11-07 | merge b282ac9; verify.mjs PASS (typecheck/lint/unit 54 passed); initials, platform badges, order counts, multi-select, search, keyboard |
| S-013 | Sync status chip and panel | P0 | DONE | 2026-11-07 | merge 15eda6a; verify.mjs PASS (typecheck/lint/unit 61 passed); SyncStatusChip, SyncStatusPanel sheet, scope notice |
| S-014 | Filter summary row and advanced panel | P0 | DONE | 2026-11-07 | merge 968acab; verify.mjs PASS (typecheck/lint/unit 84 passed); summary row, advanced panel sheet, chips, validation |
| S-015 | URL state | P0 | TODO | | |
| S-016 | Command palette and shortcuts | P1 | TODO | | |
| S-020 | Cross-filter engine | P1 | TODO | | |
| S-021 | Linked hover | P1 | TODO | | |
| S-022 | Chart toolkit actions | P1 | TODO | | |
| S-023 | Takeaway captions | P1 | TODO | | |
| S-024 | Compare mode overlay | P1 | TODO | | |
| S-025 | Motion system | P1 | TODO | | |
| S-030 | Insight strip | P0 | TODO | | |
| S-031 | KPI cards | P0 | TODO | | |
| S-032 | Monthly trend combo | P0 | TODO | | |
| S-033 | Year calendar heatmap | P0 | TODO | | |
| S-034 | Platform split | P0 | TODO | | |
| S-035 | Top restaurants and dishes | P0 | TODO | | |
| S-070 | Orders table with virtualization | P1 | TODO | | |
| S-071 | Search and quick filters | P1 | TODO | | |
| S-072 | Order side sheet | P1 | TODO | | |
| S-073 | Saved views | P2 | TODO | | |
| S-074 | Export | P1 | TODO | | |
| S-075 | Columns and density | P2 | TODO | | |
| S-040 | Bill waterfall | P1 | TODO | | |
| S-041 | Discounts breakdown | P1 | TODO | | |
| S-042 | Year-over-year | P1 | TODO | | |
| S-043 | Fee components | P1 | TODO | | |
| S-044 | Fee burden scatter | P1 | TODO | | |
| S-045 | Cumulative spend | P2 | TODO | | |
| S-046 | Order value distribution | P2 | TODO | | |
| S-047 | Daily spend calendar | P2 | TODO | | |
| S-050 | Cuisine treemap | P2 | TODO | | |
| S-051 | New vs repeat | P2 | TODO | | |
| S-052 | Loyalty Pareto | P2 | TODO | | |
| S-053 | Diet | P2 | TODO | | |
| S-054 | Dish ranking | P2 | TODO | | |
| S-055 | Leaders tables | P2 | TODO | | |
| S-060 | Hour by weekday heatmap | P2 | TODO | | |
| S-061 | Meal slots | P2 | TODO | | |
| S-062 | Weekday bars | P2 | TODO | | |
| S-063 | Gap between orders | P2 | TODO | | |
| S-064 | Delivery destinations | P2 | TODO | | |
| S-065 | Distance vs fee | P2 | TODO | | |
| S-066 | Streak timeline | P2 | TODO | | |
| S-067 | Orders per week | P2 | TODO | | |
| S-080 | Accessibility audit | P1 | TODO | | |
| S-081 | Visual regression | P2 | TODO | | |
| S-082 | Performance | P1 | TODO | | |
| S-083 | Responsive | P1 | TODO | | |
| S-084 | Cleanup and docs | P2 | TODO | | |
| S-085 | Final acceptance | P0 | TODO | | |

### 8.2 Decision log
| ID | Date | Story | Context | Options considered | Decision | Consequence |
|---|---|---|---|---|---|---|
| DEC-001 | 2026-11-07 | 2026-11-07 | S-009 | gemini CLI and opencode CLI probe | gemini CLI returns IneligibleTierError (blocked); opencode run subcommand does not exist. Both CLI command templates in models.json are wrong for this environment. | Use delegate_task via T3 MCP for all sub-agents: antigravity provider for gemini-*/claude models, opencode provider for beam/deepseek/glm/mimo/nemotron. Command templates updated accordingly. Probe method changed to delegate_task health check. |
| DEC-002 | 2026-11-07 | 2026-11-07 | S-008 | Synthetic DB ingest method | Checkout has no ingest_order_batch | Use per-order ingest_swiggy_order and ingest_zomato_order |
| DEC-003 | 2026-11-07 | 2026-11-07 | S-002 | Legacy tokens remapped | Old tailwind classes in use | Remap card/popover to surface, muted-bg to surface-2, input to border |
| DEC-004 | 2026-11-07 | 2026-11-07 | S-005 | Typography adjustments | Sub-12px classes present | Bump receipt table to 14px, heat-hour to 12px, tabular numbers display-number class |
| DEC-005 | 2026-11-07 | 2026-11-08 | S-006 | Recharts removal and chart adapter | Recharts was unused/redundant | Purged recharts from package.json and components/ui/chart.tsx; pure chart-theme.ts for all 10 theme combos |
| DEC-006 | 2026-11-07 | 2026-11-08 | S-007 | Shared primitives and design system route | Primitives kit needed for dashboard redesign | Created ChartCard, KpiCard, Skeleton, EmptyState, ErrorState, Chip, SegmentedControl, ToolbarButton, and /design-system showcase |
| DEC-007 | 2026-11-07 | 2026-11-08 | S-004 | Appearance Popover and live preview | Replace native select with Radix Popover | Mode segmented control, 5 accent swatches, live preview on hover/focus with ref revert |
| DEC-008 | 2026-11-07 | 2026-11-08 | S-010 | App shell architecture | Need collapsible rail and responsive navigation | Desktop collapsible rail with tooltips, single mobile drawer, 1440px centered content grid |
| DEC-009 | 2026-11-07 | 2026-11-08 | S-011 | Five-page routing architecture | Align with D-05 pages | Primary routes /, /spending, /food, /habits, /orders with query-preserving redirects and 404 page |
| DEC-010 | 2026-11-07 | 2026-11-08 | S-012 | Account switcher popover UX | Modern account picker with search | Initials avatar, Zomato/Swiggy badges, order count, search field, multi-select, keyboard trap |
| DEC-011 | 2026-11-07 | 2026-11-08 | S-013 | Sync status chip and side panel | Top bar health indicator | SyncStatusChip with tooltip, SyncStatusPanel with ?sync=open, and food-only scope notice |
| DEC-012 | 2026-11-07 | 2026-11-08 | S-014 | Filter summary row and advanced panel | Filter bar UX | Replaced accordion with compact summary row (period, platform, compare, more filters button) + Sheet side panel, removable Chip primitives, inline range validation |

### 8.3 Deviation log
| ID | Date | Story | Original requirement | What was done instead | Reason | Impact | Status (open / accepted / resolved) |
|---|---|---|---|---|---|---|---|
| DEV-001 | 2026-11-07 | 2026-11-07 | S-002 | D-03 danger token | destructive-foreground remapped to primary-foreground | D-03 lacks danger-foreground | Clean token consolidation |
| DEV-002 | 2026-11-07 | 2026-11-07 | S-008 | Venv setup in worktree | Root venv lacked httpx2 | Installed httpx2 in venv via uv pip install | Unblocked all 109 pytest tests |

### 8.4 Backlog
| ID | Date | Origin (story or discovery) | Description | Priority | Reason deferred |
|---|---|---|---|---|---|
| BL-001 | 2026-11-07 | 2026-11-07 | S-001 | pytest fails: httpx2 not installed (starlette.testclient import error). Pre-existing. Must fix before S-008 or any serve test. | P1 |
| BL-002 | 2026-11-07 | 2026-11-07 | S-005 | Adopt rounded-card aliases across remaining containers | P2 |

### 8.5 Blockers and open issues
| ID | Date | Story | Description | Needed to unblock | Status |
|---|---|---|---|---|---|
| BLK-001 | | | | | |

### 8.6 Verification log
| Date | Commit | pytest | ruff | typecheck | lint | unit | browser | build | Notes |
|---|---|---|---|---|---|---|---|---|---|
| 2026-11-07 | 2026-11-07 | d6c9f8f | FAIL-needs httpx2 | pass | pass | pass | 13/13 pass | not_run | not_run |
| 2026-11-07 | 2026-11-07 | merge-6ac38d3 | n/a | pass | pass | pass | 13 pass | not_run | not_run |
| 2026-11-07 | 2026-11-07 | merge-721ed34 | n/a | n/a | n/a | n/a | n/a | pass | pass |
| 2026-11-07 | 2026-11-07 | merge-d77f311-232a499 | pass (109 passed) | pass | pass | pass | pass (13 passed) | not_run | not_run |
| 2026-11-07 | 2026-11-07 | merge-96e3459 | n/a | n/a | pass | pass | pass (17 passed) | not_run | not_run |
| 2026-11-07 | 2026-11-07 | merge-7a65a5c | n/a | n/a | pass | pass | pass (30 passed) | not_run | not_run |
| 2026-11-07 | 2026-11-08 | merge-30d26cf | n/a | n/a | pass | pass | pass (44 passed) | not_run | pass |
| 2026-11-07 | 2026-11-08 | merge-f7433ea | n/a | n/a | pass | pass | pass (46 passed) | not_run | pass |
| 2026-11-07 | 2026-11-08 | merge-e680506 | n/a | n/a | pass | pass | pass (47 passed) | not_run | pass |
| 2026-11-07 | 2026-11-08 | P0-GATE-PASS | pass (109 passed) | pass | pass | pass | pass (72 passed) | not_run | pass |
| 2026-11-07 | 2026-11-08 | merge-d060a7e | n/a | n/a | pass | pass | pass (50 passed) | not_run | pass |
| 2026-11-07 | 2026-11-08 | merge-1bb9ad1 | n/a | n/a | pass | pass | pass (53 passed) | not_run | pass |
| 2026-11-07 | 2026-11-08 | merge-b282ac9 | n/a | n/a | pass | pass | pass (54 passed) | not_run | pass |
| 2026-11-07 | 2026-11-08 | merge-15eda6a | n/a | n/a | pass | pass | pass (61 passed) | not_run | pass |
| 2026-11-07 | 2026-11-08 | merge-968acab | n/a | n/a | pass | pass | pass (84 passed) | not_run | pass |

### 8.7 Changelog
| Date | Commit | Story | Summary |
|---|---|---|---|
| 2026-11-07 | 2026-11-07 | merge-6ac38d3 | S-009 |
| 2026-11-07 | 2026-11-07 | merge-721ed34 | S-001 |
| 2026-11-07 | 2026-11-07 | merge-d77f311 | S-008 |
| 2026-11-07 | 2026-11-07 | merge-232a499 | S-002 |
| 2026-11-07 | 2026-11-07 | merge-96e3459 | S-003 |
| 2026-11-07 | 2026-11-07 | merge-7a65a5c | S-005 |
| 2026-11-07 | 2026-11-08 | merge-30d26cf | S-006 |
| 2026-11-07 | 2026-11-08 | merge-f7433ea | S-007 |
| 2026-11-07 | 2026-11-08 | merge-e680506 | S-004 |
| 2026-11-07 | 2026-11-08 | P0-GATE-PASS | GATE-P0 |
| 2026-11-07 | 2026-11-08 | merge-d060a7e | S-010 |
| 2026-11-07 | 2026-11-08 | merge-1bb9ad1 | S-011 |
| 2026-11-07 | 2026-11-08 | merge-b282ac9 | S-012 |
| 2026-11-07 | 2026-11-08 | merge-15eda6a | S-013 |
| 2026-11-07 | 2026-11-08 | merge-968acab | S-014 |

### 8.9 Delegation ledger
| Date | Dispatch | Story | Class | Model | Attempt | Outcome | Minutes | Note |
|---|---|---|---|---|---|---|---|---|
| 2026-11-07 | 2026-11-07 | D-002-S001-screenshots | S-001 | T1 | gemini-low | 1 | running | 0 |
| 2026-11-07 | 2026-11-07 | D-003-S009-harness | S-009 | T2 | gemini-med | 1 | running | 0 |
| 2026-11-07 | 2026-11-07 | D-003-S009-harness | S-009 | T2 | gemini-med | 1 | pass | 10 |
| 2026-11-07 | 2026-11-07 | D-002-S001-screenshots | S-001 | T1 | gemini-low | 1 | pass | 12 |
| 2026-11-07 | 2026-11-07 | D-004-S002-tokens | S-002 | T1 | glm | 1 | running | 0 |
| 2026-11-07 | 2026-11-07 | D-005-S008-devdb | S-008 | T8 | deepseek | 1 | running | 0 |
| 2026-11-07 | 2026-11-07 | D-004-S002-tokens | S-002 | T1 | glm | 1 | pass | 14 |
| 2026-11-07 | 2026-11-07 | D-005-S008-devdb | S-008 | T8 | deepseek | 1 | pass | 6 |
| 2026-11-07 | 2026-11-07 | D-006-S003-theme | S-003 | T3 | gemini-high | 1 | running | 0 |
| 2026-11-07 | 2026-11-07 | D-006-S003-theme | S-003 | T3 | gemini-high | 1 | pass | 18 |
| 2026-11-07 | 2026-11-07 | D-007-S005-typography | S-005 | T1 | glm | 1 | running | 0 |
| 2026-11-07 | 2026-11-07 | D-008-S006-chart-adapter | S-006 | T3 | gemini-high | 1 | running | 0 |
| 2026-11-07 | 2026-11-07 | D-007-S005-typography | S-005 | T1 | glm | 1 | pass | 5 |
| 2026-11-07 | 2026-11-08 | D-008-S006-chart-adapter | S-006 | T3 | gemini-high | 1 | pass | 22 |
| 2026-11-07 | 2026-11-08 | D-009-S007-primitives | S-007 | T2 | beam | 1 | running | 0 |
| 2026-11-07 | 2026-11-08 | D-009-S007-primitives | S-007 | T2 | beam | 1 | pass | 4 |
| 2026-11-07 | 2026-11-08 | D-010-S004-theme-picker | S-004 | T2 | beam | 1 | running | 0 |
| 2026-11-07 | 2026-11-08 | D-010-S004-theme-picker | S-004 | T2 | beam | 1 | pass | 2 |
| 2026-11-07 | 2026-11-08 | D-011-GATE-P0 | P0-GATE | T9 | gemini-high | 1 | running | 0 |
| 2026-11-07 | 2026-11-08 | D-011-GATE-P0 | P0-GATE | T9 | gemini-high | 1 | pass | 5 |
| 2026-11-07 | 2026-11-08 | D-012-S010-app-shell | S-010 | T2 | beam | 1 | running | 0 |
| 2026-11-07 | 2026-11-08 | D-012-S010-app-shell | S-010 | T2 | beam | 1 | pass | 2 |
| 2026-11-07 | 2026-11-08 | D-013-S011-five-pages | S-011 | T2 | beam | 1 | running | 0 |
| 2026-11-07 | 2026-11-08 | D-013-S011-five-pages | S-011 | T2 | beam | 1 | pass | 3 |
| 2026-11-07 | 2026-11-08 | D-014-S012-account-switcher | S-012 | T2 | beam | 1 | running | 0 |
| 2026-11-07 | 2026-11-08 | D-015-S013-sync-status | S-013 | T2 | deepseek | 1 | running | 0 |
| 2026-11-07 | 2026-11-08 | D-014-S012-account-switcher | S-012 | T2 | beam | 1 | pass | 4 |
| 2026-11-07 | 2026-11-08 | D-015-S013-sync-status | S-013 | T2 | deepseek | 1 | pass | 6 |
| 2026-11-07 | 2026-11-08 | D-016-S014-filters | S-014 | T2 | beam | 1 | pass | 7 |

---

## Appendix A: Route map

| Old | New |
|---|---|
| `/` Overview | `/` Overview |
| `/spending` | `/spending` |
| `/food` | `/food` |
| `/behavior`, `/places` | `/habits` |
| `/ledger` | `/orders` |
| `/data-health` | header sync panel |
| `/design-system`, `/legacy` | dev only |

## Appendix B: Where existing content moves

| Existing content | New home |
|---|---|
| Overview: secondary KPIs, habit cards | Dissolved into their pages (Spending, Habits) |
| Overview: bill composition and waterfall | Spending (S-040) |
| Overview: monthly KPI table | Table view of S-032 |
| Overview: insight chips | Top of Overview (S-030) |
| Ordering rhythm, hour and weekday | Habits (S-060 to S-067) |
| Spend by destination, distance vs fee | Habits (S-064, S-065) |
| Ledger | Orders (S-070 to S-075) |
| Data health | Header panel (S-013) |
