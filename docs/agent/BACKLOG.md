# Backlog

Unless listed below, stories: status `todo`; owner `pending`; commit `pending`.

## Revised epics
 (replace the seed epics in the orchestrator prompt)

- **E-1 Baseline and audit:** BASE-01 baselines (tests, screenshots, a11y), BASE-02 audit + MIGRATION_PLAN.md, BASE-03 gitignore + commit guard
- **E0 Data profile:** DATA-01, DATA-02 (as before)
- **E1 Serve layer:** CLI-01, FILT-01, MET-01, MET-02, API-01, plus CI-01 (add pytest/ruff for the new subpackage; keep 3.11 + 3.14 matrix green)
- **E2 Frontend foundation:** UI-01 tokens/theming audit, UI-02 shell + router, UI-03 filter bar + URL sync, UI-04 design-system page, UI-05 typed API client
- **E3 Account scope:** ACCT-01..03
- **E4 Parity gate:** MIG-01
- **E5 Ledger + order modal:** LEDGER-01..04
- **E6 Overview, then the remaining pages**
- **E7 Polish:** motion, a11y, responsive, stress tests
- **E8 Cleanup:** CLEAN-01 remove legacy page and Recharts, CLEAN-02 deprecate/remove `export` + `public/data` loading (approval required), CLEAN-03 docs/README/architecture update


## Required account and ledger stories (source text)


**ACCT-01: Account selector in the top bar**

```gherkin
Feature: Account scope
  Background: the database has accounts A and B with different orders

  Scenario: Default shows all accounts
    Given I open the dashboard for the first time
    Then the account selector reads "All accounts"
    And every KPI equals the sum over accounts A and B

  Scenario: Selecting one account recalculates everything
    When I choose account A in the selector
    Then every KPI, chart, leaderboard, and ledger row reflects only account A
    And the filter option lists (restaurants, cities, platforms) contain only values that exist for account A
    And the URL contains the selected account id

  Scenario: Scope survives reload and sharing
    Given account A is selected
    When I reload the page or open the URL in a new tab
    Then account A is still selected

  Scenario: Other filters are preserved where still valid
    Given I filtered by restaurant R which exists only for account B
    When I switch to account A
    Then restaurant filter R is dropped, a toast tells me what was removed, and all other filters remain

  Scenario: Single account database
    Given the database has exactly one account
    Then the selector is replaced by a static account label
```

Rules: the selector sits in the top bar **left of or above the filter bar**, is always visible, and is a searchable dropdown listing "All accounts" plus each account. **Phone numbers are PII: display masked (e.g. `••••1234`) plus `local_id`/platform counts**, never the full number. Each option shows order count and date range. Scope is implemented as the `account_ids` filter in the shared `build_where`; it is not a separate code path. `/api/meta/filters` and `/api/meta/data-health` are account-scoped. The "partial data" banner uses `archive_imports` for the selected scope only.

**ACCT-02:** account scope appears in the ledger (an Account column is shown only when "All accounts" is selected) and in CSV export.
**ACCT-03:** the "compare" mode and savings/fee insights respect the account scope.

**LEDGER-01: Full order history table**

```gherkin
Feature: Order ledger
  Scenario: Table lists the entire history for the current scope
    When I open the Ledger page with no filters
    Then I see every order in the current account scope, newest first, paginated server-side
    And a footer shows "Showing 1-50 of N" plus the sum of final amounts for ALL N filtered orders (not only the visible page)

  Scenario: Sorting
    When I click a sortable header (date, restaurant, platform, status, discount, fees, amount)
    Then the server returns rows sorted by that column with a stable tiebreaker (order id)
    And the active sort shows an arrow and aria-sort is set

  Scenario: Filtering
    When I apply global filters, column filters (status, platform, amount range), or text search on restaurant/item name
    Then the table, the footer total, and all other page data update together
    And active filters show as removable chips

  Scenario: Page size and navigation
    Then I can choose 25/50/100/200 rows per page and the page resets to 1 on any filter change

  Scenario: Empty result
    Given filters match nothing
    Then I see "No orders match these filters" with a Clear filters button and a hint of the most restrictive filter

  Scenario: Export
    When I click Export CSV
    Then I get a CSV of all filtered rows (not just the page), generated locally
```

