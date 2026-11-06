# Local migration verification

2026-11-06. Dashboard-v2 stays in the existing project. No source DB writes, schema/index application, protected ingest/auth/session changes or legacy deletion were performed.

- Python:105 passed plus10 subtests. Ruff lint and format pass. One Starlette/httpx deprecation warning remains.
- Frontend:7 existing Node tests plus12 Vitest tests pass. TypeScript, ESLint and production build pass. npm audit reports0 vulnerabilities after router patch and targeted minimatch override.
- Browser: synthetic account pruning, filter reload/presets, theme, single-account display, Ledger server sort/pagination/full CSV, keyboard row activation, modal cross-page/deep-link navigation/focus restoration, scope-preserving page navigation, command palette and dish price history pass.
-56 populated synthetic page/theme/width states (seven routes, light/dark,360/768/1280/1920) pass without serious/critical axe findings or page overflow. Ledger states include the bill modal. Screenshots and raw axe reports remain ignored in dashboard-ui/test-results/synthetic-v2. These are synthetic fixtures only.
- Retained legacy browser workflow passes separately. Read-only local real-data parity:0 mismatches; numeric results remain only in the ignored local report.
- Source query-plan summary uses fixed placeholder values, collects no row values and applies no indexes. See QUERY_PLANS.md.
- Staged/tracked path guard and its self-check pass before commits.

## Practical limits

Python3.11 is unavailable locally; Windows/Linux3.11/3.14 CI is configured, with no remote pass claimed. Browser checks use installed Chrome, not every browser engine. Axe does not fully verify canvas colors or visual quality; chart data tables and textual summaries provide equivalent values. Synthetic fixtures cannot prove every provider payload shape. This is a locally served single-user application.

Both legacy Recharts and new ECharts remain bundled until approved retirement, so Vite reports large chunks. API charts stay server-side; the UI never downloads the optional slim history, avoiding its2MB fallback path entirely. Query timing logs report request duration by route, not SQL/parameters. Motion uses shared CSS/ECharts reduced-motion behavior; the UI keeps exact financial values visible. Native form controls are retained where they satisfy filtering without another dependency.

## Approval boundary

Review proposed REMOVALS R1/R2 separately. Neither is approved or executed. Existing offline export and the legacy UI remain available. Approval of the implementation does not imply permission to change source schema, protected code or delete data.
