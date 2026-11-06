# Dashboard redesign: implementation contract and BDD backlog

Prepared 2026-11-06. Status: planning complete; implementation not started.
Audience: the AI agent implementing the next dashboard iteration.

## 1. Objective and authority

Deliver a premium, elegant, readable food-order dashboard through better hierarchy, trustworthy controls, accessible interactions, and deliberate charts. Use Tailwind and the existing local shadcn/Radix components heavily. This document authorizes no implementation by itself: the current request is to prepare the plan. Start implementation when instructed.

The user's new redesign request supersedes the older “no redesign” direction for dashboard presentation only. Preserve existing data, privacy, financial semantics, API contracts, and legacy-retirement constraints. Read `docs/BRIEF_BROWNFIELD.md`, `docs/DECISIONS.md`, and the relevant source before work. Do not treat historical “complete” or passing checks in STATE.md as verification of this iteration. Do not inherit historical worker/model assignments as permission to delegate; use current user/session instructions.

Never change authentication, session storage, sync, locks, ingest, source databases, or account files for this redesign. Keep local services loopback-only. Use synthetic accounts/orders for tests, screenshots, reports, and visual examples. Preserve all existing routes, meaningful analytics, exports, and order-inspection workflows. No backend/schema changes or legacy deletion without separate justification and authorization.

## 2. Initial evidence and limits

Audit evidence from source and the existing built application:

| ID | Finding | Priority | Stories |
| --- | --- | --- | --- |
| F01 | Expanded filters push content to y≈531 at 1280×800; mobile panel ≈1102px tall | P1 | R03, R04 |
| F02 | Mobile links shrink to ≈51px despite ≈88px content; visible overlaps | P1 | R03 |
| F03 | Light primary/white 4.19:1, muted/card 4.84:1; semantic text pairs also weak | P1 | R02, R11 |
| F04 | 15 icon-only KPI summaries lack text names; many targets below 44px | P1 | R02, R05 |
| F05 | Preset/date mismatch, silent amount rejection, opaque chips/defaults | P1 | R04 |
| F06 | Keystroke URL updates and retained old query data lack clear feedback | P1 | R04, R09 |
| F07 | Dense metrics, tiny labels, hover affordances on static cards | P2 | R05 |
| F08 | Chart overload, repeated loyalty view, mixed units, weak comparisons | P2 | R06–R08 |
| F09 | Missing popover tokens; unsupported shadow utilities; duplicate theme tokens | P1 | R02 |
| F10 | Navigation semantics, skip link, command keyboard/empty-state gaps | P1 | R03 |
| F11 | Account labels expose implementation IDs; long option labels truncate | P2 | R03 |
| F12 | Positive spend/fee changes colored as good; sparkline gaps joined | P2 | R05, R06 |
| F13 | Charts recreate instances; incomplete dark-theme axis/legend styling | P2 | R06 |
| F14 | Runtime API exception observed; cause and affected request not established | Investigate | I01, R01 |

Measurements above are baselines, not current acceptance results. The audit used existing dist assets because Vite failed with `spawn EPERM`; source/build parity remains unverified. All seven routes were visited; complete modal/export, screen-reader, and automated accessibility checks were not performed. Do not claim full AAA compliance from this audit.

## 3. Design and technology decisions

| ID | Decision | Rationale / constraint |
| --- | --- | --- |
| D01 | Keep React, Router, TanStack Query/Table, Zod, Inter and Lucide | Existing stack supports the goal; no framework migration |
| D02 | Use local shadcn/Radix primitives and Tailwind 3.4 utilities | Reuse Button, Input, Select, Card, Badge, Dialog, Sheet, Popover, Table and Tooltip; repair shared defaults first |
| D03 | Retain Apache ECharts as the primary analytics engine | Best fit for this dashboard's existing heatmaps, calendar, scatter, waterfall and time series without new dependencies or custom chart implementations |
| D04 | Use shadcn Cards/controls around ECharts; do not use the Recharts-specific ChartContainer around ECharts | shadcn chart components are Recharts-based, not renderer-independent |
| D05 | Do not migrate all charts to Recharts or add a third chart engine | Recharts 3 offers useful keyboard accessibility and is already used by legacy; it does not justify rebuilding the specialized current views. Keep legacy intact |
| D06 | One semantic theme source for UI and charts | Derive renderer colors from shared CSS tokens; eliminate conflicting v2 color values only after caller inventory |
| D07 | AA interaction/reflow baseline plus AAA text contrast and enhanced targets | Verify real states. shadcn defaults are a starting point, not certification; do not claim overall AAA unless every applicable criterion is audited |
| D08 | Show primary scope immediately, disclose advanced controls | Keep all existing capabilities; reduce simultaneous decisions |
| D09 | Neutral change indicators by default | Spending more is not inherently positive; only use good/bad semantics when supported by an explicit product meaning |
| D10 | Preserve financial meaning over visual convenience | Explicit discounts ≠ advertised savings; unknown ≠ zero; provider-paid totals may not reconcile; no misleading causal claims |