Table requirements: sticky opaque header, column visibility menu, density toggle, right-aligned tabular-nums amounts, restaurant and items-summary truncation with tooltips, status/platform badges with icon + text, a verified indicator, and a row hover/focus highlight. Rows are keyboard-focusable (Enter opens the modal).

**LEDGER-02: Order detail modal**

```gherkin
Feature: Order detail modal
  Scenario: Opening an order
    When I click a row or press Enter on it
    Then a centered modal opens above the table with a focus trap, scroll lock on the page, and Esc / backdrop click / close button to dismiss
    And the URL gains ?order=<id> so it can be shared or reloaded

  Scenario: What was ordered
    Then the modal lists each item with name, veg/non-veg marker, quantity, unit price, line total, and category when known

  Scenario: Price breakdown
    Then the modal shows a bill ladder:
      item subtotal, itemized discounts (parsed from discount_breakdown_json when available), delivery fee minus delivery discount, packaging fee, platform fee, taxes, tip, other charges, refund, and FINAL PAID
    And a reconciliation badge reads "Matches" or "Off by Rs X" with a tooltip explaining the formula

  Scenario: Order context
    Then the header shows restaurant, platform, status, timestamp, account label (masked), delivery address label and city, payment method, and the rating given if any
    And optional sections (rating, address, discount breakdown) are hidden when no data exists, not shown as blanks

  Scenario: Navigating between orders
    When I press the Next/Previous buttons or the arrow keys
    Then the modal shows the next/previous order in the CURRENT filtered and sorted list, loading the adjacent page if needed

  Scenario: Loading and error
    Then the modal shows a skeleton matching its final layout while loading, and an error state with Retry if the request fails

  Scenario: Raw source data
    Then a collapsed "Raw bill data" section shows source_bill_json pretty-printed, closed by default
```

Modal requirements: opaque panel from a surface token, max height with the **body scrolling inside the modal**, sticky header/footer inside it, full-screen on mobile (<640 px), spring-in animation (reduced-motion: opacity only), long names truncate with a tooltip, and no content overlapping at 360 px width. This replaces the "side sheet" from BRIEF.md.

**LEDGER-03:** the anomaly one-click filter (unverified or non-reconciling orders) in the ledger.
**LEDGER-04:** Playwright end-to-end: switch account -> filter -> sort -> open the modal -> navigate next -> close with Esc -> URL and state restore.


## New stories (source text)


```gherkin
Story CLI-01: `food-khata serve`
  Scenario: Starts locally
    When I run `food-khata serve`
    Then the API listens on 127.0.0.1:8765 and prints the URL
    And it opens the DB read-only and never writes to it

  Scenario: Refuses remote binding
    When I run `food-khata serve --host 0.0.0.0`
    Then it exits with an error explaining that only loopback is allowed

  Scenario: Missing optional dependencies
    Given the "serve" extra is not installed
    Then the command prints the exact pip install command and exits 1

  Scenario: Sync while serving
    Given `serve` is running and I run `food-khata sync` in another terminal
    Then API requests keep working (retry on busy) and results refresh after ingest finishes

  Scenario: Windows paths
    Given a DB path with spaces or a drive letter
    Then the read-only open still works

Story MIG-01: Parity gate
  Scenario: Headline numbers match
    Given the old export path and the new API on the same DB
    Then each headline metric matches within INR 0.01 or has a logged, explained difference

Story CLEAN-02: Retire the JSON export path
  Scenario: Approved removal only
    Given I have approved REMOVALS.md
    Then the Load-data flow, public/data loading, and the deprecated export command are removed in separate commits
    And README.md, docs/architecture.md, and CI no longer mention them
    And all tests pass
```



## Current status
| Story | Status | Owner | Commit / evidence |
| --- | --- | --- | --- |
| BASE-03 | done | Terra Low + root | 72dcc0b; root guard verification |
| BASE-01 | done | Terra Low + root | 4b83f33; root-verified 8 states and browser suite; defects recorded |
| BASE-02 | done | root + Terra Medium review | 4b83f33; final MIGRATION_PLAN approval checkpoint |
| DATA-01 | done | Terra Medium + root | 4b83f33; DATA_PROFILE/privacy tests root verified |

