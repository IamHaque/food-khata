# Migration plan — E-1 approval checkpoint

## Verified baseline (2026-11-06)
- Safety tag `pre-v2-dashboard`; branch `dashboard-v2`; BASE-03 commit `72dcc0b` includes authorized briefs.
- Python 3.14 temporary uv environment with declared runtime dependencies: 57 passed, 10 subtests passed. Default Python lacks pytest/Ruff. Python 3.11 is not installed locally; covered by the existing Windows/Linux CI matrix (remote run not verified this session).
- Ruff check passes; format check passes (40 files (includes local temporary Python artifacts; all tracked/new Python files checked)).
- Frontend npm test: 7 passed. These are Node assert tests, not Vitest despite the brief description.
- npm run build passes with sandbox escalation for esbuild; JS 826.85 kB (248.28 kB gzip), CSS 30.47 kB (6.60 kB gzip). Existing chunk-size warning.
- No lint script or TypeScript compiler/config is declared in package.json; no invented checks added.
- Guard self-check, staged scan and tracked scan pass. CI runs tracked scan. Guard now blocks all raster file extensions, including captures with ordinary filenames; synthetic captures remain ignored/local. Approved synthetic JSON fixture may be committed, but no generated fixture is staged.
- Playwright/axe baseline completed with synthetic-only JSON interception at both themes and 360/768/1280/1920; see docs/agent/BASELINE_BROWSER.md. All eight captured. Existing heading-order and scrollable-region-focusable violations recorded; light primary text/focus/chart contrast failures recorded. No private export/session opened or real-data screenshot taken.

## Existing architecture and export
Entry points are food_khata.py and installed food-khata -> food_khata.cli:main. The protected CLI owns sync/ingest dispatch. food_khata/dashboard.py reads SQLite through a mode=ro URI, joins restaurants, delivery addresses and items in Python, and exports schema_version 1 through atomic save_json. Top-level keys: schema_version, generated_at, accounts, selected_account, orders, archive_imports. source_bill_json and discount_breakdown_json are excluded; the new receipt contract must explicitly supply the approved fields needed for its breakdown. Existing real export absent at dashboard-ui/public/data/dashboard.json (file metadata only checked); no real export generated. No API exists yet; executing parity is deferred until both paths exist.

## Schema audit from source (not a real-DB profile)
food_khata/db.py creates accounts, archive_imports, restaurants, delivery_addresses, orders and order_items. Seven declared indexes cover order date/platform/status/account/restaurant and item order/name. Existing additive migration uses PRAGMA table_info and ALTER TABLE orders ADD COLUMN. Do not invoke initialization against source DB. Local read-only profile confirms all declared columns present and no extra columns, seven explicit indexes and no views. See docs/DATA_PROFILE.md for complete aggregates and schema comparison. Technical brief section 3 is now supplied and checked.

## Frontend inventory and proposed treatment
| Existing files / units | Treatment | Reason |
| --- | --- | --- |
| src/components/ui/{badge,button,calendar,card,dialog,input,popover,select,separator,sheet,table,tooltip}.tsx | KEEP provisionally / ADAPT if visual audit fails | Existing house primitives; baseline defects recorded; individual overlay states still require later audit |
| src/components/ui/chart.tsx | REWRITE later | Recharts-specific wrapper; ECharts target |
| src/lib/utils.js | KEEP | Existing class helper |
| src/style.css | ADAPT | Existing light/dark tokens; focus outline is literal color; contrast audit pending |
| src/main.jsx theme read/save and initialTheme in model.js | KEEP | Existing persisted theme behavior |
| main.jsx Choice, DatePicker, Help, Panel, Stat | ADAPT | Reuse structure with URL filters and audited tokens |
| main.jsx Receipt | ADAPT | Reuse line-item/bill rendering; centered modal, URL and navigation required |
| main.jsx Ranking, MoneyTooltip, CountTooltip, charts and heatmap | REWRITE/ADAPT incrementally | ECharts, typed server aggregates and tokens |
| main.jsx App | ADAPT | Local useState/useMemo/useEffect; introduce shell/routes while retaining legacy page |
| model.js money, restaurant, location | KEEP where presentation-only | Formatting/fallback helpers |
| model.js filterOrders, totals, paginate, timeline, rank | REWRITE on server | Current client business rules, sorting and grouping |
| loader.js validateData/readExport | Retain until approved CLEAN-02 | Existing automatic/file JSON flows must continue |
| model.test.js, loader.test.js, scripts/browser-test.mjs | KEEP | Existing baseline coverage; list successors before replacement |

