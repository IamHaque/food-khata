# Backlog

All stories: status `todo`; owner `pending`; commit `pending`. BASE-03 is in progress.

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


## Missing source
The technical brief referenced by these documents is missing; DATA, filter, metrics, API, KPI, chart, page and polish scenarios cannot be reconstructed without it.