## Remaining story scenarios (technical BRIEF sections 2–10)
All stories below are todo, owner pending, commit pending. Required source ACCT/LEDGER/new-story text above remains authoritative.

### E-1: baseline and audit
BASE-01 — As the owner I want a reproducible baseline so migration regressions are visible.
Scenario: Given the existing app and approved synthetic export, when baseline suites and both-theme screenshots/axe run at 360/768/1280/1920, then results and pre-existing failures are recorded without changing the app.
BASE-02 — As the owner I want an audit so I can approve an incremental migration.
Scenario: Given the code/schema/profile/baselines, when the audit finishes, then MIGRATION_PLAN lists inventories, treatments, dependencies, risks, ordered story IDs and evidence, and work stops for approval.
BASE-03 — As the owner I want a guard so private data cannot enter Git.
Scenario: Given staged or tracked forbidden paths, when guard runs, then it fails; synthetic allowed code passes.

### E0: data profile
DATA-01 — As the owner I want aggregate-only profiling so assumptions are checked without exposing PII.
Scenario: Given the source DB opened read-only, when profiling runs, then BRIEF section 3 counts/formats/status/NULL/duplicate/reconciliation/JSON distributions and units are documented without identities or payloads.
DATA-02 — As the owner I want proposed SQL so performance changes are reviewable.
Scenario: Given profile and query plans, when indexes/views are proposed, then SQL is written for approval and never applied to source DB.

### E1: serve layer
FILT-01 — As a user I want consistent filtering so every view has the same scope.
Scenario: Given BRIEF section 4 filter object, when any endpoint filters, then one parameterized build_where applies account/date/platform/status/geography/restaurant/cuisine/veg/payment/amount/meal/day/verified/search scope and item filters use EXISTS.
Scenario: Given no explicit status, when requesting default metrics, then actual delivered status is used consistently; injection inputs cannot alter SQL.
MET-01 — As a user I want documented financial rules so totals are understandable.
Scenario: Given synthetic bills, when metrics run, then spend/AOV/fees/tax/tips/refunds and both savings measures match BRIEF section 4; zero denominators return null and rounded JSON has no float dust.
MET-02 — As a user I want unduplicated totals so multiple items do not inflate spend.
Scenario: Given orders with multiple matching items, when item filters apply, then order sums count once and KPI/chart sums reconcile.
API-01 — As a client I want a typed contract so errors and empty states are predictable.
Scenario: Given BRIEF section 4 endpoints, when requesting filters, health, dashboard, orders, bill, restaurants, items or slim, then Pydantic validates responses, aggregate metadata is included, empty arrays and structured errors follow the contract; pagination max is 200 and sort is whitelisted.
CI-01 — As a maintainer I want supported runtimes checked so serve changes preserve compatibility.
Scenario: Given new serve code, when CI runs, then pytest/Ruff run with Windows/Linux Python 3.11/3.14 and existing sync dependencies remain lightweight.

### E2: frontend foundation
UI-01 — As a user I want readable themes so all data remains legible.
Scenario: Given both themes/system preference, when rendering audited semantic tokens, then opaque surfaces, chart palette and text/control contrast meet BRIEF section 8 with persisted pre-paint theme and reduced-motion behavior.
UI-02 — As a user I want navigation so each existing capability has a reachable page.
Scenario: Given the migrated shell, when navigating seven specified pages on mobile/tablet/desktop, then navigation is accessible and legacy page remains reachable until parity.
UI-03 — As a user I want shareable filters so reload preserves scope.
Scenario: Given presets and every BRIEF section 7 control, when changing filters, then URL, removable chips, clear/count, saved presets and debounced amount match state and global data updates.
UI-04 — As a maintainer I want a design-system page so themes/states can be checked.
Scenario: Given tokens and house primitives, when opening the page, then light/dark, focus, opaque layers and loading/empty/error/partial examples are reviewable.
UI-05 — As a user I want stable loading so rapid filters do not flash stale layouts.
Scenario: Given generated OpenAPI types and response validation, when filters change rapidly, then TanStack Query keys include filters, old requests cancel and previous data/skeleton layout remains stable.

