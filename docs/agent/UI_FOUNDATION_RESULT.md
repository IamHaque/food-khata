# UI foundation progress
- Typed entry/router and seven navigation placeholders added; legacy loads unchanged at /legacy.
- Generated API types and reproducible generation script added; API client/query hooks still pending.
- Root fixed strict TS boundary: legacy JSX declared separately; new TS remains strict. Added alias configuration.
- Root verified: typecheck, lint (existing new TS only), build, seven Node tests, original synthetic browser suite at /legacy all pass.
- Existing browser and baseline scripts now target /legacy without dropping scenarios.
- Remaining: API/Zod/hooks/mocked tests, account/global URL filters, scoped themes, actual page content.
- npm audit: 11 moderate findings (router and lint dependency chains); no forced audit fix applied.

## UI-T1C / UI-05
- Added `dashboard-ui/src/lib/api.ts`, `response-schema.ts`, `api.test.ts`, and `src/hooks/api.ts`; updated package test/lint scripts.
- Wrappers: `metadata(filters?, signal?)`, `health(filters?, signal?)`, `dashboard(filters, signal?)`, `orders(params?, signal?)`, `bill(id, filters?, signal?)`, `restaurants(params?, signal?)`, `items(params?, signal?)`, `slim(filters?, signal?)`.
- Hooks: `useMetadata`, `useHealth`, `useDashboard`, `useOrders`, `useBill`, `useRestaurants`, `useItems`, `useSlim` use corresponding arguments without signals.
- Strict typecheck and lint pass; npm test passes seven Node and three mocked Vitest tests; production build passes (existing chunk-size warning).
- Test/build required elevated execution for esbuild spawn; no browser or real data used.

## UI-T2A / UI-05 UI-03 (incomplete)
- Consolidated repeated filter and order response schemas in response-schema.ts.
- Typecheck fails: Dashboard schema lacks regenerated comparison and chart fields.
- Remaining: complete contract schemas, URL filter model and tests, lint/test configuration, and all checks.
Root completion: expanded Dashboard Zod schemas retain chart/comparison fields; URL filter model defaults/parse/serialize/accountprune added.7Node+7Vitest/typecheck/lint/build verified. UIcontrols/account selector remain next.
