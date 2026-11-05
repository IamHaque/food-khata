# Synthetic browser baseline

Run on 2026-11-06 against the existing `dashboard-ui/dist`, using installed Chrome through Playwright and locally cached axe-core. The generator contains only fictional values, with masked phone labels. It generated 36 orders across 36 months and three accounts; one account spans both platforms. Three orders are cancelled, and three are intentionally unreconciled. The fixture self-check verifies the bill equation and reconciliation flags. Before navigation, the harness fulfills the dashboard JSON request with the validated fixture and aborts all requests except the local document and assets. No requests were blocked in this run. It does not read the real export or database.

Commands (PowerShell; set paths to local installations):

```powershell
python scripts/make_synthetic_data.py --self-check
python scripts/make_synthetic_data.py
ruff check scripts/make_synthetic_data.py
npm install --prefix .test-tmp/axe --no-save --no-package-lock axe-core@4.10.3
$env:AXE_CORE_PATH = (Resolve-Path .test-tmp/axe/node_modules/axe-core/axe.min.js).Path
$env:PLAYWRIGHT_CHROMIUM_EXECUTABLE = '<local Chrome executable>'
node dashboard-ui/scripts/baseline-test.mjs
```

All eight combinations completed: light and dark themes at 360, 768, 1280 and 1920 pixels wide (900 pixels high). Full-page synthetic screenshots are in the ignored `dashboard-ui/test-results/synthetic-baseline/` directory, named `<theme>-<width>.png`; the corresponding aggregate axe results are in `results.json` there. Existing `validateData` accepted the generated file. No page errors occurred.

Each combination reported two axe violations: `heading-order` (moderate, one node) and `scrollable-region-focusable` (serious, one node). Axe reported color contrast as **incomplete**, not a pass: 222 nodes at 360, 160 at 768, 141 at 1280 and 142 at 1920 in each theme require manual review. These counts are findings for this synthetic fixture and page state, not a full accessibility certification. No application fixes were made.

Root independently reran all eight baseline combinations and the existing `npm run test:browser` functional suite successfully. The existing suite now has context-level network containment: only the local document/assets are allowed, while its page-level synthetic JSON handler fulfills data requests. It passed theme persistence, filters, pagination/search, receipt, invalid-file recovery and mobile overflow checks. No application code changed.

## Computed token contrast

The harness resolves CSS tokens in the browser and computes WCAG relative-luminance ratios. Text pairs use 4.5:1 and UI indicators and chart marks use 3:1. Ratios are the same at every viewport. Values are rounded to two decimals; pass/fail uses the unrounded ratio. The focus-outline row measures the actual hard-coded focus outline as well as the ring token. Chart rows measure the six chart palette colors against the page background; individual chart surfaces, transparency, adjacent colors, and text on charts still need review.

| Pair | Threshold | Light | Dark |
| --- | ---: | ---: | ---: |
| foreground / background | 4.5 | 15.37 pass | 16.02 pass |
| card-foreground / card | 4.5 | 15.98 pass | 14.86 pass |
| muted-foreground / card | 4.5 | 4.84 pass | 6.68 pass |
| primary-foreground / primary | 4.5 | 4.19 fail | 6.64 pass |
| ring / background | 3 | 4.03 pass | 6.64 pass |
| focus outline / background | 3 | 2.99 fail | 5.95 pass |
| chart #10a67b / background | 3 | 2.99 fail | 5.95 pass |
| chart #58bda0 / background | 3 | 2.20 fail | 8.09 pass |
| chart #9bd4bf / background | 3 | 1.61 fail | 11.05 pass |
| chart #d5aa79 / background | 3 | 2.05 fail | 8.67 pass |
| chart #b8a39b / background | 3 | 2.31 fail | 7.70 pass |
| chart #777f78 / background | 3 | 3.97 pass | 4.48 pass |

Root verification used cached axe-core 4.10.3 and installed Chrome; the npm install command above creates the documented reproducible cache location. A fresh cache is not required when AXE_CORE_PATH points to an existing local copy.

