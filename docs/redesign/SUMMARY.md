# Food Khata Dashboard Redesign (Phase A Summary)

## Executive Summary
Phase A is complete. All redesign and fix stories (S-001 through S-085, and FX-01 through FX-07) are DONE on trunk. The dashboard has been transformed from the legacy single-page prototype into a modular, production-ready analytics suite covering 5 dedicated routes (`/`, `/spending`, `/food`, `/habits`, `/orders`), 5 semantic theme accents (`emerald`, `indigo`, `amber`, `rose`, `slate`), complete dark mode support, and an automated accessibility/visual regression safety net.

---

## 1. Resolution of the 12 Original Design Problems

| # | Original Problem | Resolution | Verdict |
|---|------------------|------------|---------|
| 1 | One palette only; theme control is a plain `<select>`. | 5 theme accents x light/dark modes with interactive `ThemeControl` and CSS variable mapping. | **Fixed** |
| 2 | Chart theme reads raw HSL triplets from CSS variables and passes them to ECharts as colors. | `chart-theme.ts` normalizes tokens into valid color formats; live re-theming supported across all 10 theme/mode combos. | **Fixed** |
| 3 | Hardcoded hex colors outside tokens (`Chart.tsx`, `SpendingDetails.tsx`). | All hex literals removed from components and charts; unified on semantic CSS variables and `tokenColor`. | **Fixed** |
| 4 | Duplicate token sets (`--*` and `--v2-*`) and two theme markers (`.dark`, `data-v2theme`). | Unified on single `.dark` class with standard Tailwind tokens; `data-v2theme` and `--v2-*` eliminated. | **Fixed** |
| 5 | Text mostly 10 to 12px. | Minimum 12px captions and 14px body/table text across all pages with Inter Variable font. | **Fixed** |
| 6 | Crowded header; full filter panel sits above every page. | Streamlined header with quick summary chips, global Command Palette (Ctrl+K), and collapsible FilterBar. | **Fixed** |
| 7 | No drill-down from charts to filters or orders. | Interactive ECharts click handlers synchronize selections directly into global `FilterContext`. | **Fixed** |
| 8 | Mobile has both horizontal nav and hamburger drawer. | Unified navigation on mobile: single responsive Sheet drawer, zero horizontal overflow at 390px. | **Fixed** |
| 9 | Native selects and `<details>` popovers mixed with Radix. | 100% unified on accessible Radix primitives and shadcn-style component contracts. | **Fixed** |
| 10 | Internal links (Design system, Legacy) and stub page in production. | Clean redirects for `/behavior`, `/places`, `/ledger`, `/data-health`; design system dev-only gated. | **Fixed** |
| 11 | Bill composition shown three ways; insight chips buried at bottom of Overview. | Structured metric cards, dedicated spend/fee breakdown, and prominent insights. | **Fixed** |
| 12 | Recharts and ECharts both shipped. | Recharts completely removed from dependencies and code; all 14 charts standardized on declarative `BaseChart` + ECharts 6. | **Fixed** |

---

## 2. Stories Summary

- **FX-01 (Tracker & Hygiene):** Clean install with extras, brief table linting (`brief.mjs lint`), 2fcacf4 logging, S-024 reconciliation.
- **FX-02 (Fast Verify Harness):** Strict stage order, vitest worker threads pool (~11s), instant worktree bootstrap.
- **FX-04 (Read-Only DB Safety):** Per-request DB connection safety under 20-thread concurrency, HTTP 503 JSON mapping.
- **FX-03 (Lazy Routes & Bundle Budget):** `React.lazy` routing for 5 pages, manualChunks for ECharts/React vendor, entry chunk 97.8 kB gzip (<= 250 kB budget).
- **FX-05 (BaseChart Primitive):** Declarative `<BaseChart>` wrapper with lifecycle management, 14 charts migrated, 732 lines net deleted.
- **FX-06 (Browser QA Suite):** Playwright E2E suite (`qa.spec.ts`), 0 axe WCAG 2.2 AA violations across all routes/themes, responsive viewports (390/768/1440), load < 1.5s, cross-filter < 300ms.
- **FX-07 (Visual Regression, Review Pack & Cleanup):** 40 baseline snapshots across 5 routes x 2 viewports x 2 modes x 2 accents, `capture-after.mjs`, recharts references purged, review pack.

---

## 3. Decisions Log (DEC-001 to DEC-019)
- **DEC-001:** Phase A fixes gate Phase B features.
- **DEC-012:** `check_same_thread=False` retained for readonly DB connections with FastAPI worker thread finalization; missing DB returns 503 `database_not_found`.
- **DEC-013:** `httpx` in pyproject.toml extras; brief markdown table linting.
- **DEC-014:** Vitest threads pool configuration for test performance.
- **DEC-015:** Entry bundle chunk budget 250 kB gzip enforced (measured 97.8 kB gzip).
- **DEC-016:** Declarative BaseChart wrapper architecture.
- **DEC-017:** Axe accessibility testing across emerald and indigo accents.
- **DEC-018:** Redesigned dashboard human review verdict: Looks premium, responsive, accessible, and coherent.
- **DEC-019:** Playwright visual regression baseline suite; raster captures gitignored to avoid repository bloat.

---

## 4. Deviations Log
- **DEV-001:** Tested `emerald` and `indigo` accents in automated browser/visual suites instead of `violet`, because `theme.ts` `VALID_ACCENTS` are `emerald, indigo, amber, rose, slate`.

---

## 5. Backlog & Deferred Items
- **BL-001 & BL-002:** Resolved in FX-01.
- **BL-003:** Resolved in FX-01 (S-024 validated).
- **BL-101 to BL-105:** Phase B items (scheduled sync, keyring, job retention, quotas, LAN HTTPS).
- **BL-106:** Resolved via integrated browser harness.

---

## 6. Verification Status
- Guardrails: **PASS**
- TypeScript Typecheck: **PASS**
- ESLint, check-colors, contrast-check: **PASS**
- Vitest unit tests (54 files, 979 tests): **PASS**
- Python Ruff linter: **PASS**
- Python Pytest (114 tests): **PASS**
- Browser E2E suite (68 Playwright tests + legacy runner): **PASS**
- Bundle budget (`check-bundle.mjs`): **PASS** (97.8 kB gzip <= 250 kB)
