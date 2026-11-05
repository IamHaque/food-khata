# Migration plan — audit in progress, not ready for approval

## Verified baseline (2026-11-06)
- Safety tag `pre-v2-dashboard`; branch `dashboard-v2`; BASE-03 commit `72dcc0b` includes authorized briefs.
- Python 3.14 temporary uv environment with declared runtime dependencies: 55 passed, 10 subtests passed. Default Python lacks pytest/Ruff. Python 3.11 not run locally.
- Ruff check passes; format check passes (33 files).
- Frontend npm test: 7 passed. These are Node assert tests, not Vitest despite the brief description.
- npm run build passes with sandbox escalation for esbuild; JS 826.85 kB (248.28 kB gzip), CSS 30.47 kB (6.60 kB gzip). Existing chunk-size warning.
- No lint script or TypeScript compiler/config is declared in package.json; no invented checks added.
- Guard self-check, staged scan and tracked scan pass. CI runs tracked scan. Screenshot detection is filename-based and cannot establish content safety; all screenshot datasets need approval.
- Browser screenshots, axe/Lighthouse and interactive baseline remain pending dataset approval. No private export or session was opened.

## Existing architecture and export
Entry points are food_khata.py and installed food-khata -> food_khata.cli:main. The protected CLI owns sync/ingest dispatch. food_khata/dashboard.py reads SQLite through a mode=ro URI, joins restaurants, delivery addresses and items in Python, and exports schema_version 1 through atomic save_json. Top-level keys: schema_version, generated_at, accounts, selected_account, orders, archive_imports. source_bill_json and discount_breakdown_json are excluded; the new receipt contract must explicitly supply the approved fields needed for its breakdown. Export size on real data not measured. No API exists yet; executing parity is deferred until both paths exist.

## Schema audit from source (not a real-DB profile)
food_khata/db.py creates accounts, archive_imports, restaurants, delivery_addresses, orders and order_items. Seven declared indexes cover order date/platform/status/account/restaurant and item order/name. Existing additive migration uses PRAGMA table_info and ALTER TABLE orders ADD COLUMN. Do not invoke initialization against source DB. Live schema comparison, views and aggregate-only data profile remain pending. Technical brief section 3 is missing, so its exact required profile cannot be checked.

## Frontend inventory and proposed treatment
| Existing files / units | Treatment | Reason |
| --- | --- | --- |
| src/components/ui/{badge,button,calendar,card,dialog,input,popover,select,separator,sheet,table,tooltip}.tsx | KEEP provisionally / ADAPT if visual audit fails | Existing house primitives; contrast and opacity not yet proven |
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

Hard-coded chart colors occur in main.jsx palette/config, gradients, strokes/fills and rgba heatmap; chart.tsx embeds Recharts stroke selectors. Token definitions live in style.css; focus outline bypasses tokens. Surface/contrast compliance remains unverified.

Dependencies declared: React/DOM ^18.3.1, Recharts ^3.10.1, Tailwind ^3.4.17, Vite ^6.0.5 (build resolves 6.4.5), Radix dialog/popover/select/slot/tooltip, react-day-picker ^9.14.0, Lucide ^0.468.0; shadcn primitives are vendored source, no shadcn package version. No router, query client or ECharts yet. Do not install migration dependencies before plan approval.

## Ordered work and checkpoints
1. Finish BASE-01 approved-data light/dark screenshots at 360/768/1280/1920 and a11y/contrast; finish BASE-02 live schema/profile and missing technical brief reconciliation. STOP for migration plan approval.
2. DATA-01/02 aggregate-only profile and proposed indexes; proposals need approval before DB changes.
3. CLI-01, FILT-01, MET-01/02, API-01, CI-01: optional read-only serve layer and contract. CLI integration requires resolving protected CLI boundary in an approved proposal before edits.
4. UI-01..05 in place; retain legacy route and export; ACCT-01..03 shared scope.
5. MIG-01 parity script and local-only results; STOP after explained parity gate.
6. LEDGER-01..04 then KPI/Overview; STOP with required screenshots.
7. Remaining pages and E7 checks according to supplied technical brief.
8. Approved REMOVALS only; STOP before dedicated CLEAN-01/02 removal commits; CLEAN-03 docs.

## Blockers and incomplete evidence
The current docs/BRIEF.md is the orchestrator prompt, not the referenced technical/design brief. Exact API, metric, filter, design and data-profile requirements are absent. Screenshot dataset approval is pending. External Gemini delegation was rejected by automatic approval review for repository/document transfer; no external worker ran. No deletions or application changes have been made. This draft is not a completed E-1 checkpoint.