Client business math also lives in main.jsx: discount reductions, fee sums, heatmap and other chart groupings. model.js spend uses DELIVERED orders while order count uses all orders; AOV denominator is delivered count; refunds include all statuses. Preserve or explain parity differences. paginate searches serialized order objects; new API must implement specified restaurant/item search deliberately. rank dishes sums item totals independently of delivered-only spend. No formulas changed during audit.

Hard-coded chart colors occur in main.jsx palette/config, gradients, strokes/fills and rgba heatmap; chart.tsx embeds Recharts stroke selectors. Token definitions live in style.css; focus outline bypasses tokens. Baseline records token ratios and axe findings; full opacity and overlay-state compliance remains work for UI-01/E7, not a baseline pass.

Dependencies declared: React/DOM ^18.3.1, Recharts ^3.10.1, Tailwind ^3.4.17, Vite ^6.0.5 (build resolves 6.4.5), Radix dialog/popover/select/slot/tooltip, react-day-picker ^9.14.0, Lucide ^0.468.0; shadcn primitives are vendored source, no shadcn package version. No router, query client or ECharts yet. Do not install migration dependencies before plan approval.

## Ordered work and checkpoints
1. BASE-01/02/03 and DATA-01 baseline evidence delivered. STOP here for migration plan approval; existing accessibility failures are migration inputs.
2. DATA-02 formal proposed indexes/views, measured against actual new endpoint plans; no source DB writes. DATA-01 already completed locally.
3. CLI-01, FILT-01, MET-01/02, API-01, CI-01: optional read-only serve layer and contract. Add serve dispatch without modifying existing login/session/sync/ingest behavior. Any needed protected-path/schema/parser changes require a separate approved proposal.
4. UI-01..05 in place; retain legacy route and export; ACCT-01..03 shared scope.
5. MIG-01 parity script and local-only results; STOP after explained parity gate.
6. LEDGER-01..04 then KPI/Overview; STOP with required screenshots.
7. Remaining pages and E7 checks according to supplied technical brief.
8. Approved REMOVALS only; STOP before dedicated CLEAN-01/02 removal commits; CLEAN-03 docs.


## Data findings and migration implications
- Profile: 2 accounts, 464 orders, 715 items; dates 2018-06-26 through 2026-11-05; both accounts span platforms. No duplicate account/platform/order keys; three normalized restaurant groups cross platforms, supporting merged identity mode without merging source rows.
- Actual statuses: DELIVERED 447, CANCELLED 9, PAYMENT_INCOMPLETE 8. Default spend/AOV use DELIVERED; other statuses remain accessible explicitly.
- Stored reconciliation: 353 within INR 1, 111 outside. Technical illustrative formula: 57 within / 407 outside. Existing parser uses food_discount and net delivery fee; preserve it and explain parity differences. No ingest repair attempted.
- Source bill JSON includes both objects and arrays; discount JSON is object-shaped. Only whitelisted key-presence counts recorded; no provider payloads or arbitrary keys copied.
- Profile reports NULLs; no audited chart-support field exceeds 80% NULL. Availability does not establish semantic accuracy. Payment methods outside recognized categories are withheld rather than exposing arbitrary values; future filter metadata needs privacy-safe labels.
- Lifetime flag is false for all four imports; history/details are complete. Do not show a partial warning for lifetime coverage. Snapshot caveat remains.
- INR is the application convention; raw parser numeric values do not independently prove every provider's unit. No headline financial values committed.

