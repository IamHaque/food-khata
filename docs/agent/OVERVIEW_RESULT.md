UI-OVERVIEW-T1 / KPI-01 CHART-01
Files: dashboard-ui/src/app/Overview.tsx, Chart.tsx, src/styles/overview.css, package.json and package-lock.json.
Usage: render <Overview /> within FilterProvider and the existing query/router providers; no props. App routing remains for root.
Chart props: option (EChartsCoreOption), summary, headers, rows. Theme comes from root CSS tokens.
Checks: npm run typecheck, npm run lint, npm test (18 tests), npm run build passed. Build/test required escalation for esbuild spawn.
Limitations: bill composition is a table; top leaders are tables. KPI sparklines are not implemented. Tooltip descriptions are native title text and are not keyboard accessible. No visual/browser verification; build does not yet bundle Overview because route is unwired. No new component tests.
Root wired Overview route and keyboard-accessible formula disclosures; preserved insight filters, bounded leader text and exact KPI titles. Full frontendchecks pass and synthetic browser workflow runs with real Overview responses mocked. Sparklines/true waterfall visual/final visualQA remain.
