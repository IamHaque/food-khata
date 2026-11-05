# BRIEF_BROWNFIELD: Food Khata is an EXISTING project. Migrate it; don't rebuild it.

Precedence on conflict: **this file > orchestrator prompt > docs/BRIEF.md.** Where real code or data contradicts this file, follow reality and log it in `docs/DECISIONS.md`.

## 1. What already exists (from README.md; verify each claim in the audit)

- **Python CLI** (`food-khata`, also `python -m food_khata`): logs in to Zomato/Swiggy, syncs order history incrementally into per-account JSON archives, then **ingests** into SQLite (`.food-khata/food_analytics.db`), then **exports** a versioned `dashboard.json`. Subcommands: `sync` (default), `ingest`, `export` (alias `dashboard`). Flags: `--data-dir`, `--db-path`, `--no-dashboard`, `--output`, `--no-open`.
- **Data layout:** `.food-khata/accounts/<local-account-id>/{account.json, *-history.json, sessions/*.json}`. One phone number used on both providers shares one local account folder; provider IDs stay separate. **Session files contain live credentials.**
- **React app** in `dashboard-ui/`: Vite + Tailwind + shadcn/ui + **Recharts**, one continuous page with **no routes**, loads `dashboard.json` from `public/data/` or via a "Load data" button. Has shared customer/date/platform/restaurant/payment filters, tooltips, a weekday/hour heatmap, a searchable order history, a receipt-style order sheet, and persisted light/dark themes. Tests: Vitest (`npm test`), Playwright (`npm run test:browser`).
- **Python tooling:** pytest, ruff check + ruff format, CI on Windows and Linux with Python 3.11 and 3.14. Docs: `docs/architecture.md` describes modules and schema.
- The ingestion layer already does additive SQLite migration with per-account rollback, financial parsing, and bill reconciliation (components balance within INR 1).

## 2. Hard boundaries (never violate)

- **Do not modify** login, session, sync, locking, or archive code, or anything under `.food-khata/accounts/`. Never open, print, log, or copy `sessions/*.json`. Never include phone numbers, addresses, or order payloads in logs, reports, screenshots, or commits.
- **Do not change the ingest/parse logic or the DB schema** without a written proposal in `docs/agent/PROPOSALS/` and my approval. The new API is a **read-only consumer** of the SQLite DB the CLI produces.
- The `.gitignore` must already cover `.food-khata/`, `*.db`, `dashboard-ui/public/data/`, exports, and screenshots containing real data. Verify this in the first commit, fix it if not, and add a guard (pre-commit hook or CI check) that fails if any of these paths are staged.
- Loopback only. No telemetry, no external requests carrying data.
- **No existing user-facing capability may be lost** unless I approve its removal (see section 6).

## 3. Decisions the README already made (these override my earlier assumptions)

| Topic               | Rule                                                                                                                                                                                                                                                                       |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Savings             | `reported_savings` = **advertised savings**; `total_discount` = **explicit bill discounts**. Show both, clearly labeled. **Never sum or merge them.** KPI "Total saved" must say which one it is.                                                                          |
| Reconciliation      | "Matches" means components balance within **INR 1**. It is not bank verification. Unreconciled bills show provider totals plus a concise notice. Keep this wording.                                                                                                        |
| Completeness banner | `lifetime_complete` is **always false**, so never warn on it. Warn only when `history_complete` or `details_complete` is false for the selected scope. Instead show a permanent, quiet footnote: "Food orders only; Instamart/Dineout excluded; API-visible history only." |
| Stale details       | Saved order details are snapshots; later refunds or status changes may be missing. Data-health page must say so.                                                                                                                                                           |
| Accounts            | An account may span **both** platforms. Selector options show masked phone (`••••1234`), platform badges, order count, and date range. The existing UI says "customer"; use **"Account"** everywhere and log the rename.                                                   |
| Platform            | Windows/PowerShell is primary. **No Makefile.** Provide cross-platform npm/Python scripts. Paths and SQLite URIs must work on Windows (use `Path(...).resolve().as_uri()` + `?mode=ro`, not string concatenation).                                                         |
| Python              | Code must run on **3.11 and 3.14**. Check every new dependency supports both before adding it.                                                                                                                                                                             |
| Navigation          | The README says one page, no routes. I am **deliberately reversing** that: build routed pages (Overview, Spending, Food, Behavior, Places, Ledger, Data health). Log as a decision.                                                                                        |

## 4. Target architecture inside the existing repo

```
food_analytics.db  (written ONLY by `ingest`)
   -> read-only FastAPI layer  (new subpackage inside the existing Python package; follow docs/architecture.md conventions)
        -> JSON over loopback
             -> dashboard-ui (migrated in place): TanStack Query + URL-synced filters
```