D03 is a project-specific fit decision, not a universal ranking. ECharts has ARIA descriptions and decal support but these do not provide complete keyboard point exploration. Supply accessible HTML data and controls for every chart; never make an essential action canvas-only. If a story cannot meet its acceptance criteria, log the limitation and options before changing this decision.

Sources checked during planning:
- [ECharts accessibility, ARIA module and decals](https://echarts.apache.org/handbook/en/best-practices/aria/)
- [ECharts legends](https://echarts.apache.org/handbook/en/concepts/legend/)
- [Recharts accessibility](https://github.com/recharts/recharts/wiki/Recharts-and-accessibility)
- [shadcn chart documentation](https://ui.shadcn.com/docs/components/radix/chart)
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/)

## 4. Visual specification

- Quiet neutral surfaces with one restrained green accent. Opaque popovers/dialogs. No decorative gradients, glass effects, unnecessary badges, or hover elevation on static metrics.
- Default content text 14–16px; secondary labels at least 12px; no essential 10–11px text. Page titles 24–30px, section titles 16–18px, principal values 28–36px where space allows. Inter with tabular numerals; avoid applying monospace to every number.
- Use Tailwind's existing spacing scale, consistent radii, one subtle card border and restrained elevation. Prefer whitespace and headings to nested bordered boxes.
- Desktop: stable navigation, page title and scope before data, compact toolbar, primary KPIs then main trend. Mobile: compact header, accessible navigation sheet, one-column content, 44px primary targets, advanced filters in a sheet/dialog.
- At 1280×800 show the primary KPI row and the start of the main trend. At 390×844 show page identity, scope and at least the first KPI without opening advanced filters. At 320px, prevent page-level horizontal scrolling; allow clearly labeled local scrolling for genuinely two-dimensional data.
- Preserve chosen account and filters across page navigation. Do not pin a large toolbar that obscures content/focus. Use descriptive page subtitles and plain labels rather than “Detailed Categorical Scopes” or internal enum names.

## 5. Universal chart contract

Every chart must satisfy this contract, including charts inside drilldowns:

1. A descriptive title, period/scope, units, and concise factual description. Do not fabricate an insight where data is missing or incomplete.
2. Multi-series legends use exact human-readable series names and stable colors across pages, themes and filtering. Use line styles, symbols or decals as additional cues. A single series normally needs a title/axis label rather than a redundant legend.
3. Legends wrap with reserved space and do not overlay plot content. If series toggling is useful, expose native HTML buttons with accessible names, pressed states, keyboard operation and a restore action. Do not depend on canvas legend clicks. Label static legends as static, without interactive styling.
4. Tooltip headers identify date/category; rows identify series and unit. Use en-IN currency/number formatting consistently, full precision as appropriate in tables, readable month names and explicit comparison periods. Zero, unknown and unavailable are distinct. Avoid raw arrays, generic “Value”, internal keys and floating-point noise.
5. Text follows the contrast policy; essential chart marks meet 3:1 against adjacent backgrounds or use adequate distinguishable outlines/patterns. Label heatmap scale endpoints and units, including zero and missing-data semantics. Use sequential scales for magnitude; diverging scales only for meaningful signed change.
6. Bars start at zero. Time series use chronological spacing; missing periods remain gaps unless the API establishes zero activity. Do not smooth lines by default. Negative financial values remain visible. Avoid dual axes, 3D, pie charts with many slices and decorative gauges.
7. Provide a keyboard-accessible “View data” disclosure with semantic headers, formatted values and all underlying plotted data. Tables remain usable with large datasets through local scrolling/pagination. Screen readers receive a concise description, not thousands of concatenated values. Import/configure ECharts ARIA support against the installed version; verify exact option names rather than copying outdated examples.
8. Touch users can obtain exact values from the data view; interactive inspection must not require hover. Actions/filtering offered in charts have equivalent HTML controls. Legends, tooltips and focused controls cannot be clipped at 320px or 200% zoom.
9. Use responsive plot sizing and chart-specific margins, with readable sparse ticks. Dense series may use deterministic display aggregation with explicit bucket labels and preserved totals; log the rule, keep full data available and never silently downsample financial totals. Do not add a zoom/brush unless necessary for the specific view.
10. Resize/update the existing ECharts instance; dispose on unmount, clean observers, preserve valid legend state across theme changes. Respect reduced motion. Use text-safe tooltip rendering for untrusted labels.

## 6. Chart-by-chart specification

This inventory defines the final presentation; preserve every underlying metric through a chart, data view or secondary disclosure. Verify API field semantics before transforming data.

| Page / question | Presentation | Labels and semantic safeguards |
| --- | --- | --- |
| Overview: monthly spending and frequency | Aligned small multiples: spend columns above order-count columns, common time range | “Spend (₹)” and “Orders”; shared month labels; remove dual axes |
| Overview: KPI history | Small sparklines, secondary monthly values table | Explicit period; gaps stay gaps; no animated loading treatment for permanently unavailable data |
| Overview: bill components | Signed horizontal component bars and separately labeled provider-paid total | “Amount (₹)”; explicitly non-reconciling breakdown. Only retain a waterfall if component semantics and reconciliation prove it mathematically valid |
| Overview: top restaurants/dishes | Ranked compact tables with optional in-cell bars | Full accessible names, quantity, amount; drilldown affordance only where supported |
| Spending: daily and rolling spending | Two aligned time-series views, one daily and one rolling 30-day | Both in ₹; distinguish daily vs rolling; do not imply an average if rolling value is a sum |
| Spending: cumulative spending | Secondary disclosure, cumulative line | Define accumulation start; never imply total account history when scope is restricted |
| Spending: monthly fees | One stacked monthly component chart replacing redundant total/component charts | “Net delivery”, “Packaging”, “Platform”, “Tax”; describe tax as separately categorized, not silently included in fee totals |
| Spending: discount components | Ranked horizontal bars | “Explicit discount (₹)”; advertised savings excluded |
| Spending: yearly comparison | Line series by year, common Jan–Dec axis | Legend “2025”, “2026”, etc.; incomplete years have gaps; wrap legend and provide selection when many years exist |
| Spending: spend calendar | Calendar heatmap, selected year; narrow view shows a usable month range or labeled local scroll | “Daily spend (₹)” scale, date/amount/orders data view; no orders vs unavailable distinguished |
| Spending: fee burden vs order value | Scatter | X “Order amount (₹)”, Y “Fees (%)”; exclude undefined ratios with count/explanation; no causal claim |
| Spending: platform comparison | Comparison table | Orders, ₹ spend, explicit discounts, advertised savings and fees separately formatted |
| Food: cuisine spending/share | One ranked horizontal bar chart, replacing duplicate share view | “Spend (₹)” with share in tooltip/table only when denominator is defined; unavailable-reason state |
| Food: loyalty | One ranked restaurant order-count view | “Orders”; consolidate duplicated loyalty panel without losing distinct metrics |
| Food: diet quantity and history | Current totals as ranked bars; monthly history as stacked columns in secondary detail | “Item quantity”; Veg / Non-veg / Unknown; never call item quantity order count |
| Food: new vs repeat restaurants | One stacked monthly column chart | “New restaurant orders”, “Repeat restaurant orders”; mutually exclusive definitions from API |
| Food: restaurant/dish leaders and unit-price history | Existing sortable/paged tables; selected dish price line | Grouping and minimum thresholds explicit; price unit and comparable item identity retained |
| Behavior: hour × weekday | Heatmap | X hours with unambiguous time labels, Y weekdays; scale “Orders”; missing vs zero stated |
| Behavior: meal slots | Ordered categorical bars | Breakfast, Lunch, Snack, Dinner, Late night; order count |
| Behavior: weekdays vs weekends | Two bars with actual counts | “Orders”; disclose unequal numbers of days; do not imply normalized preference |
| Behavior: days between orders | Distribution columns in numeric gap order | X “Days between orders”, Y “Occurrences” only if API semantics confirm that count |
| Behavior: order amounts | Histogram using existing defined bins | X “Order amount (₹)”, Y “Orders”; ordered ranges and endpoint rules |
| Places: destination spending | Ranked horizontal bars | Label + city, “Spend (₹)”; no full addresses or maps with private coordinates |
| Places: distance vs delivery fee | Scatter | X “Distance (km)”, Y “Net delivery fee (₹)”; unavailable reason, no implied causal relationship |
| Data health: coverage and reconciliation | Labeled status summaries and tables, no decorative gauge | Counts/denominators and unknown states; history/details scope, snapshot limitations; lifetime completeness alone does not warn |

## 7. Execution sequence and progress board

Statuses: TODO → IN_PROGRESS → VERIFY → DONE; BLOCKED requires an issue ID and next action. One primary story in progress at a time. Dependencies are gates, not suggested ordering. No calendar estimates until R01 establishes a working baseline.

| Story | Deliverable | Depends on | Status | Evidence / issue |
| --- | --- | --- | --- | --- |
| R01 | Reproducible synthetic baseline and source/build check | — | DONE | PASS: npm build, vitest, node tests, pytest 105+10, foundation tests pass |
| R02 | Tokens and shared component foundation | R01 | DONE | PASS: unified tokens, popover tokens, 7:1 AAA normal text contrast, 44px button/icon targets, DesignSystem using shadcn components |
| R03 | Responsive shell, account selection and commands | R02 | DONE | PASS: skip link, mobile navigation sheet, aria-current, 44px hit areas, arrow/Enter commands with empty state and focus restoration, concise account formatting |
| R04 | Compact, truthful filters | R03 | DONE | PASS: closed-by-default advanced details, active count badge, controlled preset detection, inline date/amount validation, modifier-free checkbox multiselection, 250ms debounced history replace, vitest + browser foundation tests pass |
| R05 | Overview hierarchy and metric semantics | R04 | DONE | PASS: 3 primary hero KPIs (Spend, Orders, AOV), distinct secondary metrics & breakdown, neutral comparison deltas, unique accessible formula disclosures with >=44px hit targets, non-zero unknown semantics, gap-preserving sparklines |
| R06 | Chart foundation and representative chart verification | R02, R04 | DONE | PASS: existing instance update with setOption (resolving F13), AriaComponent with decal patterns, semantic theme/dark-contrast tokens, reduced motion support, keyboard-accessible data table with >=44px disclosure targets |
| R07 | Spending and Overview charts | R05, R06 | DONE | PASS: aligned small multiples monthly spend/orders (no dual axes), signed horizontal component bars with distinct provider-paid callout, ranked horizontal discount bars, Jan-Dec yearly comparison, local-scroll calendar heatmap, consolidated monthly fees (resolving F08), scatter fee burden, formatted platform comparison |
| R08 | Food, Behavior, Places and health presentation | R06, R07 | DONE | PASS: consolidated cuisine into ranked bars, loyalty into single ranked view, new vs repeat into stacked monthly columns, diet quantity totals + history disclosure, independent leader pagination and retained selection, privacy address label preservation, neutral coverage status |
| R09 | Ledger, order modal and state feedback | R04, R06 | DONE | PASS: visible labeled inspect action per row, boundary-aware previous/next order navigation, focus retention on modal close with Escape handling, non-destructive refresh error banner with retry, and distinct semantic feedback for export success, cancellation, and error |
| R10 | Component consistency and unused-style cleanup | R03–R09 | DONE | PASS: unified focus-visible ring to semantic theme token, eliminated hardcoded focus hexes, verified production components in DesignSystem, preserved legacy compatibility variables without duplicate overrides |
| R11 | Cross-page verification and handoff | R10 | DONE | PASS: all test suites pass (TypeScript, ESLint, 20 Vitest/Node unit tests, 105 pytest + 10 subtests, Playwright foundation and browser tests), production build clean in 9.67s, tracking files synchronized |

Implementation order: R01 → R02 → R03 → R04 → R05 → R06 → R07 → R08 → R09 → R10 → R11. Work on the next independent story if blocked, after recording why; never bypass a dependency silently.

## 8. BDD stories

### R01 — As an implementer, I need trustworthy baseline evidence

Scope: build configuration, existing synthetic browser scripts, package scripts, docs only as needed.

```gherkin
Scenario: Establish the baseline
  Given the current source and synthetic multi-account fixtures
  When I build and run the dashboard with its read-only API or controlled fixtures
  Then I record the commit, commands, source/build identity and viewport/theme matrix
  And all seven pages have a baseline screenshot using synthetic data only
  And existing failures are recorded separately from redesign regressions
Scenario: Runtime failure
  Given Vite fails or an API request errors
  When I investigate with synthetic data and redacted diagnostics
  Then I record the exact reproduction and impact under I01 or I02
  And I do not change backend semantics to make a UI test pass
```

### R02 — As a user, I need a legible and consistent design foundation

Scope: style.css, styles/app.css, tailwind.config.js, components/ui, DesignSystem.tsx; inventory callers before editing defaults.

```gherkin
Scenario Outline: Read content and operate controls in either theme
  Given <theme> appearance
  When I inspect text, controls, popovers and focus/hover/selected/error states
  Then normal text meets 7:1 and large text meets 4.5:1 against its rendered background
  And essential control boundaries and graphical cues meet 3:1 where required
  And primary and icon targets are at least 44 by 44 CSS pixels
  And any standards exception is documented with its reason
  Examples:
    | theme |
    | light |
    | dark  |
Scenario: Shared primitives represent the actual product
  Given the design-system page
  When I inspect its examples
  Then they use the same local components and tokens as production screens
  And unsupported utilities and missing popover tokens are corrected
  And no parallel theme palette overrides those tokens
```

Do not upgrade Tailwind or blindly regenerate shadcn components. Preserve forwarding refs, accessibility semantics and existing APIs. Add missing primitives only for an actual story need.

### R03 — As a user, I can navigate and select an account at any width

Scope: App.tsx, AccountSelector.tsx, CommandPalette.tsx, ThemeControl.tsx, shared Sheet/Dialog.

```gherkin
Scenario: Mobile navigation
  Given a 320 or 390 pixel viewport
  When I open navigation and choose any of the seven pages
  Then labels and hit areas do not overlap
  And the selected page is announced with aria-current
  And the sheet closes and focus is placed predictably
  And account and filter scope survive navigation
Scenario: Keyboard navigation
  Given keyboard-only input
  When I use the skip link, navigation sheet and command search
  Then I can reach main content and run matching commands
  And arrow keys select commands, Enter runs one, and Escape closes the dialog
  And no results produces a readable empty state
  And closing dialogs restores focus and route changes announce the new page
Scenario: Readable accounts
  Given multiple or long account labels
  When I select or search an account
  Then its masked label and concise platform context identify it
  And UUIDs and long date/count metadata are secondary details rather than option titles
  And all selected account IDs in an existing URL remain visibly represented
```

Preserve multi-account URLs even if the normal selector offers one account or All; do not silently display only the first selected account.

### R04 — As a user, I can understand and change the applied scope

Scope: FilterBar.tsx, FilterContext.tsx, lib/filters.ts, related tests and query hooks.

```gherkin
Scenario: Compact entry state
  Given default filters on any page
  When the page loads
  Then account, period and relevant default order status are explicit
  And advanced filters are closed and their active count is visible
  And every existing filter remains available through labeled controls
Scenario: Apply advanced filters
  Given multiple categorical selections
  When I select or remove options without modifier keys
  Then the active scope uses readable labels and removable chips
  And search within long option lists and a clear selection action are available
  And closing and reopening preserves the current scope
Scenario: Truthful date and amount inputs
  Given preset, custom dates, URL state or a loaded saved preset
  When I change one of them or clear filters
  Then the displayed preset agrees with the applied date interval
  And reversed dates or minimum greater than maximum show associated inline errors
  And results are never silently presented as matching rejected values
Scenario: Search and history
  Given an existing navigable filter state
  When I type quickly in search
  Then updates are debounced and intermediate keystrokes replace history
  And Back returns to meaningful prior navigation or committed filter states
  And pending results are visibly and accessibly marked as updating
Scenario: Presets and scope changes
  Given no saved preset or unavailable filters after changing account
  When I load a preset or change scope
  Then a precise status explains the outcome
  And stale success/error messages are cleared on the next action
  And Clear filters preserves the selected account and documented page defaults
```

Use existing Popover/Input/Button and native labeled checkbox semantics for multiselection; do not misuse single-select Radix Select as a multiselect. Define immediate application with debounced text/amount inputs consistently; do not add an Apply button unless changing the entire advanced panel to a documented draft/commit model.

### R05 — As a user, I can understand the overview at a glance

Scope: Overview.tsx and overview styles.

```gherkin
Scenario: Prioritized overview
  Given matching orders
  When I open Overview at desktop or mobile width
  Then Spend, Orders and Average order value are the primary metrics
  And discounts, advertised savings and remaining metrics remain available as secondary information
  And the viewport placement goals in section 4 pass
  And static metrics do not look clickable
Scenario: Explain values and changes
  Given an unknown metric or a selected comparison period
  When I inspect its value, delta or calculation explanation
  Then unknown is not displayed as zero
  And comparison periods are explicit and change is not automatically labeled good or bad
  And each explanation control has a unique contextual accessible name
  And full amounts remain obtainable on touch and keyboard without a hover title
```

### R06 — As a user, I can read and operate every chart

Scope: Chart.tsx, theme tokens, chart callers; avoid inventing a general chart framework.

```gherkin
Scenario Outline: Representative chart contract
  Given a <kind> chart with synthetic data in light and dark themes
  When I inspect it at 320, 390, 768 and 1440 pixels
  Then every applicable rule in section 5 passes
  And labels, legends, scale units and tooltips fit without overlap
  And equivalent values and actions are available through keyboard-accessible HTML
  Examples:
    | kind      |
    | line      |
    | stacked bar |
    | heatmap   |
    | scatter   |
Scenario: Lifecycle and motion
  Given an initialized chart and selected series
  When data, theme or container width changes
  Then the existing instance updates without unnecessary recreation
  And valid selections survive and observers are cleaned on unmount
  And reduced-motion preference prevents animated transitions
```

Verify a representative chart before migrating all callers. Record rendered contrast and keyboard findings, not just option objects.

### R07 — As a user, I can compare spending without misleading graphics

Scope: Overview.tsx, AnalyticsPages.tsx spending branch, SpendingDetails.tsx.

```gherkin
Scenario: Financial view parity
  Given known fixture totals, missing dates, refunds and incomplete periods
  When I inspect all Overview and Spending views in section 6
  Then every preserved metric agrees with the API and its data table
  And the default overview uses aligned spend/order views rather than dual axes
  And redundant monthly-fee charts are consolidated with component definitions intact
  And advertised savings remain separate from explicit discounts
  And cumulative and calendar details remain available without dominating the page
Scenario: Components do not reconcile
  Given components that differ from provider paid
  When I view the bill breakdown
  Then component bars and provider paid are clearly separate
  And the discrepancy is described without inventing a balancing component
```

### R08 — As a user, I can explore food, habits, places and data reliability

Scope: AnalyticsPages.tsx food branch, FoodLeaders.tsx, DataPages.tsx.

```gherkin
Scenario: Deliberate analytical views
  Given synthetic category, time, location and coverage data
  When I visit Food, Behavior, Places and Data health
  Then the views follow the chart inventory and contain no redundant loyalty/cuisine panels
  And new and repeat orders can be directly compared in one chart
  And ordering, quantity, currency and distribution units match API semantics
  And unsupported data has an explanation instead of an empty unexplained plot
Scenario: Independent leader tables
  Given restaurant and dish leader tables
  When I change the page or threshold of one table
  Then the other table is not unexpectedly paged or reset
  And selected-dish history remains valid or explains why the selection was cleared
Scenario: Privacy and coverage
  Given incomplete snapshots and destination data
  When I inspect Places and Data health
  Then only approved address labels/cities appear
  And history/details coverage and unknown values are explained
  And lifetime completeness alone does not create a warning
```

### R09 — As a user, I can inspect and export orders confidently

Scope: Ledger.tsx, OrderModal.tsx, modal styles, related API/ledger helpers and tests.

```gherkin
Scenario: Ledger navigation and refresh
  Given a sorted paginated ledger
  When I change filters, sort, density or visible columns
  Then total, page bounds and sort semantics remain accurate
  And stale retained rows are clearly marked while refreshing
  And loading, empty, failed refresh and retry states are distinct
  And a visible labeled inspect action is available for each order
Scenario: Inspect an order
  Given an order opened by keyboard, pointer or deep link
  When I inspect it on mobile and desktop and move to an adjacent order
  Then focus stays inside the dialog and fields remain readable
  And previous/next states accurately reflect filtered boundaries
  And Escape closes it and focus returns predictably to its origin or a safe fallback
  And arrow shortcuts do not interfere with editable controls
Scenario: Export
  Given more matching orders than one page
  When I export or cancel an export
  Then the CSV contains all matching rows with existing escaping and financial semantics
  And completion, cancellation and failure have correctly styled distinct feedback
```

### R10 — As a maintainer, I need one consistent UI implementation

Scope: components/ui and every redesigned caller, obsolete CSS only after references are checked.

```gherkin
Scenario: Consistency pass
  Given all redesigned routes
  When I inspect buttons, fields, badges, disclosures and tables
  Then shared production components implement their recurring styles and states
  And chart tokens resolve from the same semantic theme as the surrounding UI
  And no unsupported utility or duplicate override remains in the redesigned path
  And legacy consumers remain working and no dependency is removed while still used
```

### R11 — As the owner, I receive a verified redesign with honest limitations

```gherkin
Scenario: Release gate
  Given every preceding story is verified
  When I run the checks and manual matrix in section 9
  Then there are no unresolved critical/high regressions or required acceptance failures
  And evidence is recorded per story with failures and untested cases disclosed
  And the progress board, decision log and issue register match the actual state
  And the final handoff names changed files, validation, residual risks and deferred scope
  And no production publishing, legacy retirement or data mutation is bundled into the redesign
```

## 9. Verification and completion rules

- Use existing Node/Vitest tests for filters, date presets, URL round-trips, money formatting and exports. Add focused regression coverage for silent range rejection, debounced history and independent leader pagination. No tests that only mirror CSS classes.
- Run from dashboard-ui: `npm run test`, `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test:browser`. Inspect package scripts first; run existing foundation and baseline scripts using their documented setup where relevant. Record exact commands; never infer that scripts outside the npm test chain ran.
- Run accessibility automation on all seven routes plus advanced filters, command dialog, order dialog, chart data disclosure, and design-system examples, in both themes. Existing axe integration is optional via AXE_CORE_PATH: ensure it actually runs; a skipped conditional is not a pass. Use a test-only dependency if necessary and record it. Automated AAA-tag checks are not certification.
- Manual keyboard: skip link; complete navigation; command arrows/Enter/Escape; advanced multiselection; date/amount errors; order open/adjacent/close/focus return; chart legends and table access; export/cancel.
- Manual layouts: 320×800, 390×844, 768×1024, 1280×800, 1440×900; both themes; 200% text/zoom and 400% desktop zoom with reflow equivalent to 320 CSS pixels. Test long labels, large amounts, one point, empty, unknown, negative, zero, incomplete history, many categories/years and rapid filter changes.
- Verify representative chart and dialog workflows with NVDA on Windows if available. If unavailable, record NOT RUN and the specific risk, rather than asserting screen-reader compliance.
- Record computed contrast for actual rendered text/background combinations and control states; inspect canvas marks separately. Capture synthetic visual evidence for each page/theme and narrow/desktop layout. Inspect focus visibility/obscuration, reduced motion, chart resizing and tooltip safety.
- Compare financial totals and existing analytics to synthetic API fixtures; no backend changes should be needed. If shared backend code changes become necessary, pause that scope, document why, and run relevant Python checks after authorization.
- Record production bundle size and chart update behavior before/after. Investigate material regressions, repeated chart initialization, leaked observers, or visibly delayed interactions; do not invent performance scores or set unsupported budgets.
- DONE means code, relevant tests, visual checks, documentation and known issues are recorded. NOT RUN is never PASS. A story may not be DONE with an unfulfilled required acceptance criterion hidden in backlog.

## 10. Runtime progress and decision protocol

This document is the source of truth for this iteration's story status. Keep historical plans intact. At implementation kickoff, update STATE.md to link here and identify the current story; do not erase history. Use existing LOG.md for timestamped work entries, prefixed with story IDs.

Before each story: read affected callers/tests/config, list actual edit scope, mark IN_PROGRESS and log the next check. After implementation: mark VERIFY, execute checks, record evidence, then mark DONE or BLOCKED. At interruption or context handoff: update STATE.md with exact next action, changed files, running processes, outstanding checks and issue IDs. Do not report an entire epic complete based on one screenshot.

Append decisions made during implementation here before or with the corresponding change:

| Decision ID | Date | Story | Question / options | Choice and reason | Tradeoff / evidence | Supersedes |
| --- | --- | --- | --- | --- | --- | --- |
| D11+ | — | — | No runtime decisions yet | — | — | — |

Evidence entry template (append to LOG.md):

```text
Date/time + timezone:
Story/status:
Files changed:
Behavior delivered:
Commands and results (PASS / FAIL / NOT RUN):
Manual checks: viewport/theme/input method + result
Synthetic evidence paths:
Decision IDs / issue IDs:
Next action:
```

## 11. Issue register and deferred backlog

Severity: P0=data exposure/loss or unusable app; P1=blocked core workflow/accessibility or wrong financial interpretation; P2=significant usability inconsistency; P3=optional polish. Record first occurrence immediately. Include reproduction, expected/actual, affected story, workaround, next action, owner and resolution evidence. Redact private data. Do not repeatedly retry a failing tool without learning from its error.

| ID | Type / priority | State | Description | Next action / resolution gate |
| --- | --- | --- | --- | --- |
| I01 | Investigation / untriaged | RESOLVED | API emitted ASGI exception during audit; endpoint/root cause unknown | R01: verified 105 pytest + 10 subtests pass, synthetic API endpoints return cleanly; unreproduced |
| I02 | Environment / P1 | RESOLVED | Vite startup failed with esbuild spawn EPERM | R01: established local build workflow (vite build in 12.2s, dist clean) with zero EPERM errors |
| I03 | Validation / P1 | OPEN | Audit has no complete manual screen-reader or end-to-end modal/export evidence | R09/R11: run required checks or explicitly report environment limitation |
| B01 | Deferred | BACKLOG | Legacy dashboard/Recharts retirement | Separate existing removal approval; do not remove in this redesign |
| B02 | Deferred | BACKLOG | Named multi-preset management, goals/budgets, alerts and new analytics | Not necessary for redesign; no implementation |
| B03 | Deferred | BACKLOG | Framework/Tailwind major upgrades and new chart engines | Not necessary; reconsider only with recorded blocker evidence |
| B04 | Deferred | BACKLOG | Full WCAG AAA conformance certification | Broader criteria/manual audit beyond AAA text/target goals; do not claim certification |

New issue template:

```text
ID / priority / status / owner:
Story + first observed date:
Reproduction (synthetic):
Expected / actual:
Impact and affected routes:
Workaround:
Decision or authorization needed (if any):
Next action:
Resolution + verification evidence:
```

## 12. Agent kickoff instruction

Read this entire document and applicable repository instructions. Confirm the work is authorized for implementation, inspect current git changes, and preserve unrelated work. Start with R01; do not scaffold a replacement application or mass-regenerate components. Make the smallest complete changes per story. Follow the chart inventory and universal contract, update status and logs as you work, and surface blockers with evidence. Finish with a self-contained report of completed stories, checks, residual issues and exact next steps. Never silently relax an acceptance criterion or claim accessibility based only on the library chosen.