## Baseline findings and limitations
- Existing serious axe scrollable-region keyboard-focus finding and moderate heading ordering occur in all eight states. Light primary text 4.19:1 fails 4.5; actual focus ring 2.99:1 fails 3; five palette marks fail 3 against background. Dark measured pairs pass. Axe has incomplete contrast nodes; later manual chart/overlay checks remain required.
- Synthetic full-page screenshots and raw synthetic axe output are ignored under dashboard-ui/test-results/synthetic-baseline/. Reproduction scripts and summary are committed. Only generated fixture is loaded; real data and all unexpected network paths are blocked by the harness.
- Root reran existing npm run test:browser successfully after adding context-level network containment. Synthetic JSON interception remains in place. Themes, filters, pagination/search, receipt, file recovery and mobile page-overflow assertions pass. Root also reran the eight screenshot/axe combinations with no page errors or unexpected requests.
- No frontend lint script/tsc dependency/config exists in the baseline; add these in migration foundation, not as unrelated baseline fixes. npm tests use Node test/assert, not Vitest. Build warning remains unchanged.
- Python 3.11 is covered by configured CI; no local 3.11 available. No remote CI pass asserted.
- No new API exists: scripts/parity_check and real-data parity run are scheduled with the serve/API work before replacement; results stay docs/agent/parity.local.md. API slim payload size cannot yet be measured.
- Technical brief replaces the earlier placeholder; original orchestrator is preserved at docs/agent/ORCHESTRATOR_PROMPT.md. Brownfield sequencing, existing in-place project, PowerShell scripts and centered modal take precedence over conflicting greenfield assumptions.
- Gemini received nothing: shared-checkout harness cannot enforce Git-only scope. Work used local Terra workers; no transfer scan was performed because no transfer occurred.

## Resolved dependency inventory
Installed: React/DOM 18.3.1; Vite 6.4.5; Tailwind 3.4.19; Recharts 3.10.1; Playwright 1.58.2; Inter 5.3.0; Radix dialog/popover 1.3.1, select 2.4.1, slot 1.5.0, tooltip 1.4.1; react-day-picker 9.14.0; lucide 0.468.0; class-variance-authority 0.7.1; clsx 2.1.1; tailwind-merge 2.6.1; plugin-react 4.7.0; autoprefixer 10.6.2; postcss 8.5.32. shadcn is vendored and has no independent installed version. No migration dependency added. Axe 4.10.3 used from temporary/cache tooling.

## Approval requested
Approve this incremental migration plan, including carrying baseline accessibility defects into UI-01/E7. No removal approval is requested here. Nothing removed; no application, ingest, schema, account or session code changed. Subsequent STOPs remain parity, Ledger/Overview screenshots, and every deletion.

## Independent review and verification
Terra Medium reviewed the scripts and evidence. Root fixed both concrete safety findings: reject profile output aliases of the source DB (including hard links), and block raster screenshots regardless of filename. Added regression checks; root reran full Python suite (57 + 10 subtests), Ruff, generator self-check, profile generation, eight Playwright/axe captures and existing browser suite. No unexplained code-review finding remains; baseline a11y/contrast defects stay documented for migration.


## Implementation outcome (supersedes baseline-only status above)

User authorized intermediate work through final review. The read-only API, typed frontend, seven pages, shared account/filter scope, Ledger/modal and server chart datasets are implemented. See FINAL_VERIFICATION.md for current evidence and limits; the earlier absence of API/types/lint and baseline a11y defects describe the pre-migration state. Local parity passes with0 mismatches. Final populated synthetic56-state axe/overflow checks pass after dark-link contrast and mobile modal-table focus fixes. Legacy remains working. Removal proposals remain unapproved in docs/agent/REMOVALS.md. No source schema or indexes changed.