- **New CLI subcommand `food-khata serve`:** `--host` (default 127.0.0.1; **refuse non-loopback**), `--port` (default 8765), `--db-path`, `--data-dir`, `--dev`. Serves the built `dashboard-ui/dist` when present (single-command launch), otherwise API-only with a printed hint to run the UI. In dev, Vite proxies `/api` to the API (no CORS needed).
- **Optional dependency extra:** `pip install -e ".[serve]"` adds FastAPI + uvicorn so the sync CLI stays lightweight. `serve` prints a clear install hint if the extra is missing.
- **SQLite access:** read-only URI + `PRAGMA query_only=ON` + a busy timeout. The user may run `food-khata sync` (which writes) while `serve` is running. Handle `SQLITE_BUSY` gracefully (retry, then a friendly error), and invalidate the cache using the mtime of the DB **and** its `-wal` file.
- **All endpoints, the single `build_where`, EXISTS-based item filters, business rules, caching, and Pydantic schemas** follow BRIEF.md sections 2 and 4. The account scope is the `account_ids` filter in that one function.
- **`export` / `dashboard` command stays working and unchanged** until story CLEAN-02. Mark it "deprecated" in `--help` once the API reaches parity.
- **No duplicated business math in the browser.** Audit finds every place the current React code aggregates raw JSON (KPIs, groupings, savings, fees). Those move to the server. The client keeps only formatting, layout, and interaction state.

## 5. Frontend migration: strangler pattern, not a big-bang rewrite

1. **Audit `dashboard-ui/`** and classify every component, hook, and util as **KEEP / ADAPT / REWRITE / REMOVE** with a reason. Defaults:
   - **KEEP** shadcn/ui primitives, theme persistence, and the receipt line-item rendering, **if** they pass the contrast and opaque-surface rules in BRIEF.md section 9. Failing ones become ADAPT.
   - **ADAPT** the filter components (to the new filter object and URL sync), the order table (to server-side sort/pagination), and the receipt sheet (to the centered **order modal** from the orchestrator prompt).
   - **REWRITE** the data layer (JSON loading becomes typed API client + TanStack Query), all client-side aggregation, and the chart wrappers.
   - **REMOVE (last)** the "Load data" flow, `public/data/dashboard.json` loading, and any dead code.
2. **Charts:** default is to **standardize on ECharts** (calendar heatmap, hour x weekday heatmap, treemap, waterfall, dual-axis, morphing transitions) and delete Recharts once every chart is ported. Do not ship two chart libraries long-term. If the audit finds that keeping Recharts for a few simple charts is clearly better, propose it in DECISIONS.md before deviating.
3. **Route by route:** introduce React Router and the app shell, then migrate one page at a time behind the new data layer. The old single page stays reachable at a legacy route until parity is proven.
4. Existing Vitest and Playwright tests must keep passing or be consciously replaced. Each replaced test is listed in `docs/agent/REMOVALS.md` with its successor.
5. Take **baseline screenshots** (both themes, 360/768/1280/1920 px) of the current app before changing anything, using only data I've approved for screenshots (see section 7).

## 6. Removal and deprecation protocol

- Before the first change: `git tag pre-v2-dashboard` and work on branch `dashboard-v2`.
- Maintain `docs/agent/REMOVALS.md`: every file, feature, or dependency slated for removal, with reason, replacement, and parity evidence.
- **Nothing is deleted until (a) its replacement is merged and tested, and (b) I approve the removal list.** Deletions land in dedicated commits: `refactor(remove): <what> (CLEAN-0n)`. Also remove dependencies that become unused (e.g. Recharts), and update README, `docs/architecture.md`, and CI accordingly.

## 7. Baseline and parity harness (build this before replacing anything)

- Run the existing test suites and record pass/fail counts as the baseline. Don't "fix" unrelated failures; list them.
- Write `scripts/parity_check` (Python) that, on the real DB, computes headline numbers **two ways**: via the existing export/JSON path and via the new API: total spend, order count, AOV, fees, discounts, advertised savings, refunds, per-account and per-platform splits, top 10 restaurants, monthly spend. Output a diff table.
- Store results only in a **git-ignored** local file (`docs/agent/parity.local.md`); commit only the script, never the numbers.
- Every mismatch must be explained: a bug in the old path, a bug in the new path, or an intentional rule change. Log each in DECISIONS.md. **Unexplained mismatches block the Overview page sign-off.**

## 8. Added audit checklist (extends BRIEF.md section 3 / epic E0)

Report in `docs/MIGRATION_PLAN.md`:

1. Python package layout, entry points, and how `export` builds `dashboard.json` (module, schema version, size on the real data, fields included). Which fields would the React app lose if it stopped using the JSON?
2. Real schema vs the schema in BRIEF.md: columns added since, indexes, views, and the migration mechanism.
3. `dashboard-ui/` inventory (components, hooks, utils, state management, dependencies with versions, bundle size, Tailwind and shadcn versions). Flag duplicated business logic and hard-coded colors.
4. Baseline test results; baseline contrast/a11y run (axe or Lighthouse) on both themes.
5. The data profile items from BRIEF.md section 3 (formats, status values, NULL rates, duplicates, reconciliation distribution, JSON structures, units).
6. Keep/Adapt/Rewrite/Remove table (section 5) and the ordered migration plan with story IDs.
7. Confirmation that `.gitignore` and the staged-file guard are in place.

**STOP after this and wait for my approval of MIGRATION_PLAN.md.**

## 9. Revised epics (replace the seed epics in the orchestrator prompt)

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

### New stories to write in full

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

ACCT, LEDGER, and the filter/KPI stories from the orchestrator prompt apply unchanged, except that the **existing receipt sheet becomes the order modal** (reuse its logic where it passes the bar), and the **existing customer filter becomes the account selector**.

## 10. First actions

1. `git tag pre-v2-dashboard`, create `dashboard-v2`, verify `.gitignore` and the staged-file guard.
2. Run all existing checks and capture baselines (section 7).
3. Produce `docs/MIGRATION_PLAN.md` (section 8), write BACKLOG.md from section 9, then **STOP**.