### E3: additional account scenarios
ACCT-02 — As a user I want ledger/export scope visible so accounts cannot be confused.
Scenario: Given All accounts, when viewing/exporting ledger, then account labels appear; a single-account table hides the Account column and CSV respects scope.
ACCT-03 — As a user I want scoped comparisons so savings/fee insights are relevant.
Scenario: Given an account selection, when comparing periods or viewing savings/fees, then both sides and insights use the same account scope.

### E5: additional ledger scenarios
LEDGER-03 — As a user I want anomaly shortcuts so uncertain bills are easy to inspect.
Scenario: Given unverified or non-reconciling orders, when applying the anomaly shortcut, then ledger filters and totals reflect only the requested anomalies.
LEDGER-04 — As a user I want keyboard and URL continuity so order inspection is dependable.
Scenario: Given multiple accounts, when Playwright switches account, filters, sorts, opens modal, navigates next and closes with Esc, then URL/state restore and focus returns appropriately.

### E6: overview and remaining pages
KPI-01 — As a user I want formula-labelled KPIs so totals and comparison deltas are clear.
Scenario: Given server metrics, when rendering BRIEF section 7 cards, then labelled savings, tooltips, exact values, deltas and sparklines respect filters and null values.
CHART-01 — As a user I want an overview so spending composition and leaders are clear.
Scenario: Given server chart data, when viewing Overview, then monthly spend/order axes, waterfall, top restaurants/dishes and supported insights match KPIs.
SPEND — As a user I want spending trends so changes are visible.
Scenario: Given sufficient data, when viewing Spending, then BRIEF section 6 cumulative/rolling/YoY/calendar/fee/scatter/discount/platform views use server aggregates.
FOOD — As a user I want food leaders so repeat habits and prices are visible.
Scenario: Given item/restaurant data, when viewing Food, then leaderboards/HAVING controls, cuisine, diet, loyalty, repeat and price views use scoped server data.
BEHAV — As a user I want timing patterns so habits are visible.
Scenario: Given valid times/dates, when viewing Behavior, then heatmap, meal slots, weekdays, AOV, gaps/streaks use centrally defined rules.
PLACES — As a user I want privacy-safe geography so addresses are not exposed unnecessarily.
Scenario: Given location data, when viewing Places, then labels/bars and supported distance analysis work without external data transfer; maps need separately acceptable tile source.
HEALTH — As a user I want honest data quality so uncertainty is visible.
Scenario: Given scoped imports and anomalies, when viewing Data health, then history/details warnings, verification/NULL/duplicate/reconciliation summaries and snapshot limits appear; lifetime_complete never warns.

### E7: polish
MOTION — As a user I want restrained motion so changes remain understandable.
Scenario: Given reduced-motion preference, when interacting with shared motion behavior, then animations respect preference and preserve focus/layout.
A11Y — As a keyboard user I want accessible controls so every action is reachable.
Scenario: Given both themes, when running axe/contrast and keyboard walkthrough, then no serious violations remain and chart summaries, touch targets and focus meet BRIEF section 8.
RESP — As a mobile user I want contained layouts so no content overlaps.
Scenario: Given long strings/large amounts and four target widths, when rendering overlays/charts/tables, then opaque layers, truncation/tooltips and internal scroll prevent page overflow.
STRESS — As a user I want graceful edge cases so data size or network errors do not break views.
Scenario: Given zero/one/many rows, rapid filtering, missing fields or errors, when rendering each data component, then loading/empty/error/partial states remain usable; slim payload over 2 MB falls back to server-only.

### E8: approved cleanup only
CLEAN-01 — As a maintainer I want approved legacy retirement so duplicate chart stacks do not persist.
Scenario: Given approved REMOVALS and proven replacements, when removing legacy UI/Recharts, then dedicated removal commits preserve tested capability and remove unused dependencies.
CLEAN-03 — As a maintainer I want accurate docs so supported workflows are clear.
Scenario: Given approved completed changes, when updating README/architecture/METRICS/CI, then docs describe actual behavior and supported commands with Windows-compatible scripts.


